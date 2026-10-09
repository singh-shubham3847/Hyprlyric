import type { PlaybackAnchor } from '@shared/types'
import { rawKey, type RawSession } from './protocol'

/** Players whose update time is this far in the future are ignored (clock skew guard). */
const FUTURE_TOLERANCE_MS = 5000
/** Without a duration, an update time older than this is considered stuck. */
const STUCK_UPDATE_MS = 10 * 60 * 1000
const END_TOLERANCE_MS = 5000

export function positionAt(anchor: PlaybackAnchor, epochMs: number): number {
  return anchor.playing ? anchor.positionMs + (epochMs - anchor.atEpochMs) * anchor.rate : anchor.positionMs
}

/**
 * Converts SMTC timeline samples into a playback anchor. Normally `pos` was true at
 * `updated`; some players leave `updated` invalid or frozen, in which case the moment
 * the position value was first observed becomes the anchor instead.
 */
export class AnchorTracker {
  private last: { key: string; pos: number; updated: number; observedAt: number } | null = null

  update(s: RawSession, sampleEpochMs: number): PlaybackAnchor {
    const key = rawKey(s)
    const playing = s.status === 'Playing'
    const rate = s.rate > 0 ? s.rate : 1
    const positionMs = Math.max(0, Math.round(s.pos * 1000))
    const durationMs = Math.max(0, (s.end - s.start) * 1000)

    const same = this.last && this.last.key === key && this.last.pos === s.pos && this.last.updated === s.updated
    const observedAt = same ? this.last!.observedAt : sampleEpochMs
    this.last = { key, pos: s.pos, updated: s.updated, observedAt }

    let atEpochMs = observedAt
    const validUpdate = s.updated > 0 && s.updated <= sampleEpochMs + FUTURE_TOLERANCE_MS
    if (validUpdate) {
      const predicted = positionMs + (playing ? (sampleEpochMs - s.updated) * rate : 0)
      const stuck =
        durationMs > 0 ? predicted > durationMs + END_TOLERANCE_MS : sampleEpochMs - s.updated > STUCK_UPDATE_MS
      if (!stuck) atEpochMs = s.updated
    }
    return { trackKey: key, positionMs, atEpochMs, playing, rate }
  }
}
