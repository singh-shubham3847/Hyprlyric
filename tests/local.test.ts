import { copyFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LocalLyrics } from '../src/main/lyrics/local'

const fixture = join(__dirname, 'fixtures', 'original-song.lrc')

describe('LocalLyrics', () => {
  it('finds "<Artist> - <Title>.lrc" regardless of case and punctuation', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tal-local-'))
    copyFileSync(fixture, join(dir, 'Lantern Test Band - Paper Lanterns.lrc'))
    const local = new LocalLyrics(dir)
    const text = await local.find({ title: 'Paper Lanterns', artist: 'lantern test band', album: '', durationMs: 0 })
    expect(text).toContain('[00:01.00]')
  })

  it('also matches when the player adds featuring credits', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tal-local-'))
    copyFileSync(fixture, join(dir, 'Lantern Test Band - Paper Lanterns.lrc'))
    const text = await new LocalLyrics(dir).find({
      title: 'Paper Lanterns (feat. Guest)',
      artist: 'Lantern Test Band, Guest',
      album: '',
      durationMs: 0
    })
    expect(text).not.toBeNull()
  })

  it('returns null when nothing matches or the folder is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tal-local-'))
    writeFileSync(join(dir, 'Someone - Else.lrc'), '[00:01.00]x')
    expect(await new LocalLyrics(dir).find({ title: 'Paper Lanterns', artist: 'X', album: '', durationMs: 0 })).toBeNull()
    expect(await new LocalLyrics(join(dir, 'nope')).find({ title: 'a', artist: 'b', album: '', durationMs: 0 })).toBeNull()
  })

  it('creates the folder with a how-to note', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'tal-local-')), 'Lyrics')
    const local = new LocalLyrics(dir)
    await local.ensureDir()
    await local.ensureDir()
    const { readdirSync } = await import('node:fs')
    expect(readdirSync(dir)).toContain('README.txt')
  })
})
