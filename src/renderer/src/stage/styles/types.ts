import type { Palette, ShowOn } from '@shared/types'
import type { LyricsModel } from '../model'

export interface FrameInfo {
  /** Song time in ms (already offset-corrected). */
  songMs: number
  /** Monotonic wall time in ms, for ambient motion that continues while paused. */
  wallMs: number
  width: number
  height: number
}

/**
 * A display style. `frame` must be a pure function of its inputs plus the lyrics,
 * palette and size, so seeking, pausing and snapshots always render correctly.
 */
export interface StageStyle {
  mount(root: HTMLElement): void
  setLyrics(model: LyricsModel | null): void
  setPalette(palette: Palette): void
  setMode(mode: ShowOn): void
  /**
   * Draws one frame. Returns true while a transition is running (needs full frame rate);
   * false when only slow ambient motion is left, so the stage can save power.
   */
  frame(frame: FrameInfo): boolean
  /** Target frame rates (FPS) when busy vs idle. */
  readonly fps?: { busy: number; idle: number }
  /** Resolves once async assets (icons, fonts) are loaded; snapshot mode waits for it. */
  ready?(): Promise<void>
  destroy(): void
}
