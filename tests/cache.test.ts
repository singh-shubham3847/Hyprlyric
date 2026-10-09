import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LyricsCache, cacheKey } from '../src/main/lyrics/cache'

const dir = (): string => mkdtempSync(join(tmpdir(), 'tal-cache-'))
const DAY = 24 * 60 * 60 * 1000

describe('cacheKey', () => {
  it('ignores casing, featuring credits and small duration differences', () => {
    const a = cacheKey({ title: 'Paper Lanterns (feat. X)', artist: 'Lantern Test Band', album: 'A', durationMs: 32_400 })
    const b = cacheKey({ title: 'paper lanterns', artist: 'LANTERN TEST BAND', album: 'B', durationMs: 32_900 })
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{40}$/)
  })

  it('separates different songs', () => {
    const a = cacheKey({ title: 'One', artist: 'X', album: '', durationMs: 100_000 })
    const b = cacheKey({ title: 'Two', artist: 'X', album: '', durationMs: 100_000 })
    expect(a).not.toBe(b)
  })
})

describe('LyricsCache', () => {
  it('round-trips an entry', async () => {
    const cache = new LyricsCache(dir())
    await cache.set('k', { status: 'not-found', fetchedAt: Date.now() })
    expect(await cache.get('k')).toMatchObject({ status: 'not-found' })
  })

  it('returns null for unknown keys', async () => {
    expect(await new LyricsCache(dir()).get('missing')).toBeNull()
  })

  it('expires not-found entries after three days but keeps found ones', async () => {
    let now = 1_000_000
    const cache = new LyricsCache(dir(), () => now)
    await cache.set('nf', { status: 'not-found', fetchedAt: now })
    await cache.set('ok', { status: 'instrumental', fetchedAt: now })
    now += 3 * DAY + 1
    expect(await cache.get('nf')).toBeNull()
    expect(await cache.get('ok')).not.toBeNull()
  })
})
