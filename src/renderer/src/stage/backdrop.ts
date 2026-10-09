/**
 * Ambient backdrop behind full-screen lyrics: displays deeply blurred, subtly
 * drifting album artwork that smoothly crossfades when the track changes,
 * enveloped in a dark vignette for maximum lyric readability.
 */
export class AmbientBackdrop {
  private readonly root: HTMLDivElement
  private readonly artA: HTMLDivElement
  private readonly artB: HTMLDivElement
  private readonly vignette: HTMLDivElement
  private activeLayer: 'a' | 'b' = 'a'
  private currentUrl: string | null = null

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div')
    this.root.className = 'stage-backdrop'

    this.artA = document.createElement('div')
    this.artA.className = 'backdrop-art backdrop-layer-a'

    this.artB = document.createElement('div')
    this.artB.className = 'backdrop-art backdrop-layer-b'

    this.vignette = document.createElement('div')
    this.vignette.className = 'backdrop-vignette'

    this.root.append(this.artA, this.artB, this.vignette)
    parent.prepend(this.root)
  }

  setState(artworkUrl: string | null, enabled: boolean): void {
    const visible = enabled && !!artworkUrl
    this.root.classList.toggle('visible', visible)

    if (!visible || !artworkUrl) {
      this.currentUrl = null
      this.artA.classList.remove('active')
      this.artB.classList.remove('active')
      return
    }

    if (artworkUrl === this.currentUrl) return
    this.currentUrl = artworkUrl

    // Crossfade between layer A and B
    if (this.activeLayer === 'a') {
      this.artB.style.backgroundImage = `url("${artworkUrl}")`
      this.artB.classList.add('active')
      this.artA.classList.remove('active')
      this.activeLayer = 'b'
    } else {
      this.artA.style.backgroundImage = `url("${artworkUrl}")`
      this.artA.classList.add('active')
      this.artB.classList.remove('active')
      this.activeLayer = 'a'
    }
  }

  destroy(): void {
    this.root.remove()
  }
}
