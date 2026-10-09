import { describe, expect, it } from 'vitest'
import { pickBest, scoreCandidate, type LrclibRecord, type TrackQuery } from '../src/main/lyrics/match'

const record = (over: Partial<LrclibRecord>): LrclibRecord => ({
  id: 1,
  trackName: 'Paper Lanterns',
  artistName: 'Lantern Test Band',
  albumName: 'Fixtures',
  duration: 32,
  instrumental: false,
  plainLyrics: 'x',
  syncedLyrics: '[00:01.00]x',
  lyricsfile: null,
  ...over
})

const query: TrackQuery = { title: 'Paper Lanterns', artist: 'Lantern Test Band', album: 'Fixtures', durationMs: 32_000 }

describe('scoreCandidate', () => {
  it('scores an exact match highly', () => {
    expect(scoreCandidate(query, record({}))).toBeGreaterThan(0.95)
  })

  it('prefers the right duration', () => {
    expect(scoreCandidate(query, record({ duration: 32 }))).toBeGreaterThan(scoreCandidate(query, record({ duration: 37 })))
  })

  it('rejects records without synced lyrics unless instrumental', () => {
    expect(scoreCandidate(query, record({ syncedLyrics: null }))).toBe(Number.NEGATIVE_INFINITY)
    expect(scoreCandidate(query, record({ syncedLyrics: null, instrumental: true }))).toBeGreaterThan(0.9)
  })

  it('accepts a record whose lyricsfile carries the timing', () => {
    const timed = 'lines:\n- text: a\n  start_ms: 1000'
    expect(scoreCandidate(query, record({ syncedLyrics: null, lyricsfile: timed }))).toBeGreaterThan(0.9)
    expect(scoreCandidate(query, record({ syncedLyrics: null, lyricsfile: 'plain: untimed' }))).toBe(
      Number.NEGATIVE_INFINITY
    )
  })

  it('rejects a clearly different duration', () => {
    expect(scoreCandidate(query, record({ duration: 60 }))).toBe(Number.NEGATIVE_INFINITY)
  })

  it('uses the album to confirm a match when the player gives no artist', () => {
    const noArtist = { ...query, artist: '' }
    const sameAlbum = scoreCandidate(noArtist, record({ albumName: 'Fixtures' }))
    const otherAlbum = scoreCandidate(noArtist, record({ albumName: 'Something Else' }))
    expect(sameAlbum).toBeGreaterThan(0.95)
    expect(sameAlbum).toBeGreaterThan(otherAlbum)
  })

  it('can still match on title and length alone', () => {
    const bare = { ...query, artist: '', album: '' }
    expect(pickBest(bare, [record({ id: 4 })])?.id).toBe(4)
    expect(pickBest(bare, [record({ id: 4, duration: 50 })])).toBeNull()
  })

  it('tolerates featuring credits and casing', () => {
    const q = { ...query, title: 'paper lanterns (feat. Guest)', artist: 'Lantern Test Band, Guest' }
    expect(scoreCandidate(q, record({}))).toBeGreaterThan(0.8)
  })
})

describe('pickBest', () => {
  it('returns the highest scoring usable record', () => {
    const best = pickBest(query, [
      record({ id: 1, trackName: 'Paper Lanterns (Live)', duration: 40 }),
      record({ id: 2 }),
      record({ id: 3, syncedLyrics: null })
    ])
    expect(best?.id).toBe(2)
  })

  it('returns null when nothing is close enough', () => {
    expect(pickBest(query, [record({ trackName: 'Completely Different', artistName: 'Nobody' })])).toBeNull()
    expect(pickBest(query, [])).toBeNull()
  })
})
