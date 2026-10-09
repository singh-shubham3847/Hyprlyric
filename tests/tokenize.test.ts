import { describe, expect, it } from 'vitest'
import { countSyllables, tokenizeLine } from '../src/main/lyrics/tokenize'

describe('tokenizeLine', () => {
  it('strips edge punctuation for display but keeps the raw token', () => {
    const tokens = tokenizeLine('Hello, world!')
    expect(tokens.map((t) => t.text)).toEqual(['Hello', 'world'])
    expect(tokens.map((t) => t.raw)).toEqual(['Hello,', 'world!'])
  })

  it('keeps inner apostrophes and hyphens', () => {
    expect(tokenizeLine("don't stop rock-steady").map((t) => t.text)).toEqual(["don't", 'stop', 'rock-steady'])
  })

  it('splits CJK text into characters but keeps Latin runs together', () => {
    expect(tokenizeLine('夜空 光').map((t) => t.text)).toEqual(['夜', '空', '光'])
    expect(tokenizeLine('我love你').map((t) => t.text)).toEqual(['我', 'love', '你'])
  })

  it('keeps Hangul words whole', () => {
    expect(tokenizeLine('사랑해 너를').map((t) => t.text)).toEqual(['사랑해', '너를'])
  })

  it('keeps combining marks in Indic scripts', () => {
    expect(tokenizeLine('नहीं कभी').map((t) => t.text)).toEqual(['नहीं', 'कभी'])
    expect(tokenizeLine('நீ வா').map((t) => t.text)).toEqual(['நீ', 'வா'])
  })

  it('removes brackets and drops punctuation-only tokens', () => {
    expect(tokenizeLine('(ooh) - yeah ...').map((t) => t.text)).toEqual(['ooh', 'yeah'])
  })
})

describe('countSyllables', () => {
  it('estimates English syllables', () => {
    expect(countSyllables('a')).toBe(1)
    expect(countSyllables('beautiful')).toBe(3)
    expect(countSyllables('fire')).toBeGreaterThanOrEqual(1)
    expect(countSyllables('rhythm')).toBeGreaterThanOrEqual(1)
    expect(countSyllables('tomorrow')).toBe(3)
    expect(countSyllables('love')).toBe(1)
  })

  it('treats each CJK character and Hangul block as a syllable', () => {
    expect(countSyllables('光')).toBe(1)
    expect(countSyllables('사랑해')).toBe(3)
  })

  it('never returns less than one', () => {
    expect(countSyllables('')).toBe(1)
    expect(countSyllables('hmm')).toBe(1)
  })
})
