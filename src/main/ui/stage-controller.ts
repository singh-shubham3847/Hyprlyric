import { writeFileSync } from 'node:fs'
import { BrowserWindow, app, ipcMain, powerMonitor, screen, type Display, type IpcMainEvent } from 'electron'
import { IPC, type DismissRequest, type StageSessionInfo, type StageState } from '@shared/ipc'
import type { Palette, PlaybackAnchor, StyleId, TimedLyrics, TrackInfo } from '@shared/types'
import type { Log } from '../logger'
import type { Settings } from '../settings'
import { LOAD_STUCK_MS, LockSession, alwaysOverlayVisible, idleShouldOpen, loadedWithin, type LockReason } from './stage-logic'
import { harden, loadPage, secureWebPreferences } from './windows'

type Kind = 'lock' | 'overlay'

interface StageWindow {
  kind: Kind
  win: BrowserWindow
  /** Resolves true once the page has loaded, false if loading failed. */
  ready: Promise<boolean>
}

export interface StageContent {
  track: TrackInfo | null
  lyrics: TimedLyrics | null
  artwork?: string | null
  style: StyleId
  palette: Palette
  offsetMs: number
  ambientBackdrop: boolean
  nowPlayingHud: boolean
}

export interface StageControllerDeps {
  log: Log
  settings: () => Settings
  lockWorkstation: () => void
  onLockChange?: (open: boolean) => void
}

/** An idle-opened lyrics screen closes this long after the music stops. */
const IDLE_CLOSE_AFTER_PAUSE_MS = 5000
const TICK_MS = 250

/**
 * Owns the two stage windows:
 *  - lock: opaque full-screen "lock screen" (hotkey or idle), closes on any input;
 *  - overlay: transparent click-through words above everything ("Always" mode).
 */
export class StageController {
  private lockWin: StageWindow | null = null
  private overlayWin: StageWindow | null = null
  private content: StageContent | null = null
  private anchor: PlaybackAnchor | null = null
  private session: LockSession | null = null
  private playing = false
  private hasLyrics = false
  private pausedAt: number | null = Date.now()
  private osLocked = false
  private overlayPending = false
  private quitting = false
  /** Grace-period input is logged once per session (touchpads can send dozens of events). */
  private graceLogged: LockSession | null = null
  private readonly timer: NodeJS.Timeout

  constructor(private readonly deps: StageControllerDeps) {
    ipcMain.on(IPC.stageDismiss, this.onDismiss)
    powerMonitor.on('lock-screen', this.onOsLock)
    powerMonitor.on('unlock-screen', this.onOsUnlock)
    screen.on('display-added', this.onDisplaysChanged)
    screen.on('display-removed', this.onDisplaysChanged)
    screen.on('display-metrics-changed', this.onDisplaysChanged)
    app.on('before-quit', this.onBeforeQuit)
    this.timer = setInterval(() => this.tick(), TICK_MS)
  }

  get lockOpen(): boolean {
    return this.session !== null
  }

  update(content: StageContent, facts: { playing: boolean; hasLyrics: boolean }): void {
    if (facts.playing) this.pausedAt = null
    else if (this.playing || this.pausedAt === null) this.pausedAt = Date.now()
    this.content = content
    this.playing = facts.playing
    this.hasLyrics = facts.hasLyrics
    for (const sw of this.windows()) this.sendState(sw)
    this.evaluateOverlay()
  }

  updateAnchor(anchor: PlaybackAnchor): void {
    this.anchor = anchor
    for (const sw of this.windows()) sw.win.webContents.send(IPC.stageAnchor, anchor)
  }

  /** Display or mode changed in settings. */
  settingsChanged(): void {
    for (const sw of this.windows()) this.place(sw.win)
    if (this.deps.settings().showOn === 'lock') this.destroy(this.overlayWin)
    this.evaluateOverlay()
  }

  /** Loads the lyrics screen in the background so Ctrl+Alt+L only has to reveal it. */
  prewarm(): void {
    void this.readyLockWindow().then((sw) => this.deps.log(sw ? 'stage: lyrics screen ready' : 'stage: could not prepare the lyrics screen'))
  }

  /**
   * Shows the lyrics screen as a viewer (Esc closes, never locks Windows) — used when Hyprlyric
   * is opened from its desktop icon. Unlike the hotkey, it never toggles an open screen closed.
   */
  async showLyrics(): Promise<void> {
    if (this.session) {
      // Already up: bring it forward. Still loading: the pending open shows it when ready.
      const win = this.lockWin?.win
      if (this.session.isShown && win && !win.isDestroyed()) {
        win.moveTop()
        win.focus()
      }
      return
    }
    await this.openLock('hotkey', { viewer: true })
  }

  async openLock(reason: LockReason, opts: { viewer?: boolean } = {}): Promise<void> {
    const lockOnReturn = opts.viewer ? false : this.deps.settings().lockOnReturn
    const open = this.session
    if (open) {
      if (reason !== 'hotkey') return
      if (open.reason === 'hotkey' && !open.lockOnReturn) {
        // Without locking, the hotkey toggles the lyrics screen.
        this.closeLock(false, 'Ctrl+Alt+L pressed again')
      } else if (open.reason === 'idle') {
        // The hotkey on an idle-opened screen turns it into a hotkey session. While the screen is
        // still loading, the pending open below shows the upgraded session instead.
        const upgraded = new LockSession('hotkey', Date.now(), lockOnReturn)
        this.session = upgraded
        if (open.isShown) {
          upgraded.markShown(Date.now())
          this.sendSessionInfo(upgraded)
        }
      }
      return
    }
    this.session = new LockSession(reason, Date.now(), lockOnReturn)
    const requestedAt = Date.now()
    const sw = await this.readyLockWindow()
    // While the page loaded (seconds on a cold first launch), the screen may have been closed by
    // Ctrl+Alt+L again or upgraded from idle to hotkey: whichever session is current is shown, once.
    const session = this.session
    if (!session || session.isShown) return
    if (!sw) {
      this.session = null
      this.deps.log('stage: lyrics screen could not be shown')
      return
    }
    try {
      this.place(sw.win)
      this.sendState(sw)
      if (this.anchor) sw.win.webContents.send(IPC.stageAnchor, this.anchor)
      sw.win.setAlwaysOnTop(true, 'screen-saver')
      sw.win.show()
      sw.win.moveTop()
      sw.win.focus()
      session.markShown(Date.now())
      this.sendSessionInfo(session)
      this.overlayWin?.win.hide()
    } catch (err) {
      this.session = null
      this.deps.log(`stage: failed to show the lyrics screen (${String(err)})`)
      return
    }
    const how = session.locksOnClose ? ', locks on return' : session.closesOnAnyInput ? '' : ', Esc closes'
    this.deps.log(`stage: lock screen opened (${session.reason}${how}) in ${Date.now() - requestedAt} ms`)
    this.deps.onLockChange?.(true)
  }

  /** The loaded lock window, rebuilding it once if its page failed to load or is stuck. A slow load is waited for. */
  private async readyLockWindow(): Promise<StageWindow | null> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const sw = this.ensure('lock')
      const loaded = await loadedWithin(sw.ready, LOAD_STUCK_MS)
      if (loaded && !sw.win.isDestroyed()) return sw
      this.deps.log(`stage: lyrics screen did not load (attempt ${attempt}), rebuilding it`)
      this.destroy(sw)
    }
    return null
  }

  closeLock(fromInput: boolean, why: string): void {
    const session = this.session
    if (!session) return
    this.session = null
    const win = this.lockWin?.win
    if (win && !win.isDestroyed()) win.hide()
    this.deps.log(`stage: lock screen closed (${why})`)
    this.deps.onLockChange?.(false)
    if (fromInput && session.locksOnClose) this.deps.lockWorkstation()
    this.evaluateOverlay()
  }

  /**
   * Debug/E2E helper: moves the mouse inside the lock screen, like someone coming back.
   * Dispatched as DOM events because Chromium only routes injected OS input to focused
   * windows, and Windows may refuse focus to a window opened by a timer.
   */
  async simulateReturn(): Promise<boolean> {
    const win = this.lockWin?.win
    if (!win || win.isDestroyed() || !win.isVisible()) return false
    await win.webContents.executeJavaScript(
      `for (let i = 0; i < 6; i++) window.dispatchEvent(new MouseEvent('mousemove', { screenX: 200 + i * 12, screenY: 200 + i * 8 }))`
    )
    return true
  }

  /** Debug/E2E helper: saves what the visible stage window shows. */
  async capture(file: string): Promise<boolean> {
    const visible = [this.lockWin, this.overlayWin].find((sw) => sw && !sw.win.isDestroyed() && sw.win.isVisible())
    if (!visible) return false
    const image = await visible.win.webContents.capturePage()
    writeFileSync(file, image.toPNG())
    return true
  }

  dispose(): void {
    clearInterval(this.timer)
    ipcMain.removeListener(IPC.stageDismiss, this.onDismiss)
    powerMonitor.removeListener('lock-screen', this.onOsLock)
    powerMonitor.removeListener('unlock-screen', this.onOsUnlock)
    screen.removeListener('display-added', this.onDisplaysChanged)
    screen.removeListener('display-removed', this.onDisplaysChanged)
    screen.removeListener('display-metrics-changed', this.onDisplaysChanged)
    app.removeListener('before-quit', this.onBeforeQuit)
    this.quitting = true
    this.destroy(this.lockWin)
    this.destroy(this.overlayWin)
  }

  private tick(): void {
    const now = Date.now()
    const idleSec = powerMonitor.getSystemIdleTime()
    if (this.session) {
      // When the lyrics screen has focus it sees every key and mouse move itself, and ignores
      // touchpad jitter under 12 px; the OS idle counter would react to any brush of the
      // touchpad. So the counter is only the fallback for an unfocused screen, where
      // keystrokes go to another window.
      const sawInput = this.session.observeIdle(idleSec, now)
      const focused = this.lockWin?.win.isFocused() ?? false
      if (sawInput && !focused && this.session.closesOnAnyInput) {
        this.closeLock(true, 'input: Windows saw new input (screen not focused)')
      }
      else if (this.session.reason === 'idle' && !this.playing && this.pausedFor(now) > IDLE_CLOSE_AFTER_PAUSE_MS) {
        this.closeLock(false, 'music stopped')
      }
      return
    }
    const s = this.deps.settings()
    const open = idleShouldOpen({
      idleSec,
      idleMinutes: s.idleMinutes,
      playing: this.playing,
      hasLyrics: this.hasLyrics,
      open: false,
      sessionLocked: this.osLocked
    })
    if (open) void this.openLock('idle')
    else this.evaluateOverlay(now)
  }

  private evaluateOverlay(now = Date.now()): void {
    const visible =
      !this.session &&
      !this.osLocked &&
      alwaysOverlayVisible({
        mode: this.deps.settings().showOn,
        playing: this.playing,
        hasLyrics: this.hasLyrics,
        pausedForMs: this.pausedFor(now)
      })
    const current = this.overlayWin
    if (!visible) {
      if (current && !current.win.isDestroyed() && current.win.isVisible()) current.win.hide()
      return
    }
    if (current && !current.win.isDestroyed() && current.win.isVisible()) return
    if (this.overlayPending) return
    this.overlayPending = true
    const sw = this.ensure('overlay')
    void sw.ready.then((loaded) => {
      this.overlayPending = false
      if (!loaded || sw.win.isDestroyed() || this.session) return
      this.place(sw.win)
      this.sendState(sw)
      if (this.anchor) sw.win.webContents.send(IPC.stageAnchor, this.anchor)
      sw.win.setAlwaysOnTop(true, 'screen-saver')
      sw.win.showInactive()
      this.deps.log('stage: always-on overlay shown')
      this.evaluateOverlay()
    })
  }

  private ensure(kind: Kind): StageWindow {
    const existing = kind === 'lock' ? this.lockWin : this.overlayWin
    if (existing && !existing.win.isDestroyed()) return existing

    const bounds = this.display().bounds
    const win = new BrowserWindow({
      ...bounds,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      // Windows 11 rounds frameless windows and draws a thin border by default, which let the
      // desktop show through the corners of the lyrics screen. A screen-sized stage needs neither,
      // nor the invisible resize frame that made the window wider than the screen.
      roundedCorners: false,
      accentColor: false,
      thickFrame: false,
      alwaysOnTop: true,
      focusable: kind === 'lock',
      transparent: kind === 'overlay',
      backgroundColor: kind === 'lock' ? '#000000' : '#00000000',
      title: 'Hyprlyric',
      webPreferences: secureWebPreferences()
    })
    win.setAlwaysOnTop(true, 'screen-saver')
    if (kind === 'overlay') win.setIgnoreMouseEvents(true)
    harden(win)
    win.on('close', (event) => {
      if (this.quitting) return
      // Alt+F4 on the lyrics screen counts as coming back.
      event.preventDefault()
      if (kind === 'lock') this.closeLock(true, 'closed')
      else win.hide()
    })
    win.webContents.on('render-process-gone', (_e, details) => {
      this.deps.log(`stage: renderer gone (${details.reason}), recreating on next use`)
      this.destroy(sw)
    })

    // Load timing, to diagnose a lyrics screen that is slow to appear.
    const createdAt = Date.now()
    const since = (): string => `${Date.now() - createdAt} ms`
    this.deps.log(`stage: creating ${kind} window`)
    win.webContents.once('dom-ready', () => this.deps.log(`stage: ${kind} window dom-ready after ${since()}`))
    win.webContents.on('did-fail-load', (_e, code, description) =>
      this.deps.log(`stage: ${kind} window failed to load after ${since()} (${code} ${description})`)
    )
    win.webContents.on('unresponsive', () => this.deps.log(`stage: ${kind} window unresponsive after ${since()}`))
    win.webContents.on('responsive', () => this.deps.log(`stage: ${kind} window responsive again after ${since()}`))

    const sw: StageWindow = {
      kind,
      win,
      ready: loadPage(win, 'stage').then(
        () => {
          this.deps.log(`stage: ${kind} window loaded after ${since()}`)
          if (win.isDestroyed()) return false
          this.sendState(sw)
          if (this.anchor) win.webContents.send(IPC.stageAnchor, this.anchor)
          return true
        },
        (err: unknown) => {
          this.deps.log(`stage: ${kind} window failed to load after ${since()} (${String(err)})`)
          return false
        }
      )
    }
    if (kind === 'lock') this.lockWin = sw
    else this.overlayWin = sw
    return sw
  }

  private destroy(sw: StageWindow | null): void {
    if (!sw) return
    if (this.lockWin === sw) this.lockWin = null
    if (this.overlayWin === sw) this.overlayWin = null
    if (!sw.win.isDestroyed()) sw.win.destroy()
  }

  private sendState(sw: StageWindow): void {
    if (!this.content || sw.win.isDestroyed()) return
    const c = this.content
    const state: StageState = {
      track: c.track,
      lyrics: c.lyrics,
      artwork: c.artwork,
      config: {
        style: c.style,
        palette: c.palette,
        offsetMs: c.offsetMs,
        ambientBackdrop: c.ambientBackdrop,
        nowPlayingHud: c.nowPlayingHud,
        mode: sw.kind === 'lock' ? 'lock' : 'always'
      }
    }
    sw.win.webContents.send(IPC.stageState, state)
  }

  private windows(): StageWindow[] {
    return [this.lockWin, this.overlayWin].filter((sw): sw is StageWindow => !!sw && !sw.win.isDestroyed())
  }

  private display(): Display {
    const id = this.deps.settings().displayId
    return screen.getAllDisplays().find((d) => d.id === id) ?? screen.getPrimaryDisplay()
  }

  private place(win: BrowserWindow): void {
    if (!win.isDestroyed()) win.setBounds(this.display().bounds)
  }

  private pausedFor(now: number): number {
    return this.pausedAt === null ? 0 : now - this.pausedAt
  }

  private readonly onDismiss = (event: IpcMainEvent, request: unknown): void => {
    const lock = this.lockWin
    const session = this.session
    if (!session || !lock || event.sender !== lock.win.webContents) return
    const r = typeof request === 'object' && request !== null ? (request as Partial<DismissRequest>) : {}
    const what = typeof r.detail === 'string' ? r.detail.slice(0, 200) : 'unknown'

    // Esc always closes (and only locks Windows when locking was asked for).
    if (r.kind === 'escape') {
      if (session.isShown) this.closeLock(true, 'Esc')
      return
    }
    // A watch-only screen ignores stray mouse/touchpad/keyboard input.
    if (!session.closesOnAnyInput) return
    if (session.armed(Date.now())) this.closeLock(true, `input on the lyrics screen: ${what}`)
    else if (this.graceLogged !== session) {
      this.graceLogged = session
      this.deps.log(`stage: ignored input during grace period (${what})`)
    }
  }

  private sendSessionInfo(session: LockSession): void {
    const info: StageSessionInfo = {
      hint: session.reason === 'hotkey' && !session.closesOnAnyInput ? 'Press Esc to close' : null
    }
    const win = this.lockWin?.win
    if (win && !win.isDestroyed()) win.webContents.send(IPC.stageSession, info)
  }

  private readonly onOsLock = (): void => {
    this.osLocked = true
    if (this.session) this.closeLock(false, 'Windows locked')
    this.evaluateOverlay()
  }

  private readonly onOsUnlock = (): void => {
    this.osLocked = false
    this.evaluateOverlay()
  }

  private readonly onDisplaysChanged = (): void => {
    for (const sw of this.windows()) this.place(sw.win)
  }

  private readonly onBeforeQuit = (): void => {
    this.quitting = true
  }
}
