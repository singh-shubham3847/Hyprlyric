import { describe, expect, it } from 'vitest'
import type { RawSession } from '../src/main/media/protocol'
import { AnchorTracker, positionAt } from '../src/main/media/timeline'

const base: RawSession = {
  app: 'Spotify.exe',
  status: 'Playing',
  title: 'Song',
  artist: 'Artist',
  album: 'Album',
  pos: 12.5,
  start: 0,
  end: 200,
  updated: 1000,
  rate: 1
}

describe('AnchorTracker', () => {
  it('anchors a playing session at its reported update time', () => {
    const anchor = new AnchorTracker().update(base, 1500)
    expect(anchor).toEqual({
      trackKey: 'Spotify.exe|Song|Artist|Album',
      positionMs: 12_500,
      atEpochMs: 1000,
      playing: true,
      rate: 1
    })
  })

  it('uses the time it first saw a position when the update time is invalid', () => {
    const tracker = new AnchorTracker()
    const bad = { ...base, updated: -62_135_596_800_000 }
    expect(tracker.update(bad, 5000).atEpochMs).toBe(5000)
    expect(tracker.update(bad, 5250).atEpochMs).toBe(5000)
    expect(tracker.update({ ...bad, pos: 13.5 }, 6000).atEpochMs).toBe(6000)
  })

  it('treats an update time in the future as invalid', () => {
    expect(new AnchorTracker().update({ ...base, updated: 99_000 }, 5000).atEpochMs).toBe(5000)
  })

  it('reports paused sessions as not playing', () => {
    expect(new AnchorTracker().update({ ...base, status: 'Paused' }, 1500).playing).toBe(false)
  })

  it('falls back to the observation time when extrapolation would pass the end', () => {
    const anchor = new AnchorTracker().update({ ...base, pos: 10 }, 1000 + 400_000)
    expect(anchor.atEpochMs).toBe(401_000)
  })

  it('never reports a negative position and defaults a bad rate to 1', () => {
    const anchor = new AnchorTracker().update({ ...base, pos: -3, rate: 0 }, 1500)
    expect(anchor.positionMs).toBe(0)
    expect(anchor.rate).toBe(1)
  })
})

describe('positionAt', () => {
  it('extrapolates while playing and holds while paused', () => {
    const anchor = { trackKey: 'k', positionMs: 10_000, atEpochMs: 1000, playing: true, rate: 1 }
    expect(positionAt(anchor, 3000)).toBe(12_000)
    expect(positionAt({ ...anchor, playing: false }, 3000)).toBe(10_000)
    expect(positionAt({ ...anchor, rate: 2 }, 2000)).toBe(12_000)
  })
})
