import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseLrc } from '../src/main/lyrics/lrc'

const fixture = readFileSync(join(__dirname, 'fixtures', 'original-song.lrc'), 'utf8')

describe('parseLrc', () => {
  it('parses time tags of every common precision', () => {
    const lines = parseLrc('[00:12.34]a\n[1:02]b\n[00:12:50]c\n[00:01.5]d\n[00:02.123]e')
    expect(lines.map((l) => [l.text, l.start])).toEqual([
      ['d', 1500],
      ['e', 2123],
      ['a', 12340],
      ['c', 12500],
      ['b', 62000]
    ])
  })

  it('expands a line that carries several time tags', () => {
    const lines = parseLrc('[00:10.00][00:40.00]again')
    expect(lines.map((l) => l.start)).toEqual([10000, 40000])
    expect(lines.every((l) => l.text === 'again')).toBe(true)
  })

  it('applies [offset:] so a positive offset shows lyrics sooner', () => {
    expect(parseLrc('[offset:+500]\n[00:10.00]x')[0]?.start).toBe(9500)
    expect(parseLrc('[offset:-250]\n[00:10.00]x')[0]?.start).toBe(10250)
  })

  it('ignores metadata tags and handles CRLF line endings', () => {
    const lines = parseLrc('[ar:Someone]\r\n[ti:Title]\r\n[00:01.00]one\r\n[00:02.00]two\r\n')
    expect(lines.map((l) => l.text)).toEqual(['one', 'two'])
  })

  it('keeps blank lines as breaks', () => {
    const lines = parseLrc('[00:01.00]sing\n[00:05.00]\n[00:09.00]again')
    expect(lines.map((l) => l.text)).toEqual(['sing', '', 'again'])
  })

  it('parses enhanced word tags', () => {
    const [line] = parseLrc('[00:10.00]<00:10.00>hi <00:10.50>there <00:11.20>')
    expect(line?.text).toBe('hi there')
    expect(line?.words).toEqual([
      { text: 'hi', start: 10000, end: 10500 },
      { text: 'there', start: 10500, end: 11200 }
    ])
  })

  it('merges syllable tags without spaces into one word', () => {
    const [line] = parseLrc('[00:05.00]<00:05.00>beau<00:05.20>ti<00:05.40>ful <00:06.00>day<00:06.80>')
    expect(line?.words?.map((w) => [w.text, w.start, w.end])).toEqual([
      ['beautiful', 5000, 6000],
      ['day', 6000, 6800]
    ])
  })

  it('leaves the end of a trailing word open when no closing tag exists', () => {
    const [line] = parseLrc('[00:05.00]<00:05.00>last <00:05.60>word')
    expect(line?.words?.[1]?.text).toBe('word')
    expect(Number.isNaN(line?.words?.[1]?.end)).toBe(true)
  })

  it('keeps only the first line when several share one timestamp (translations)', () => {
    const lines = parseLrc('[00:03.00]original\n[00:03.00]translation\n[00:06.00]next')
    expect(lines.map((l) => l.text)).toEqual(['original', 'next'])
  })

  it('parses the original fixture song', () => {
    const lines = parseLrc(fixture)
    expect(lines).toHaveLength(9)
    expect(lines[0]).toMatchObject({ start: 1000, text: 'Paper lanterns drifting over quiet water' })
    expect(lines[4]?.text).toBe('')
  })

  it('returns an empty list for text without time tags', () => {
    expect(parseLrc('just some words\nwithout timing')).toEqual([])
  })
})
