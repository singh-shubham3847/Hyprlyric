import { describe, expect, it, vi } from 'vitest'
import { LrclibClient, type FetchLike } from '../src/main/lyrics/lrclib'
import type { LrclibRecord, TrackQuery } from '../src/main/lyrics/match'

const query: TrackQuery = { title: 'Paper Lanterns', artist: 'Lantern Test Band', album: 'Fixtures', durationMs: 32_400 }

const rec = (over: Partial<LrclibRecord> = {}): LrclibRecord => ({
  id: 7,
  trackName: 'Paper Lanterns',
  artistName: 'Lantern Test Band',
  albumName: 'Fixtures',
  duration: 32,
  instrumental: false,
  plainLyrics: 'x',
  syncedLyrics: '[00:01.00]x',
  ...over
})

type Reply = { status: number; body?: unknown } | Error

/** Fake fetch that answers each call from a script and records the URLs. */
function scripted(replies: Reply[]): { fetch: FetchLike; urls: string[]; headers: Record<string, string>[] } {
  const urls: string[] = []
  const headers: Record<string, string>[] = []
  const fetch: FetchLike = async (url, init) => {
    urls.push(url)
    headers.push(init?.headers ?? {})
    const reply = replies.shift()
    if (!reply) throw new Error(`unexpected request ${url}`)
    if (reply instanceof Error) throw reply
    return { status: reply.status, ok: reply.status >= 200 && reply.status < 300, json: async () => reply.body }
  }
  return { fetch, urls, headers }
}

const client = (fetch: FetchLike, sleep = vi.fn(async (_ms: number) => {})) =>
  new LrclibClient({ fetch, userAgent: 'hyprlyric/test', sleep, baseUrl: 'https://lrclib.test' })

describe('LrclibClient.find', () => {
  it('uses /api/get with encoded parameters and the user agent', async () => {
    const s = scripted([{ status: 200, body: rec() }])
    const result = await client(s.fetch).find({ ...query, title: 'Paper & Lanterns' })
    expect(result.status).toBe('found')
    expect(s.urls[0]).toBe(
      'https://lrclib.test/api/get?track_name=Paper+%26+Lanterns&artist_name=Lantern+Test+Band&album_name=Fixtures&duration=32'
    )
    expect(s.headers[0]?.['User-Agent']).toBe('hyprlyric/test')
  })

  it('falls back to search when get returns 404', async () => {
    const s = scripted([
      { status: 404, body: { message: 'not found' } },
      { status: 200, body: [rec({ id: 1, duration: 50 }), rec({ id: 2 })] }
    ])
    const result = await client(s.fetch).find(query)
    expect(result).toEqual({ status: 'found', record: expect.objectContaining({ id: 2 }) })
    expect(s.urls[1]).toContain('/api/search?track_name=Paper+Lanterns&artist_name=Lantern+Test+Band')
  })

  it('tries a cleaned free-text search last', async () => {
    const s = scripted([
      { status: 404 },
      { status: 200, body: [] },
      { status: 200, body: [rec({ id: 9 })] }
    ])
    const result = await client(s.fetch).find({ ...query, title: 'Paper Lanterns (feat. Guest)', artist: 'Lantern Test Band, Guest' })
    expect(result.status).toBe('found')
    expect(s.urls[2]).toContain('/api/search?q=Paper+Lanterns+Lantern+Test+Band')
  })

  it('retries a busy server with backoff', async () => {
    const sleep = vi.fn(async (_ms: number) => {})
    const s = scripted([{ status: 503 }, { status: 503 }, { status: 200, body: rec() }])
    const result = await client(s.fetch, sleep).find(query)
    expect(result.status).toBe('found')
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2500])
  })

  it('retries network errors too', async () => {
    const s = scripted([new Error('ECONNRESET'), { status: 200, body: rec() }])
    expect((await client(s.fetch).find(query)).status).toBe('found')
  })

  it('reports an error when the server stays busy', async () => {
    const s = scripted([{ status: 503 }, { status: 503 }, { status: 503 }, { status: 503 }])
    const result = await client(s.fetch).find(query)
    expect(result.status).toBe('error')
  })

  it('reports not-found when every lookup comes back empty', async () => {
    const s = scripted([{ status: 404 }, { status: 200, body: [] }, { status: 200, body: [] }])
    expect(await client(s.fetch).find(query)).toEqual({ status: 'not-found' })
  })

  it('returns instrumental records as found', async () => {
    const s = scripted([{ status: 200, body: rec({ instrumental: true, syncedLyrics: null, plainLyrics: null }) }])
    const result = await client(s.fetch).find(query)
    expect(result.status === 'found' && result.record.instrumental).toBe(true)
  })

  it('skips a get result without synced lyrics and keeps searching', async () => {
    const s = scripted([
      { status: 200, body: rec({ id: 1, syncedLyrics: null }) },
      { status: 200, body: [rec({ id: 2 })] }
    ])
    const result = await client(s.fetch).find(query)
    expect(result.status === 'found' && result.record.id).toBe(2)
  })

  it('searches by title when the player gives no artist (regression: HTTP 400)', async () => {
    const s = scripted([{ status: 200, body: [rec({ id: 5 })] }])
    const result = await client(s.fetch).find({ ...query, artist: '' })
    expect(result.status === 'found' && result.record.id).toBe(5)
    expect(s.urls[0]).toBe('https://lrclib.test/api/search?track_name=Paper+Lanterns')
    expect(s.urls.some((u) => u.includes('artist_name=&') || u.endsWith('artist_name='))).toBe(false)
  })

  it('keeps searching when a lookup is rejected', async () => {
    const s = scripted([
      { status: 400, body: { message: 'artist_name: cannot be empty' } },
      { status: 200, body: [rec({ id: 3 })] }
    ])
    const result = await client(s.fetch).find(query)
    expect(result.status === 'found' && result.record.id).toBe(3)
  })

  it('reports an error, not "no lyrics", when every lookup is rejected', async () => {
    const s = scripted([{ status: 400 }, { status: 400 }, { status: 400 }])
    expect((await client(s.fetch).find(query)).status).toBe('error')
  })

  it('ignores malformed bodies', async () => {
    const s = scripted([{ status: 200, body: 'garbage' }, { status: 200, body: { not: 'an array' } }, { status: 200, body: [] }])
    expect((await client(s.fetch).find(query)).status).toBe('not-found')
  })
})
