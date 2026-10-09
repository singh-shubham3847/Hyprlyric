import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseLyricsfile } from '../src/main/lyrics/lyricsfile'

const fixture = readFileSync(join(__dirname, 'fixtures', 'original-song.lyricsfile.yaml'), 'utf8')

describe('parseLyricsfile', () => {
  it('reads line starts, ends and text', () => {
    const lines = parseLyricsfile(fixture)
    expect(lines).toHaveLength(3)
    expect(lines?.[0]).toEqual({ start: 1000, end: 4200, text: 'Paper lanterns drifting over quiet water' })
    expect(lines?.[2]).toMatchObject({ start: 18000, end: 20400 })
  })

  it('reads optional per-word timing', () => {
    const doc = [
      'lines:',
      '- text: two words',
      '  start_ms: 100',
      '  end_ms: 900',
      '  words:',
      '  - text: two',
      '    start_ms: 100',
      '    end_ms: 400',
      '  - text: words',
      '    start_ms: 400',
      '    end_ms: 900'
    ].join('\n')
    expect(parseLyricsfile(doc)?.[0]?.words).toEqual([
      { text: 'two', start: 100, end: 400 },
      { text: 'words', start: 400, end: 900 }
    ])
  })

  it('returns null for invalid YAML or a document without lines', () => {
    expect(parseLyricsfile('lines: [unclosed')).toBeNull()
    expect(parseLyricsfile('version: 1\nplain: hello')).toBeNull()
    expect(parseLyricsfile('')).toBeNull()
  })

  it('skips entries without a usable start time', () => {
    const lines = parseLyricsfile('lines:\n- text: no time\n- text: ok\n  start_ms: 50')
    expect(lines).toEqual([{ start: 50, text: 'ok' }])
  })
})
