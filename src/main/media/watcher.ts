import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { PlaybackAnchor, TrackInfo } from '@shared/types'
import { parseBridgeLine, rawKey, type BridgeMessage } from './protocol'
import { selectSession, toTrackInfo } from './select'
import { AnchorTracker, positionAt } from './timeline'

export interface ArtworkEvent {
  key: string
  mime: string
  data: Buffer
}

export interface HealthEvent {
  ok: boolean
  message?: string
}

interface WatcherEvents {
  track: [TrackInfo | null]
  anchor: [PlaybackAnchor]
  artwork: [ArtworkEvent]
  health: [HealthEvent]
}

export interface MediaWatcherOptions {
  scriptPath: string
  log: (message: string) => void
  allPlayers: () => boolean
  powershellPath?: string
}

const MAX_RESTART_DELAY_MS = 30_000
const ART_CACHE_SIZE = 12
/** Anchors closer than this to the previous prediction are not worth re-sending. */
const ANCHOR_EPSILON_MS = 40

const defaultPowershell = (): string =>
  join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')

/**
 * Supervises `smtc-bridge.ps1` (Windows PowerShell 5.1) and turns its snapshots into
 * `track` / `anchor` / `artwork` events for the one session Hyprlyric follows.
 */
export class MediaWatcher extends EventEmitter<WatcherEvents> {
  private child: ChildProcess | null = null
  private stopped = true
  private restartTimer: NodeJS.Timeout | null = null
  private restartDelay = 1000
  private failures = 0
  private followedKey: string | null = null
  private lastAnchor: PlaybackAnchor | null = null
  private lastSnapshot: Extract<BridgeMessage, { type: 'sessions' }> | null = null
  private readonly tracker = new AnchorTracker()
  private readonly art = new Map<string, { mime: string; data: Buffer }>()
  private readonly errorTimes = new Map<string, number>()
  private track: TrackInfo | null = null

  constructor(private readonly opts: MediaWatcherOptions) {
    super()
  }

  get currentTrack(): TrackInfo | null {
    return this.track
  }

  get currentAnchor(): PlaybackAnchor | null {
    return this.lastAnchor
  }

  artworkFor(key: string): ArtworkEvent | null {
    const art = this.art.get(key)
    return art ? { key, ...art } : null
  }

  start(): void {
    if (!this.stopped) return
    this.stopped = false
    this.spawnBridge()
  }

  stop(): void {
    this.stopped = true
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.restartTimer = null
    this.child?.kill()
    this.child = null
  }

  /** Re-evaluates which session to follow (e.g. after the "other players" setting changes). */
  refreshPolicy(): void {
    if (this.lastSnapshot) this.apply(this.lastSnapshot)
  }

  private spawnBridge(): void {
    const exe = this.opts.powershellPath ?? defaultPowershell()
    const args = [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      this.opts.scriptPath,
      '-ParentPid',
      String(process.pid)
    ]
    let child: ChildProcess
    try {
      child = spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (err) {
      this.opts.log(`bridge: spawn failed (${String(err)})`)
      this.scheduleRestart()
      return
    }
    this.child = child

    createInterface({ input: child.stdout!, crlfDelay: Number.POSITIVE_INFINITY }).on('line', (line) =>
      this.handleLine(line)
    )
    createInterface({ input: child.stderr!, crlfDelay: Number.POSITIVE_INFINITY }).on('line', (line) => {
      if (line.trim()) this.logThrottled(`bridge stderr: ${line.trim()}`)
    })
    child.once('error', (err) => this.opts.log(`bridge: process error (${err.message})`))
    child.once('exit', (code) => {
      if (this.child === child) this.child = null
      if (this.stopped) return
      this.opts.log(`bridge: exited with code ${code ?? 'null'}`)
      this.scheduleRestart()
    })
  }

  private scheduleRestart(): void {
    if (this.stopped) return
    this.failures++
    if (this.failures >= 2) {
      this.emit('health', { ok: false, message: 'Cannot read Windows media sessions (retrying)' })
    }
    const delay = this.restartDelay
    this.restartDelay = Math.min(this.restartDelay * 2, MAX_RESTART_DELAY_MS)
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      if (!this.stopped) this.spawnBridge()
    }, delay)
  }

  private handleLine(line: string): void {
    const msg = parseBridgeLine(line)
    if (!msg) return
    switch (msg.type) {
      case 'hello':
        this.failures = 0
        this.restartDelay = 1000
        this.opts.log(`bridge: hello (PowerShell ${msg.ps})`)
        this.emit('health', { ok: true })
        break
      case 'sessions':
        this.lastSnapshot = msg
        this.apply(msg)
        break
      case 'art':
        this.storeArt(msg.key, msg.mime, Buffer.from(msg.data, 'base64'))
        break
      case 'error':
        this.logThrottled(`bridge: ${msg.message}`)
        break
    }
  }

  private storeArt(key: string, mime: string, data: Buffer): void {
    this.art.delete(key)
    this.art.set(key, { mime, data })
    while (this.art.size > ART_CACHE_SIZE) this.art.delete(this.art.keys().next().value!)
    if (key === this.followedKey) this.emit('artwork', { key, mime, data })
  }

  private apply(snapshot: Extract<BridgeMessage, { type: 'sessions' }>): void {
    const session = selectSession(snapshot, this.followedKey, this.opts.allPlayers())
    const key = session ? rawKey(session) : null

    if (key !== this.followedKey) {
      this.followedKey = key
      this.lastAnchor = null
      this.track = session ? toTrackInfo(session) : null
      this.emit('track', this.track)
      const art = key ? this.artworkFor(key) : null
      if (art) this.emit('artwork', art)
    }
    if (!session) return

    const anchor = this.tracker.update(session, snapshot.t)
    if (this.anchorChanged(anchor, snapshot.t)) {
      this.lastAnchor = anchor
      this.emit('anchor', anchor)
    }
  }

  private anchorChanged(next: PlaybackAnchor, at: number): boolean {
    const prev = this.lastAnchor
    if (!prev) return true
    if (prev.trackKey !== next.trackKey || prev.playing !== next.playing || prev.rate !== next.rate) return true
    return Math.abs(positionAt(prev, at) - positionAt(next, at)) > ANCHOR_EPSILON_MS
  }

  private logThrottled(message: string): void {
    const now = Date.now()
    if (now - (this.errorTimes.get(message) ?? 0) < 30_000) return
    this.errorTimes.set(message, now)
    this.opts.log(message)
  }
}
