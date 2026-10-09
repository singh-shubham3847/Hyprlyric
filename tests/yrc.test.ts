import { describe, expect, it } from 'vitest'
import { parseYrc } from '../src/main/lyrics/yrc'
import { buildTimedLyrics } from '../src/main/lyrics/word-timing'

// Original test text written for Hyprlyric (not a real song), in NetEase's word-timed format.
const FIXTURE = [
  '{"t":0,"c":[{"tx":"Test credits: "},{"tx":"hyprlyric"}]}',
  '[1000,3200](1000,400,0)Paper (1400,600,0)lanterns (2000,500,0)drifting (2500,300,0)over (2800,700,0)quiet (3500,700,0)water',
  '[4200,1500](4200,300,0)Ev(4500,300,0)ery (4800,500,0)window (5300,400,0)keeps',
  '',
  '[8000,1200](8000,300,0)光(8300,300,0)の(8600,600,0)道'
].join('\n')

describe('parseYrc', () => {
  it('reads line and word timing and skips credit lines', () => {
    const lines = parseYrc(FIXTURE)!
    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatchObject({ start: 1000, end: 4200, text: 'Paper lanterns drifting over quiet water' })
    expect(lines[0]!.words).toEqual([
      { text: 'Paper', start: 1000, end: 1400 },
      { text: 'lanterns', start: 1400, end: 2000 },
      { text: 'drifting', start: 2000, end: 2500 },
      { text: 'over', start: 2500, end: 2800 },
      { text: 'quiet', start: 2800, end: 3500 },
      { text: 'water', start: 3500, end: 4200 }
    ])
  })

  it('merges syllables of one word but keeps CJK characters separate', () => {
    const lines = parseYrc(FIXTURE)!
    expect(lines[1]!.words!.map((w) => [w.text, w.start, w.end])).toEqual([
      ['Every', 4200, 4800],
      ['window', 4800, 5300],
      ['keeps', 5300, 5700]
    ])
    expect(lines[2]!.words!.map((w) => w.text)).toEqual(['光', 'の', '道'])
  })

  it('feeds native word timing through to the stage', () => {
    const lyrics = buildTimedLyrics(parseYrc(FIXTURE)!)
    expect(lyrics?.wordTiming).toBe('native')
    expect(lyrics?.lines[1]!.words[0]).toEqual({ text: 'Every', start: 4200, end: 4800 })
  })

  it('returns null when there is nothing timed', () => {
    expect(parseYrc('')).toBeNull()
    expect(parseYrc('{"t":0,"c":[{"tx":"credits only"}]}')).toBeNull()
    expect(parseYrc('[not,timed] words')).toBeNull()
  })

  it('skips malformed lines and orders the rest', () => {
    const lines = parseYrc('[5000,800](5000,800,0)later\ngarbage line\n[1000,500](1000,500,0)earlier')!
    expect(lines.map((l) => l.text)).toEqual(['earlier', 'later'])
  })
})
