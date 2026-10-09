import type { TrackInfo } from '@shared/types'

const formatTime = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}:${rem.toString().padStart(2, '0')}`
}

/**
 * Bottom-left Now-Playing card on the full-screen lyrics stage.
 * Displays album artwork, track title, artist, progress timeline, and song duration.
 */
export class NowPlayingHud {
  private readonly root: HTMLDivElement
  private readonly artImg: HTMLImageElement
  private readonly artFallback: HTMLDivElement
  private readonly titleEl: HTMLDivElement
  private readonly artistEl: HTMLDivElement
  private readonly progressFill: HTMLDivElement
  private readonly timeEl: HTMLDivElement

  private track: TrackInfo | null = null
  private durationSec = 0
  private lastRenderedSec = -1
  private enabled = true

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div')
    this.root.className = 'lock-now-playing'

    const artWrap = document.createElement('div')
    artWrap.className = 'now-playing-art-wrap'

    this.artImg = document.createElement('img')
    this.artImg.className = 'now-playing-art'
    this.artImg.alt = ''

    this.artFallback = document.createElement('div')
    this.artFallback.className = 'now-playing-fallback'
    this.artFallback.textContent = '♪'

    artWrap.append(this.artImg, this.artFallback)

    const meta = document.createElement('div')
    meta.className = 'now-playing-meta'

    this.titleEl = document.createElement('div')
    this.titleEl.className = 'now-playing-title'

    this.artistEl = document.createElement('div')
    this.artistEl.className = 'now-playing-artist'

    const progressWrap = document.createElement('div')
    progressWrap.className = 'now-playing-progress'

    const progressBar = document.createElement('div')
    progressBar.className = 'now-playing-bar'

    this.progressFill = document.createElement('div')
    this.progressFill.className = 'now-playing-fill'
    progressBar.append(this.progressFill)

    this.timeEl = document.createElement('div')
    this.timeEl.className = 'now-playing-time'

    progressWrap.append(progressBar, this.timeEl)
    meta.append(this.titleEl, this.artistEl, progressWrap)

    this.root.append(artWrap, meta)
    parent.append(this.root)
  }

  setState(track: TrackInfo | null, artworkUrl: string | null, enabled: boolean): void {
    this.enabled = enabled
    this.track = track
    const visible = enabled && !!track && !!track.title
    this.root.classList.toggle('visible', visible)

    if (!visible || !track) {
      this.durationSec = 0
      this.lastRenderedSec = -1
      return
    }

    this.titleEl.textContent = track.title
    this.artistEl.textContent = [track.artist, track.album].filter(Boolean).join(' • ')
    this.durationSec = track.durationMs > 0 ? track.durationMs / 1000 : 0

    if (artworkUrl) {
      this.artImg.src = artworkUrl
      this.artImg.hidden = false
      this.artFallback.hidden = true
    } else {
      this.artImg.hidden = true
      this.artFallback.hidden = false
    }

    this.update(0)
  }

  update(songMs: number): void {
    if (!this.enabled || !this.track || this.durationSec <= 0) {
      this.progressFill.style.width = '0%'
      return
    }

    const currentSec = Math.max(0, songMs / 1000)
    const pct = Math.min(100, Math.max(0, (currentSec / this.durationSec) * 100))
    this.progressFill.style.width = `${pct.toFixed(2)}%`

    const wholeSec = Math.floor(currentSec)
    if (wholeSec !== this.lastRenderedSec) {
      this.lastRenderedSec = wholeSec
      this.timeEl.textContent = `${formatTime(currentSec)} / ${formatTime(this.durationSec)}`
    }
  }

  destroy(): void {
    this.root.remove()
  }
}
