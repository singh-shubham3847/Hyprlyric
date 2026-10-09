import type { ShowOn } from '@shared/types'

/** Input right after the lyrics screen opens (e.g. releasing the hotkey) is ignored this long. */
export const GRACE_MS = 1200
/** "Always" mode keeps the words up this long after a pause before hiding. */
export const PAUSE_HIDE_MS = 3000
/**
 * A lyrics page still loading after this long is treated as stuck and rebuilt. Loads normally take
 * ~200 ms, but the first launch of a newly downloaded copy can take many seconds while antivirus
 * scans the app's files, and rebuilding the page then only starts the wait over.
 */
export const LOAD_STUCK_MS = 30_000

/** The page's load result, or false if it is still loading after `ms`. The timer never outlives the race. */
export function loadedWithin(ready: Promise<boolean>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const stuck = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms)
  })
  return Promise.race([ready, stuck]).finally(() => clearTimeout(timer))
}

export interface StageFacts {
  mode: ShowOn
  playing: boolean
  hasLyrics: boolean
  pausedForMs: number
}

export function alwaysOverlayVisible(f: StageFacts): boolean {
  return f.mode === 'always' && f.hasLyrics && (f.playing || f.pausedForMs < PAUSE_HIDE_MS)
}

export type LockReason = 'hotkey' | 'idle'

/** One showing of the lock-style lyrics screen. */
export class LockSession {
  private shownAt: number | null = null
  private lastIdleSec: number | null = null

  constructor(
    readonly reason: LockReason,
    readonly openedAt: number,
    /** Setting "Lock Windows when I come back" at the moment the screen opened. */
    readonly lockOnReturn = true
  ) {}

  /** Only a hotkey session with locking turned on locks Windows; the idle screen never does. */
  get locksOnClose(): boolean {
    return this.reason === 'hotkey' && this.lockOnReturn
  }

  /**
   * The idle screen and a locking hotkey session close on any input (screensaver-like).
   * A hotkey session without locking is for watching: stray input is ignored, Esc closes it.
   */
  get closesOnAnyInput(): boolean {
    return this.reason === 'idle' || this.lockOnReturn
  }

  get isShown(): boolean {
    return this.shownAt !== null
  }

  /** The grace period starts when the screen is actually visible, not when it was requested. */
  markShown(now: number): void {
    this.shownAt ??= now
  }

  armed(now: number): boolean {
    return this.shownAt !== null && now - this.shownAt >= GRACE_MS
  }

  /**
   * Feed every OS idle sample (whole seconds). Returns true when the counter went
   * backwards after the grace period: that only happens on genuinely new input.
   * (Comparing idle time with time-since-opening misfired: releasing the hotkey itself
   * happens *after* opening, which made the screen close ~1.3 s in.)
   */
  observeIdle(idleSec: number, now: number): boolean {
    const previous = this.lastIdleSec
    this.lastIdleSec = idleSec
    return this.armed(now) && previous !== null && idleSec < previous
  }
}

export interface IdleFacts {
  idleSec: number
  idleMinutes: number
  playing: boolean
  hasLyrics: boolean
  open: boolean
  sessionLocked: boolean
}

export function idleShouldOpen(f: IdleFacts): boolean {
  return (
    f.idleMinutes > 0 && f.playing && f.hasLyrics && !f.open && !f.sessionLocked && f.idleSec >= f.idleMinutes * 60
  )
}
