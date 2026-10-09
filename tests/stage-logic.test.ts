import { describe, expect, it, vi } from 'vitest'
import {
  GRACE_MS,
  LOAD_STUCK_MS,
  LockSession,
  alwaysOverlayVisible,
  idleShouldOpen,
  loadedWithin
} from '../src/main/ui/stage-logic'

describe('loadedWithin', () => {
  it('passes the load result through when the page settles in time', async () => {
    await expect(loadedWithin(Promise.resolve(true), LOAD_STUCK_MS)).resolves.toBe(true)
    await expect(loadedWithin(Promise.resolve(false), LOAD_STUCK_MS)).resolves.toBe(false)
  })

  it('waits through a slow first launch instead of rebuilding the page after a few seconds', async () => {
    vi.useFakeTimers()
    try {
      let finish!: (ok: boolean) => void
      const result = loadedWithin(new Promise<boolean>((resolve) => (finish = resolve)), LOAD_STUCK_MS)
      await vi.advanceTimersByTimeAsync(8000)
      finish(true)
      await expect(result).resolves.toBe(true)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('treats a page still loading after the limit as stuck', async () => {
    vi.useFakeTimers()
    try {
      const result = loadedWithin(new Promise<boolean>(() => {}), LOAD_STUCK_MS)
      await vi.advanceTimersByTimeAsync(LOAD_STUCK_MS)
      await expect(result).resolves.toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('alwaysOverlayVisible', () => {
  const facts = { mode: 'always' as const, playing: true, hasLyrics: true, pausedForMs: 0 }

  it('shows while a track with lyrics plays', () => {
    expect(alwaysOverlayVisible(facts)).toBe(true)
  })

  it('stays up briefly through a pause, then hides', () => {
    expect(alwaysOverlayVisible({ ...facts, playing: false, pausedForMs: 2000 })).toBe(true)
    expect(alwaysOverlayVisible({ ...facts, playing: false, pausedForMs: 3500 })).toBe(false)
  })

  it('never shows in lock mode or without lyrics', () => {
    expect(alwaysOverlayVisible({ ...facts, mode: 'lock' })).toBe(false)
    expect(alwaysOverlayVisible({ ...facts, hasLyrics: false })).toBe(false)
  })
})

describe('LockSession', () => {
  it('locks Windows on close only for a hotkey session with locking turned on', () => {
    expect(new LockSession('hotkey', 0, true).locksOnClose).toBe(true)
    expect(new LockSession('hotkey', 0, false).locksOnClose).toBe(false)
    expect(new LockSession('idle', 0, true).locksOnClose).toBe(false)
  })

  it('lets a hotkey viewer session ignore stray input (only Esc closes it)', () => {
    expect(new LockSession('hotkey', 0, false).closesOnAnyInput).toBe(false)
    expect(new LockSession('hotkey', 0, true).closesOnAnyInput).toBe(true)
    expect(new LockSession('idle', 0, false).closesOnAnyInput).toBe(true)
  })

  it('knows when it has been shown', () => {
    const s = new LockSession('hotkey', 0, false)
    expect(s.isShown).toBe(false)
    s.markShown(10)
    expect(s.isShown).toBe(true)
  })

  it('is not armed until the screen is actually visible, then waits out the grace period', () => {
    const s = new LockSession('hotkey', 0)
    expect(s.armed(5_000)).toBe(false)
    s.markShown(5_000)
    expect(s.armed(5_000 + GRACE_MS - 1)).toBe(false)
    expect(s.armed(5_000 + GRACE_MS)).toBe(true)
  })

  it('does not close when the only input is releasing the hotkey (regression: closed ~1.3 s after opening)', () => {
    // Ctrl+Alt+L fires on key-down; the keys are released ~300 ms later, after the screen opened.
    const s = new LockSession('hotkey', 0)
    s.markShown(150)
    for (const release of [50, 300, 700, 1100]) {
      const session = new LockSession('hotkey', 0)
      session.markShown(150)
      for (let t = 250; t <= 8000; t += 250) {
        const idleSec = Math.floor(Math.max(0, t - release) / 1000)
        expect(session.observeIdle(idleSec, t), `release ${release} ms: closed at ${t} ms (idle ${idleSec}s)`).toBe(false)
      }
    }
    expect(s.armed(150 + GRACE_MS)).toBe(true)
  })

  it('closes on fresh input after the grace period', () => {
    const s = new LockSession('hotkey', 0)
    s.markShown(0)
    expect(s.observeIdle(0, 250)).toBe(false)
    expect(s.observeIdle(1, 1_250)).toBe(false)
    expect(s.observeIdle(2, 2_250)).toBe(false)
    expect(s.observeIdle(0, 2_500)).toBe(true)
  })

  it('ignores input during the grace period', () => {
    const s = new LockSession('hotkey', 0)
    s.markShown(0)
    expect(s.observeIdle(5, 250)).toBe(false)
    expect(s.observeIdle(0, 500)).toBe(false)
    expect(s.observeIdle(0, 1_500)).toBe(false)
    expect(s.observeIdle(1, 2_000)).toBe(false)
    expect(s.observeIdle(0, 2_250)).toBe(true)
  })

  it('works for sessions opened after a long idle period', () => {
    const s = new LockSession('idle', 0)
    s.markShown(100)
    expect(s.observeIdle(125, 250)).toBe(false)
    expect(s.observeIdle(130, 5_000)).toBe(false)
    expect(s.observeIdle(0, 10_500)).toBe(true)
  })
})

describe('idleShouldOpen', () => {
  const base = { idleSec: 130, idleMinutes: 2 as const, playing: true, hasLyrics: true, open: false, sessionLocked: false }

  it('opens after the configured idle time during playback', () => {
    expect(idleShouldOpen(base)).toBe(true)
    expect(idleShouldOpen({ ...base, idleSec: 100 })).toBe(false)
  })

  it('stays closed when off, paused, without lyrics, already open or while Windows is locked', () => {
    expect(idleShouldOpen({ ...base, idleMinutes: 0 })).toBe(false)
    expect(idleShouldOpen({ ...base, playing: false })).toBe(false)
    expect(idleShouldOpen({ ...base, hasLyrics: false })).toBe(false)
    expect(idleShouldOpen({ ...base, open: true })).toBe(false)
    expect(idleShouldOpen({ ...base, sessionLocked: true })).toBe(false)
  })
})
