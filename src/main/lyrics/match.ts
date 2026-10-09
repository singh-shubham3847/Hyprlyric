import { cleanTitle, normalizeForMatch, primaryArtist } from './normalize'

/** A record as returned by lrclib.net `/api/get` and `/api/search`. */
export interface LrclibRecord {
  id: number
  trackName: string
  artistName: string
  albumName: string | null
  /** Seconds. */
  duration: number
  instrumental: boolean
  plainLyrics: string | null
  syncedLyrics: string | null
  lyricsfile?: string | null
}

export interface TrackQuery {
  title: string
  artist: string
  album: string
  durationMs: number
}

/** Minimum score for a candidate to be trusted. */
export const MIN_SCORE = 0.55
const MAX_DURATION_GAP_S = 8
const EXACT_DURATION_S = 2

const words = (s: string): string[] => normalizeForMatch(s).split(' ').filter(Boolean)

function dice<T>(a: T[], b: T[]): number {
  if (!a.length || !b.length) return 0
  const pool = [...b]
  let common = 0
  for (const item of a) {
    const i = pool.indexOf(item)
    if (i >= 0) {
      common++
      pool.splice(i, 1)
    }
  }
  return (2 * common) / (a.length + b.length)
}

function bigrams(s: string): string[] {
  const chars = Array.from(normalizeForMatch(s).replace(/ /g, ''))
  if (chars.length < 2) return chars
  return chars.slice(1).map((c, i) => chars[i] + c)
}

/** Word overlap for Latin text, character bigrams for scripts written without spaces. */
const similarity = (a: string, b: string): number => Math.max(dice(words(a), words(b)), dice(bigrams(a), bigrams(b)))

export const hasTiming = (r: LrclibRecord): boolean =>
  !!r.syncedLyrics?.trim() || !!(r.lyricsfile && /start_ms\s*:/.test(r.lyricsfile))

/** What any lyrics source knows about a recording. */
export interface SongMeta {
  title: string
  artist: string
  album: string | null
  durationSec: number
}

/**
 * 0…1 confidence that `m` is the queried recording; -Infinity when the lengths differ by more
 * than `maxGapSec` (a different edit or live version would have different timing).
 */
export function scoreMatch(q: TrackQuery, m: SongMeta, maxGapSec = MAX_DURATION_GAP_S): number {
  let durationScore = 0.5
  if (q.durationMs > 0 && m.durationSec > 0) {
    const gap = Math.abs(q.durationMs / 1000 - m.durationSec)
    if (gap > maxGapSec) return Number.NEGATIVE_INFINITY
    durationScore = gap <= EXACT_DURATION_S ? 1 : 1 - (gap - EXACT_DURATION_S) / (MAX_DURATION_GAP_S - EXACT_DURATION_S)
  }

  const title = Math.max(similarity(q.title, m.title), similarity(cleanTitle(q.title), cleanTitle(m.title)))
  // Players sometimes publish a track without its artist; the album then confirms the match instead.
  const artist = q.artist.trim()
    ? Math.max(similarity(q.artist, m.artist), similarity(primaryArtist(q.artist), primaryArtist(m.artist)))
    : q.album.trim() && m.album
      ? similarity(q.album, m.album)
      : 0
  return 0.45 * title + 0.3 * artist + 0.25 * durationScore
}

/** 0…1 confidence that `r` is the queried recording; -Infinity when it cannot be used. */
export function scoreCandidate(q: TrackQuery, r: LrclibRecord): number {
  if (!r.instrumental && !hasTiming(r)) return Number.NEGATIVE_INFINITY
  return scoreMatch(q, { title: r.trackName, artist: r.artistName, album: r.albumName, durationSec: r.duration })
}

export function pickBest(q: TrackQuery, records: LrclibRecord[]): LrclibRecord | null {
  let best: LrclibRecord | null = null
  let bestScore = MIN_SCORE
  for (const r of records) {
    const score = scoreCandidate(q, r)
    // Among equals, prefer a record that has timing over an instrumental placeholder.
    if (score > bestScore || (score === bestScore && best && !hasTiming(best) && hasTiming(r))) {
      best = r
      bestScore = score
    }
  }
  return best
}
