import type { PlaybackAnchor } from '@shared/types'

/** Corrections smaller than this glide instead of jumping (players report position in coarse steps). */
const JUMP_THRESHOLD_MS = 250
const SLEW_MS = 300

/**
 * Song position for the stage. Extrapolates the latest playback anchor with the wall
 * clock, glides over small corrections so words never stutter, and applies the user's
 * timing offset (positive = words later, for Bluetooth/output latency).
 */
export class SongClock {
  private anchor: PlaybackAnchor | null = null
  private offsetMs = 0
  private correction = 0
  private correctionAt = 0

  get hasAnchor(): boolean {
    return this.anchor !== null
  }

  get playing(): boolean {
    return this.anchor?.playing ?? false
  }

  get trackKey(): string | null {
    return this.anchor?.trackKey ?? null
  }

  setOffset(ms: number): void {
    this.offsetMs = ms
  }

  setAnchor(next: PlaybackAnchor, perfNow: number, epochNow: number): void {
    const prev = this.anchor
    let correction = 0
    if (prev && prev.trackKey === next.trackKey && prev.playing && next.playing) {
      const shown = raw(prev, epochNow) + this.pendingCorrection(perfNow)
      const diff = shown - raw(next, epochNow)
      if (Math.abs(diff) < JUMP_THRESHOLD_MS) correction = diff
    }
    this.anchor = next
    this.correction = correction
    this.correctionAt = perfNow
  }

  /** Current song time in ms (0 before any anchor). */
  now(perfNow: number, epochNow: number): number {
    if (!this.anchor) return 0
    return Math.round(raw(this.anchor, epochNow) + this.pendingCorrection(perfNow) - this.offsetMs)
  }

  private pendingCorrection(perfNow: number): number {
    if (!this.correction) return 0
    const remaining = 1 - (perfNow - this.correctionAt) / SLEW_MS
    return remaining > 0 ? this.correction * remaining : 0
  }
}

function raw(anchor: PlaybackAnchor, epochNow: number): number {
  return anchor.playing ? anchor.positionMs + (epochNow - anchor.atEpochMs) * anchor.rate : anchor.positionMs
}
