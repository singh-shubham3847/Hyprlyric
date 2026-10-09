import type { ColorRole, Palette, PlaybackAnchor, ShowOn, StyleId, TimedLyrics, TrackInfo } from './types'

export const IPC = {
  stageState: 'stage:state',
  stageAnchor: 'stage:anchor',
  stageDismiss: 'stage:dismiss',
  stageSession: 'stage:session',
  stageSnapshot: 'stage:snapshot',
  stageSnapshotDone: 'stage:snapshot-done',
  colorsGet: 'colors:get',
  colorsSet: 'colors:set',
  colorsAutoSync: 'colors:auto-sync',
  colorsReset: 'colors:reset',
  colorsState: 'colors:state'
} as const

export interface StageConfig {
  style: StyleId
  mode: ShowOn
  palette: Palette
  offsetMs: number
  ambientBackdrop: boolean
  nowPlayingHud: boolean
}

/** Everything the stage needs besides the moving playback clock. */
export interface StageState {
  track: TrackInfo | null
  lyrics: TimedLyrics | null
  artwork?: string | null
  config: StageConfig
}

/** Snapshot mode: render exactly this moment, then acknowledge with the same id. */
export interface SnapshotRequest {
  id: number
  songMs: number
  wallMs: number
}

/** Input on the lyrics screen: Esc always means "close"; anything else only closes some sessions. */
export interface DismissRequest {
  kind: 'escape' | 'input'
  /** What happened, for the log. */
  detail: string
}

/** Sent when the lyrics screen opens. */
export interface StageSessionInfo {
  /** A short on-screen tip (e.g. "Press Esc to close"), or null. */
  hint: string | null
}

export interface ColorsState {
  autoSync: boolean
  colors: Record<ColorRole, string>
  /** What the stage is drawing right now (album palette when Auto Sync is on). */
  effective: Palette
}

export interface StageApi {
  onState(cb: (state: StageState) => void): () => void
  onAnchor(cb: (anchor: PlaybackAnchor) => void): () => void
  onSnapshot(cb: (req: SnapshotRequest) => void): () => void
  onSession(cb: (info: StageSessionInfo) => void): () => void
  snapshotDone(id: number): void
  /** Input on the lyrics screen; the main process decides whether it closes the screen. */
  dismiss(request: DismissRequest): void
}

export interface ColorsApi {
  get(): Promise<ColorsState>
  set(role: ColorRole, hex: string): void
  setAutoSync(on: boolean): void
  reset(): void
  onState(cb: (state: ColorsState) => void): () => void
}

export interface LyricsAppApi {
  stage: StageApi
  colors: ColorsApi
}
