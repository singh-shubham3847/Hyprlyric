/** The display styles. */
export type StyleId = 'tesseract' | 'tesseract-visual' | 'ship' | 'fisheye' | 'fisheye-visual' | 'visual'

/** Where the words show: the lock-style screen, or an always-on overlay. */
export type ShowOn = 'lock' | 'always'

export type ColorRole = 'lyric' | 'highlight' | 'secondary'

/** All colours are lowercase `#rrggbb`. */
export interface Palette {
  lyric: string
  highlight: string
  /** Text drawn on top of the highlight box. */
  highlightText: string
  secondary: string
}

/** Times are integer milliseconds of song time. */
export interface TimedWord {
  text: string
  start: number
  end: number
}

export interface TimedLine {
  text: string
  start: number
  end: number
  words: TimedWord[]
}

export interface TimedLyrics {
  lines: TimedLine[]
  /** `native` when the source carried per-word tags, `estimated` otherwise. */
  wordTiming: 'native' | 'estimated'
}

export interface TrackInfo {
  /** Stable identity of the track within one player session. */
  key: string
  app: string
  title: string
  artist: string
  album: string
  /** 0 when the player does not report a duration. */
  durationMs: number
}

/**
 * Song position `positionMs` was true at wall-clock `atEpochMs`.
 * While `playing`, the current position is extrapolated from that anchor.
 */
export interface PlaybackAnchor {
  trackKey: string
  positionMs: number
  atEpochMs: number
  playing: boolean
  rate: number
}

export type LyricsStatus = 'idle' | 'searching' | 'found' | 'not-found' | 'instrumental' | 'error'

export const STYLE_IDS: readonly StyleId[] = ['tesseract', 'tesseract-visual', 'fisheye', 'fisheye-visual', 'visual']

export const STYLE_LABELS: Record<StyleId, string> = {
  tesseract: 'Tesseract',
  'tesseract-visual': 'Tesseract Visual',
  ship: 'Tesseract',
  fisheye: 'Fisheye',
  'fisheye-visual': 'Fisheye Visual',
  visual: 'Visual'
}
