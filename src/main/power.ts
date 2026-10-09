import { powerSaveBlocker } from 'electron'
import type { Log } from './logger'

const RELEASE_DELAY_MS = 5000

/** Holds the display awake while a track with lyrics plays, like Verci; lets it sleep once music stops. */
export class PowerKeeper {
  private blocker: number | null = null
  private releaseTimer: NodeJS.Timeout | null = null

  constructor(private readonly log: Log) {}

  update(keepAwake: boolean): void {
    if (keepAwake) {
      if (this.releaseTimer) clearTimeout(this.releaseTimer)
      this.releaseTimer = null
      if (this.blocker === null || !powerSaveBlocker.isStarted(this.blocker)) {
        this.blocker = powerSaveBlocker.start('prevent-display-sleep')
        this.log('power: holding the display awake')
      }
      return
    }
    if (this.blocker !== null && !this.releaseTimer) {
      this.releaseTimer = setTimeout(() => this.release(), RELEASE_DELAY_MS)
    }
  }

  dispose(): void {
    if (this.releaseTimer) clearTimeout(this.releaseTimer)
    this.releaseTimer = null
    this.release()
  }

  private release(): void {
    this.releaseTimer = null
    if (this.blocker === null) return
    if (powerSaveBlocker.isStarted(this.blocker)) powerSaveBlocker.stop(this.blocker)
    this.blocker = null
    this.log('power: display may sleep again')
  }
}
