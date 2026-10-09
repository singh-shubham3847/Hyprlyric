import '../css/stage.css'
import { DEFAULT_PALETTE } from '@shared/palette-defaults'
import type { StageState } from '@shared/ipc'
import type { Palette, ShowOn, StyleId } from '@shared/types'
import { SongClock } from './clock'
import { AmbientBackdrop } from './backdrop'
import { LockClock } from './lock-clock'
import { buildModel, msUntilNextWord, type LyricsModel } from './model'
import { NowPlayingHud } from './now-playing'
import { createStyle } from './styles/registry'
import type { StageStyle } from './styles/types'

const api = window.lyricsApp.stage
const root = document.getElementById('stage')!
const clock = new SongClock()
const lockClock = new LockClock(document.body)
const backdrop = new AmbientBackdrop(document.body)
const nowPlaying = new NowPlayingHud(document.body)

let style: StageStyle | null = null
let styleId: StyleId | null = null
let model: LyricsModel | null = null
let lyricsSignature = ''
let palette: Palette = { ...DEFAULT_PALETTE }
let mode: ShowOn = 'lock'
let snapshotMode = false
let loopRunning = false
let loopTimeout: ReturnType<typeof setTimeout> | null = null
let pendingState: StageState | null = null

// Text is measured on a canvas, so the bundled font must be ready before the first layout.
const fontsReady = Promise.all([
  document.fonts.load('700 100px "Inter Variable"'),
  document.fonts.load('600 100px "Inter Variable"')
]).then(
  () => undefined,
  () => undefined
)

function signature(state: StageState): string {
  const l = state.lyrics
  if (!l) return `${state.track?.key ?? ''}|none`
  const last = l.lines.at(-1)
  return `${state.track?.key ?? ''}|${l.lines.length}|${l.lines[0]?.start ?? 0}|${last?.end ?? 0}|${l.wordTiming}`
}

function applyPaletteVars(p: Palette): void {
  const s = document.documentElement.style
  s.setProperty('--lyric', p.lyric)
  s.setProperty('--highlight', p.highlight)
  s.setProperty('--highlight-text', p.highlightText)
  s.setProperty('--secondary', p.secondary)
}

function applyState(state: StageState): void {
  mode = state.config.mode
  document.body.dataset.mode = mode
  lockClock.setVisible(mode === 'lock')
  palette = state.config.palette
  applyPaletteVars(palette)
  clock.setOffset(state.config.offsetMs)

  const sig = signature(state)
  const lyricsChanged = sig !== lyricsSignature
  if (lyricsChanged) {
    lyricsSignature = sig
    model = state.lyrics ? buildModel(state.lyrics) : null
  }

  if (state.config.style !== styleId || !style) {
    style?.destroy()
    style = createStyle(state.config.style)
    styleId = state.config.style
    style.mount(root)
    style.setLyrics(model)
  } else if (lyricsChanged) {
    style.setLyrics(model)
  }
  style.setMode(mode)
  style.setPalette(palette)
  backdrop.setState(state.artwork ?? null, state.config.ambientBackdrop && mode === 'lock')
  nowPlaying.setState(state.track, state.artwork ?? null, state.config.nowPlayingHud && mode === 'lock')
  startLoop()
}

/**
 * Frames per second: full rate only while a word is popping in; the slow ambient drift
 * looks the same at a lower rate and costs a fraction of the power. The desktop overlay
 * is capped lower because Windows composites transparent full-screen windows expensively.
 */
const FRAME_RATE: Record<ShowOn, { busy: number; idle: number }> = {
  lock: { busy: 60, idle: 24 },
  always: { busy: 30, idle: 15 }
}

function render(songMs: number, wallMs: number): boolean {
  const busy = style?.frame({ songMs, wallMs, width: window.innerWidth, height: window.innerHeight }) ?? false
  if (mode === 'lock') {
    lockClock.update(Date.now())
    nowPlaying.update(songMs)
  }
  return busy
}

function stopLoop(): void {
  loopRunning = false
  if (loopTimeout !== null) {
    clearTimeout(loopTimeout)
    loopTimeout = null
  }
}

function loop(): void {
  if (snapshotMode || document.hidden) {
    stopLoop()
    return
  }
  const started = performance.now()
  const songMs = clock.now(started, Date.now())
  const busy = render(songMs, started)
  const rates = style?.fps ?? FRAME_RATE[mode]
  const fps = Math.min(rates[busy ? 'busy' : 'idle'], 60)

  // If not playing and not busy animating, sleep at low power (5 FPS) instead of running continuous RAF
  if (!clock.playing && !busy && mode !== 'always') {
    loopTimeout = setTimeout(() => {
      loopTimeout = null
      if (loopRunning && !document.hidden) requestAnimationFrame(loop)
    }, 200)
    return
  }

  // Cap frame rate on high refresh displays (144Hz/165Hz/240Hz) to prevent massive GPU/CPU churn
  const frameBudget = 1000 / fps
  const elapsed = performance.now() - started
  let wait = frameBudget - elapsed - 4

  if (model && clock.playing) {
    const until = msUntilNextWord(model, songMs) - 12
    if (until > 0) wait = Math.min(wait, until)
  }

  if (wait > 2) {
    loopTimeout = setTimeout(() => {
      loopTimeout = null
      if (loopRunning && !document.hidden) requestAnimationFrame(loop)
    }, wait)
  } else {
    requestAnimationFrame(loop)
  }
}

function startLoop(): void {
  if (loopRunning || snapshotMode || document.hidden) return
  loopRunning = true
  if (loopTimeout !== null) {
    clearTimeout(loopTimeout)
    loopTimeout = null
  }
  requestAnimationFrame(loop)
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    startLoop()
  } else {
    stopLoop()
  }
})

const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()))

api.onState((state) => {
  pendingState = state
  void fontsReady.then(() => {
    if (!pendingState) return
    const s = pendingState
    pendingState = null
    applyState(s)
  })
})

api.onAnchor((anchor) => {
  clock.setAnchor(anchor, performance.now(), Date.now())
  startLoop()
})

api.onSnapshot((req) => {
  snapshotMode = true
  void fontsReady.then(async () => {
    if (pendingState) {
      applyState(pendingState)
      pendingState = null
    }
    await style?.ready?.()
    render(req.songMs, req.wallMs)
    await nextFrame()
    await nextFrame()
    api.snapshotDone(req.id)
  })
})

// Lock mode: any real input closes the screen (the main process applies a grace period).
let travelled = 0
let lastMove: { x: number; y: number; at: number } | null = null
window.addEventListener('mousemove', (e) => {
  if (mode !== 'lock') return
  const from = lastMove
  if (from && e.timeStamp - from.at < 600) travelled += Math.hypot(e.screenX - from.x, e.screenY - from.y)
  else travelled = 0
  lastMove = { x: e.screenX, y: e.screenY, at: e.timeStamp }
  if (travelled > 12) {
    api.dismiss({
      kind: 'input',
      detail: `mousemove ${Math.round(travelled)}px (${from?.x},${from?.y})→(${e.screenX},${e.screenY}) trusted=${e.isTrusted}`
    })
    travelled = 0
  }
})
window.addEventListener('keydown', (e) => {
  if (mode !== 'lock') return
  if (e.key === 'Escape') api.dismiss({ kind: 'escape', detail: 'Esc' })
  else api.dismiss({ kind: 'input', detail: `keydown key=${e.key} repeat=${e.repeat} trusted=${e.isTrusted}` })
})
for (const type of ['mousedown', 'wheel', 'touchstart'] as const) {
  window.addEventListener(
    type,
    (e) => {
      if (mode === 'lock') api.dismiss({ kind: 'input', detail: `${type} trusted=${e.isTrusted}` })
    },
    { passive: true }
  )
}

// "Press Esc to close" fades in and out when a lyrics screen opens that only Esc closes.
const hint = document.createElement('div')
hint.className = 'stage-hint'
document.body.append(hint)
api.onSession(({ hint: text }) => {
  hint.classList.remove('show')
  if (!text) return
  hint.textContent = text
  void hint.offsetWidth // restart the fade animation
  hint.classList.add('show')
})
