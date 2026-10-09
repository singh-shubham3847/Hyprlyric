import { cleanTitle, primaryArtist } from './normalize'
import { MIN_SCORE, pickBest, scoreCandidate, type LrclibRecord, type TrackQuery } from './match'

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal }
) => Promise<{ status: number; ok: boolean; json(): Promise<unknown> }>

export type FindResult =
  | { status: 'found'; record: LrclibRecord }
  | { status: 'not-found' }
  | { status: 'error'; message: string }

export interface LrclibOptions {
  userAgent: string
  fetch?: FetchLike
  sleep?: (ms: number) => Promise<void>
  timeoutMs?: number
  retries?: number
  baseUrl?: string
}

type Reply =
  | { kind: 'ok'; body: unknown }
  | { kind: 'missing' }
  /** The server refused this particular request (4xx); other lookups may still work. */
  | { kind: 'rejected'; message: string }
  /** The server is busy or unreachable (after retries); stop and try again later. */
  | { kind: 'error'; message: string }

const BACKOFF_MS = [1000, 2500, 5000]

class Retryable extends Error {}

const isRecordLike = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null)

function toRecord(v: unknown): LrclibRecord | null {
  if (!isRecordLike(v)) return null
  if (typeof v.id !== 'number' || typeof v.trackName !== 'string' || typeof v.artistName !== 'string') return null
  return {
    id: v.id,
    trackName: v.trackName,
    artistName: v.artistName,
    albumName: strOrNull(v.albumName),
    duration: typeof v.duration === 'number' ? v.duration : 0,
    instrumental: v.instrumental === true,
    plainLyrics: strOrNull(v.plainLyrics),
    syncedLyrics: strOrNull(v.syncedLyrics),
    lyricsfile: strOrNull(v.lyricsfile)
  }
}

const toRecords = (v: unknown): LrclibRecord[] =>
  Array.isArray(v) ? v.map(toRecord).filter((r): r is LrclibRecord => r !== null) : []

/**
 * Client for lrclib.net, the free, open lyrics database. Lookup order:
 * exact `/api/get` → field search → cleaned free-text search.
 * Busy/unreachable server → retried with backoff, then reported as `error` (never cached).
 */
export class LrclibClient {
  private readonly fetch: FetchLike
  private readonly sleep: (ms: number) => Promise<void>
  private readonly timeoutMs: number
  private readonly retries: number
  private readonly baseUrl: string
  private readonly userAgent: string

  constructor(opts: LrclibOptions) {
    this.fetch = opts.fetch ?? ((url, init) => globalThis.fetch(url, init))
    this.sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.timeoutMs = opts.timeoutMs ?? 8000
    this.retries = opts.retries ?? 3
    this.baseUrl = (opts.baseUrl ?? 'https://lrclib.net').replace(/\/$/, '')
    this.userAgent = opts.userAgent
  }

  async find(q: TrackQuery): Promise<FindResult> {
    // Players sometimes publish a track before (or without) its artist, and LRCLIB rejects an
    // empty artist_name. Without one, search by title and let the scorer confirm by album and length.
    const hasArtist = q.artist.trim() !== ''
    let rejected: string | null = null

    if (hasArtist) {
      const exact = new URLSearchParams({ track_name: q.title, artist_name: q.artist })
      if (q.album) exact.set('album_name', q.album)
      if (q.durationMs > 0) exact.set('duration', String(Math.round(q.durationMs / 1000)))

      const got = await this.request(`/api/get?${exact}`)
      if (got.kind === 'error') return { status: 'error', message: got.message }
      if (got.kind === 'rejected') rejected = got.message
      if (got.kind === 'ok') {
        const record = toRecord(got.body)
        if (record && scoreCandidate(q, record) >= MIN_SCORE) return { status: 'found', record }
      }
    }

    const searches = hasArtist
      ? [
          new URLSearchParams({ track_name: q.title, artist_name: q.artist }),
          new URLSearchParams({ q: `${cleanTitle(q.title)} ${primaryArtist(q.artist)}` })
        ]
      : [new URLSearchParams({ track_name: q.title }), new URLSearchParams({ q: cleanTitle(q.title) })]
    for (const params of searches) {
      const reply = await this.request(`/api/search?${params}`)
      if (reply.kind === 'error') return { status: 'error', message: reply.message }
      if (reply.kind === 'rejected') {
        rejected = reply.message
        continue
      }
      if (reply.kind !== 'ok') continue
      const best = pickBest(q, toRecords(reply.body))
      if (best) return { status: 'found', record: best }
    }
    // A refused request is not proof the song has no lyrics: report an error so it is not cached.
    return rejected ? { status: 'error', message: rejected } : { status: 'not-found' }
  }

  private async request(path: string): Promise<Reply> {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await this.fetch(`${this.baseUrl}${path}`, {
          headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
          signal: AbortSignal.timeout(this.timeoutMs)
        })
        if (res.status === 404) return { kind: 'missing' }
        if (res.ok) return { kind: 'ok', body: await res.json().catch(() => null) }
        if (res.status === 429 || res.status >= 500) throw new Retryable(`HTTP ${res.status}`)
        return { kind: 'rejected', message: `HTTP ${res.status}` }
      } catch (err) {
        if (attempt >= this.retries) {
          return { kind: 'error', message: err instanceof Error ? err.message : String(err) }
        }
        await this.sleep(BACKOFF_MS[attempt] ?? BACKOFF_MS.at(-1)!)
      }
    }
  }
}
