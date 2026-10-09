import type { FetchLike } from './lrclib'
import { MIN_SCORE, scoreMatch, type TrackQuery } from './match'
import { cleanTitle, primaryArtist } from './normalize'

export interface NeteaseSong {
  id: number
  title: string
  artist: string
  album: string
  durationSec: number
}

export type NeteaseResult =
  | { status: 'found'; yrc: string; song: NeteaseSong }
  | { status: 'not-found' }
  | { status: 'error'; message: string }

/** Word timings only fit the exact recording, so its length must agree closely. */
const MAX_GAP_S = 3
const MAX_CANDIDATES = 3
const MIN_TIMED_LINES = 3
const TIMED_LINE = /^\[\d+,\d+\]/gm
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'

type Reply = { kind: 'ok'; body: Record<string, unknown> } | { kind: 'error'; message: string }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function toSongs(body: Record<string, unknown>): NeteaseSong[] {
  const songs = isRecord(body.result) && Array.isArray(body.result.songs) ? body.result.songs : []
  return songs.flatMap((s: unknown) => {
    if (!isRecord(s) || typeof s.id !== 'number' || typeof s.name !== 'string') return []
    const artists = Array.isArray(s.ar) ? s.ar.map((a: unknown) => (isRecord(a) && typeof a.name === 'string' ? a.name : '')) : []
    return [
      {
        id: s.id,
        title: s.name,
        artist: artists.filter(Boolean).join(', '),
        album: isRecord(s.al) && typeof s.al.name === 'string' ? s.al.name : '',
        durationSec: typeof s.dt === 'number' ? s.dt / 1000 : 0
      }
    ]
  })
}

const readYrc = (body: Record<string, unknown>): string | null =>
  isRecord(body.yrc) && typeof body.yrc.lyric === 'string' ? body.yrc.lyric : null

/**
 * NetEase Cloud Music (unofficial web API): many songs carry real per-word timing ("YRC").
 * Used alongside LRCLIB; any failure here simply falls back to LRCLIB's line timing.
 */
export class NeteaseClient {
  private readonly fetch: FetchLike
  private readonly timeoutMs: number
  private readonly baseUrl: string
  private consecutiveFailures = 0
  private disabledUntil = 0

  constructor(opts: { fetch?: FetchLike; timeoutMs?: number; baseUrl?: string } = {}) {
    this.fetch = opts.fetch ?? ((url, init) => globalThis.fetch(url, init))
    this.timeoutMs = opts.timeoutMs ?? 2500
    this.baseUrl = (opts.baseUrl ?? 'https://music.163.com').replace(/\/$/, '')
  }

  async find(q: TrackQuery): Promise<NeteaseResult> {
    if (Date.now() < this.disabledUntil) {
      return { status: 'error', message: 'NetEase temporarily suspended after repeated timeouts' }
    }

    const terms = [cleanTitle(q.title), q.artist.trim() ? primaryArtist(q.artist) : q.album.trim()].filter(Boolean).join(' ')
    const search = await this.get(`/api/cloudsearch/pc?${new URLSearchParams({ s: terms, type: '1', offset: '0', limit: '10' })}`)
    if (search.kind === 'error') {
      this.consecutiveFailures++
      if (this.consecutiveFailures >= 2) {
        this.disabledUntil = Date.now() + 5 * 60 * 1000
      }
      return { status: 'error', message: search.message }
    }

    this.consecutiveFailures = 0
    this.disabledUntil = 0

    const candidates = toSongs(search.body)
      .map((song) => ({ song, score: scoreMatch(q, { title: song.title, artist: song.artist, album: song.album, durationSec: song.durationSec }, MAX_GAP_S) }))
      .filter((c) => c.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_CANDIDATES)

    let failure: string | null = null
    let answered = false
    for (const { song } of candidates) {
      const params = new URLSearchParams({ id: String(song.id), lv: '-1', kv: '-1', tv: '-1', rv: '-1', yv: '-1', ytv: '-1', yrv: '-1' })
      const lyric = await this.get(`/api/song/lyric/v1?${params}`)
      if (lyric.kind === 'error') {
        failure = lyric.message
        continue
      }
      answered = true
      const yrc = readYrc(lyric.body)
      if (yrc && (yrc.match(TIMED_LINE)?.length ?? 0) >= MIN_TIMED_LINES) return { status: 'found', yrc, song }
    }
    // Only "every request failed" is an error; an answer without word timing means not found.
    if (failure && !answered) {
      this.consecutiveFailures++
      if (this.consecutiveFailures >= 2) {
        this.disabledUntil = Date.now() + 5 * 60 * 1000
      }
      return { status: 'error', message: failure }
    }
    return { status: 'not-found' }
  }

  private async get(path: string): Promise<Reply> {
    try {
      const res = await this.fetch(`${this.baseUrl}${path}`, {
        headers: { 'User-Agent': BROWSER_UA, Referer: 'https://music.163.com/', Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs)
      })
      if (!res.ok) return { kind: 'error', message: `HTTP ${res.status}` }
      const body = await res.json().catch(() => null)
      if (!isRecord(body)) return { kind: 'error', message: 'unreadable reply' }
      if (body.code !== 200) return { kind: 'error', message: `service code ${String(body.code)}` }
      return { kind: 'ok', body }
    } catch (err) {
      return { kind: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }
}
