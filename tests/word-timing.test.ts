import { describe, expect, it } from 'vitest'
import type { TimedLyrics } from '../src/shared/types'
import type { ParsedLine } from '../src/main/lyrics/lrc'
import { buildTimedLyrics, wordWeight } from '../src/main/lyrics/word-timing'

function expectWellFormed(lyrics: TimedLyrics | null): asserts lyrics is TimedLyrics {
  expect(lyrics).not.toBeNull()
  for (const line of lyrics!.lines) {
    expect(line.words.length).toBeGreaterThan(0)
    expect(line.words[0]!.start).toBe(line.start)
    let prev = line.start
    for (const w of line.words) {
      expect(w.start).toBeGreaterThanOrEqual(prev)
      expect(w.end).toBeGreaterThanOrEqual(w.start)
      expect(Number.isInteger(w.start) && Number.isInteger(w.end)).toBe(true)
      prev = w.start
    }
    expect(line.words.at(-1)!.end).toBeLessThanOrEqual(line.end)
  }
}

const regularSong = (): ParsedLine[] => [
  { start: 1000, text: 'Paper lanterns drifting over quiet water' },
  { start: 4200, text: 'Every window keeps a small and patient flame' },
  { start: 7600, text: 'We were counting boats that never reached the harbor' },
  { start: 11000, text: 'Singing softly till the morning knew our name' },
  { start: 14400, text: 'Hold the light a little longer' },
  { start: 44400, text: 'Let the river carry every word' }
]

describe('buildTimedLyrics', () => {
  it('returns null when there is nothing to show', () => {
    expect(buildTimedLyrics([])).toBeNull()
    expect(buildTimedLyrics([{ start: 0, text: '' }])).toBeNull()
  })

  it('spreads estimated words across each line in order', () => {
    const lyrics = buildTimedLyrics(regularSong(), 60000)
    expectWellFormed(lyrics)
    expect(lyrics.wordTiming).toBe('estimated')
    expect(lyrics.lines[0]!.words.map((w) => w.text)).toEqual([
      'Paper',
      'lanterns',
      'drifting',
      'over',
      'quiet',
      'water'
    ])
    expect(lyrics.lines[0]!.end).toBe(4200)
    expect(lyrics.lines[0]!.words.at(-1)!.end).toBe(4200)
  })

  it('gives longer words more time than short ones', () => {
    const lyrics = buildTimedLyrics([{ start: 0, end: 3000, text: 'a wonderful day' }])
    expectWellFormed(lyrics)
    const [a, wonderful] = lyrics.lines[0]!.words
    expect(wonderful!.end - wonderful!.start).toBeGreaterThan(a!.end - a!.start)
  })

  it('caps a line whose inferred end runs into a long instrumental gap', () => {
    const lyrics = buildTimedLyrics(regularSong(), 60000)
    expectWellFormed(lyrics)
    const beforeGap = lyrics.lines[4]!
    expect(beforeGap.text).toBe('Hold the light a little longer')
    expect(beforeGap.end).toBeLessThan(14400 + 8000)
  })

  it('ends a line exactly where a break line starts', () => {
    const lyrics = buildTimedLyrics([
      { start: 1000, text: 'sing it' },
      { start: 2500, text: '' },
      { start: 9000, text: 'again' }
    ])
    expectWellFormed(lyrics)
    expect(lyrics.lines).toHaveLength(2)
    expect(lyrics.lines[0]!.end).toBe(2500)
  })

  it('treats an explicit end equal to the next start as inferred', () => {
    const lyrics = buildTimedLyrics([
      { start: 0, end: 1500, text: 'one two three' },
      { start: 1500, end: 3000, text: 'four five six' },
      { start: 3000, end: 30000, text: 'seven eight' },
      { start: 30000, end: 31500, text: 'nine ten' }
    ])
    expectWellFormed(lyrics)
    expect(lyrics.lines[2]!.end).toBeLessThan(10000)
  })

  it('keeps an explicit end that finishes before the next line', () => {
    const lyrics = buildTimedLyrics([
      { start: 0, end: 1200, text: 'short line' },
      { start: 5000, text: 'next' }
    ])
    expectWellFormed(lyrics)
    expect(lyrics.lines[0]!.end).toBe(1200)
  })

  it('keeps native word timing and fills open ends', () => {
    const lyrics = buildTimedLyrics([
      {
        start: 10000,
        text: 'hi there',
        words: [
          { text: 'hi', start: 10000, end: 10500 },
          { text: 'there', start: 10500, end: Number.NaN }
        ]
      },
      { start: 12000, text: 'bye', words: [{ text: 'bye', start: 12000, end: 12600 }] }
    ])
    expectWellFormed(lyrics)
    expect(lyrics.wordTiming).toBe('native')
    expect(lyrics.lines[0]!.words[1]).toEqual({ text: 'there', start: 10500, end: 12000 })
  })

  it('splits a native chunk that holds several words', () => {
    const lyrics = buildTimedLyrics([
      { start: 0, text: 'hello there friend', words: [{ text: 'hello there friend', start: 0, end: 3000 }] }
    ])
    expectWellFormed(lyrics)
    expect(lyrics.lines[0]!.words.map((w) => w.text)).toEqual(['hello', 'there', 'friend'])
    expect(lyrics.lines[0]!.words.at(-1)!.end).toBe(3000)
  })

  it('reports estimated timing when only some lines are native', () => {
    const lyrics = buildTimedLyrics([
      { start: 0, text: 'a b', words: [{ text: 'a', start: 0, end: 400 }, { text: 'b', start: 400, end: 900 }] },
      { start: 1000, text: 'c d' }
    ])
    expect(lyrics?.wordTiming).toBe('estimated')
  })
})

describe('wordWeight', () => {
  it('adds a pause for punctuation and a hold for the last word', () => {
    const plain = wordWeight({ text: 'night', raw: 'night' }, false)
    expect(wordWeight({ text: 'night', raw: 'night,' }, false)).toBeGreaterThan(plain)
    expect(wordWeight({ text: 'night', raw: 'night.' }, false)).toBeGreaterThan(
      wordWeight({ text: 'night', raw: 'night,' }, false)
    )
    expect(wordWeight({ text: 'night', raw: 'night' }, true)).toBeGreaterThan(plain)
  })
})
