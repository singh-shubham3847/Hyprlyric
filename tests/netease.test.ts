import { describe, expect, it } from 'vitest'
import type { FetchLike } from '../src/main/lyrics/lrclib'
import type { TrackQuery } from '../src/main/lyrics/match'
import { NeteaseClient } from '../src/main/lyrics/netease'

// Original test text written for Hyprlyric (not a real song), in NetEase's word-timed format.
const YRC = [
  '{"t":0,"c":[{"tx":"credits"}]}',
  '[1000,3200](1000,400,0)Paper (1400,600,0)lanterns (2000,500,0)drifting',
  '[4200,1500](4200,300,0)Every (4500,300,0)window (4800,500,0)keeps',
  '[8000,1200](8000,600,0)Hold (8600,600,0)the (9200,600,0)light'
].join('\n')

const query: TrackQuery = { title: 'Paper Lanterns', artist: 'Lantern Test Band', album: 'Fixtures', durationMs: 32_400 }

const song = (id: number, name: string, seconds: number, artist = 'Lantern Test Band', album = 'Fixtures') => ({
  id,
  name,
  ar: [{ name: artist }],
  al: { name: album },
  dt: seconds * 1000
})

type Reply = { status?: number; body: unknown } | Error

function scripted(replies: Reply[]): { fetch: FetchLike; urls: string[]; headers: Record<string, string>[] } {
  const urls: string[] = []
  const headers: Record<string, string>[] = []
  const fetch: FetchLike = async (url, init) => {
    urls.push(url)
    headers.push(init?.headers ?? {})
    const reply = replies.shift()
    if (!reply) throw new Error(`unexpected request ${url}`)
    if (reply instanceof Error) throw reply
    const status = reply.status ?? 200
    return { status, ok: status >= 200 && status < 300, json: async () => reply.body }
  }
  return { fetch, urls, headers }
}

const client = (fetch: FetchLike) => new NeteaseClient({ fetch, baseUrl: 'https://netease.test' })

describe('NeteaseClient.find', () => {
  it('finds word-timed lyrics for the matching recording', async () => {
    const s = scripted([
      { body: { code: 200, result: { songs: [song(1, 'Paper Lanterns (Live)', 250), song(2, 'Paper Lanterns', 32)] } } },
      { body: { code: 200, yrc: { lyric: YRC } } }
    ])
    const result = await client(s.fetch).find(query)
    expect(result.status === 'found' && result.song.id).toBe(2)
    expect(result.status === 'found' && result.yrc).toBe(YRC)
    expect(s.urls[0]).toContain('/api/cloudsearch/pc?s=Paper+Lanterns+Lantern+Test+Band&type=1')
    expect(s.urls[1]).toContain('/api/song/lyric/v1?id=2&')
    expect(s.headers[0]?.Referer).toBe('https://music.163.com/')
  })

  it('never uses a recording whose length differs by more than 3 seconds', async () => {
    const s = scripted([{ body: { code: 200, result: { songs: [song(3, 'Paper Lanterns', 36)] } } }])
    expect(await client(s.fetch).find(query)).toEqual({ status: 'not-found' })
    expect(s.urls).toHaveLength(1)
  })

  it('tries the next candidate when the best one has no word timing', async () => {
    const s = scripted([
      { body: { code: 200, result: { songs: [song(4, 'Paper Lanterns', 32), song(5, 'Paper Lanterns', 33)] } } },
      { body: { code: 200, lrc: { lyric: '[00:01.00]line timing only' } } },
      { body: { code: 200, yrc: { lyric: YRC } } }
    ])
    const result = await client(s.fetch).find(query)
    expect(result.status === 'found' && result.song.id).toBe(5)
  })

  it('searches by title and album when the player gives no artist', async () => {
    const s = scripted([{ body: { code: 200, result: { songs: [] } } }])
    await client(s.fetch).find({ ...query, artist: '' })
    expect(s.urls[0]).toContain('s=Paper+Lanterns+Fixtures')
  })

  it('reports an error when the service is unreachable or refuses', async () => {
    expect((await client(scripted([new Error('ENOTFOUND')]).fetch).find(query)).status).toBe('error')
    expect((await client(scripted([{ status: 503, body: {} }]).fetch).find(query)).status).toBe('error')
    expect((await client(scripted([{ body: { code: -460, msg: 'blocked' } }]).fetch).find(query)).status).toBe('error')
  })

  it('reports an error (not "no lyrics") when every lyric request fails', async () => {
    const s = scripted([
      { body: { code: 200, result: { songs: [song(6, 'Paper Lanterns', 32)] } } },
      new Error('timeout')
    ])
    expect((await client(s.fetch).find(query)).status).toBe('error')
  })

  it('ignores lyrics with too few timed lines', async () => {
    const s = scripted([
      { body: { code: 200, result: { songs: [song(7, 'Paper Lanterns', 32)] } } },
      { body: { code: 200, yrc: { lyric: '[1000,500](1000,500,0)only' } } }
    ])
    expect((await client(s.fetch).find(query)).status).toBe('not-found')
  })
})
