// Opt-in check against the real lrclib.net service: `npm run check:lrclib`.
// Asserts on metadata only (found / line count / timing type) and never prints lyric text.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LyricsCache } from '../src/main/lyrics/cache'
import { LocalLyrics } from '../src/main/lyrics/local'
import { LrclibClient } from '../src/main/lyrics/lrclib'
import type { TrackQuery } from '../src/main/lyrics/match'
import { NeteaseClient } from '../src/main/lyrics/netease'
import { LyricsService } from '../src/main/lyrics/service'

const base = mkdtempSync(join(tmpdir(), 'tal-live-'))
const service = new LyricsService({
  local: new LocalLyrics(join(base, 'none')),
  cache: new LyricsCache(join(base, 'cache')),
  client: new LrclibClient({ userAgent: 'hyprlyric/1.0.0 (https://github.com/singh-shubham3847/hyprlyric; live check)' }),
  log: () => {}
})

const popular: (TrackQuery & { label: string })[] = [
  { label: 'Blinding Lights', title: 'Blinding Lights', artist: 'The Weeknd', album: 'After Hours', durationMs: 200_000 },
  { label: 'Shape of You', title: 'Shape of You', artist: 'Ed Sheeran', album: '÷ (Deluxe)', durationMs: 233_700 },
  { label: 'Levitating (feat. credit, remaster noise)', title: 'Levitating (feat. DaBaby)', artist: 'Dua Lipa, DaBaby', album: '', durationMs: 203_000 }
]

describe('lrclib.net (live)', () => {
  for (const track of popular) {
    it(`finds synced lyrics: ${track.label}`, async () => {
      const result = await service.get(track)
      console.log(
        `${track.label}: ${result.status}${result.lyrics ? `, ${result.lyrics.lines.length} lines, ${result.lyrics.wordTiming} word timing` : ''}`
      )
      expect(result.status).toBe('found')
      expect(result.lyrics!.lines.length).toBeGreaterThan(10)
      for (const line of result.lyrics!.lines) {
        expect(line.words.length).toBeGreaterThan(0)
        expect(line.words[0]!.start).toBe(line.start)
      }
    }, 60_000)
  }

  it('finds a song Spotify published without its artist (regression: HTTP 400)', async () => {
    const result = await service.get({ title: 'Call Out My Name', artist: '', album: 'My Dear Melancholy,', durationMs: 228_373 })
    console.log(`no-artist lookup: ${result.status}${result.lyrics ? `, ${result.lyrics.lines.length} lines` : ''}`)
    expect(result.status).toBe('found')
  }, 60_000)

  it('gets real word timing from NetEase for a popular song', async () => {
    const withWords = new LyricsService({
      local: new LocalLyrics(join(base, 'none')),
      cache: new LyricsCache(join(base, 'cache-words')),
      client: new LrclibClient({ userAgent: 'hyprlyric/1.0.0 (https://github.com/singh-shubham3847/hyprlyric; live check)' }),
      log: () => {},
      wordLevel: { client: new NeteaseClient(), enabled: () => true }
    })
    const result = await withWords.get(popular[0]!)
    console.log(`word-level: ${result.status} via ${result.source}, ${result.lyrics?.lines.length ?? 0} lines, ${result.lyrics?.wordTiming}`)
    expect(result.status).toBe('found')
    expect(result.source).toBe('netease')
    expect(result.lyrics?.wordTiming).toBe('native')
  }, 60_000)

  it('reports a clearly unknown song as not-found', async () => {
    const result = await service.get({ title: 'Zzqx hyprlyric Nonexistent Song', artist: 'Nobody Qqz', album: '', durationMs: 123_000 })
    expect(result.status).toBe('not-found')
  }, 60_000)
})
