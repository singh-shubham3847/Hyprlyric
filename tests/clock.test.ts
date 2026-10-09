import { describe, expect, it } from 'vitest'
import { SongClock } from '../src/renderer/src/stage/clock'
import type { PlaybackAnchor } from '../src/shared/types'

const anchor = (over: Partial<PlaybackAnchor> = {}): PlaybackAnchor => ({
  trackKey: 'k',
  positionMs: 10_000,
  atEpochMs: 1000,
  playing: true,
  rate: 1,
  ...over
})

describe('SongClock', () => {
  it('reports nothing before the first anchor', () => {
    const clock = new SongClock()
    expect(clock.hasAnchor).toBe(false)
    expect(clock.now(0, 5000)).toBe(0)
  })

  it('extrapolates while playing and freezes while paused', () => {
    const clock = new SongClock()
    clock.setAnchor(anchor(), 0, 1000)
    expect(clock.now(2000, 3000)).toBe(12_000)
    clock.setAnchor(anchor({ playing: false }), 2000, 3000)
    expect(clock.now(4000, 5000)).toBe(10_000)
    expect(clock.playing).toBe(false)
  })

  it('applies the user offset (positive shows words later)', () => {
    const clock = new SongClock()
    clock.setAnchor(anchor(), 0, 1000)
    clock.setOffset(200)
    expect(clock.now(2000, 3000)).toBe(11_800)
  })

  it('slews small corrections over 300 ms instead of jumping', () => {
    const clock = new SongClock()
    clock.setAnchor(anchor(), 0, 1000)
    expect(clock.now(1000, 2000)).toBe(11_000)
    // The player now says we are 100 ms further along than predicted.
    clock.setAnchor(anchor({ positionMs: 11_100, atEpochMs: 2000 }), 1000, 2000)
    expect(clock.now(1000, 2000)).toBe(11_000)
    expect(clock.now(1150, 2150)).toBe(11_200)
    expect(clock.now(1300, 2300)).toBe(11_400)
    expect(clock.now(1600, 2600)).toBe(11_700)
  })

  it('jumps immediately on seeks and track changes', () => {
    const clock = new SongClock()
    clock.setAnchor(anchor(), 0, 1000)
    clock.setAnchor(anchor({ positionMs: 13_000, atEpochMs: 2000 }), 1000, 2000)
    expect(clock.now(1000, 2000)).toBe(13_000)
    clock.setAnchor(anchor({ trackKey: 'other', positionMs: 11_050, atEpochMs: 2000 }), 1000, 2000)
    expect(clock.now(1000, 2000)).toBe(11_050)
  })
})
