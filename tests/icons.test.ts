import { describe, expect, it } from 'vitest'
import { FLUENT_ICONS } from '../src/renderer/src/stage/icons/fluent.gen'
import { lemmaCandidates } from '../src/renderer/src/stage/icons/lemma'
import { fluentSvg, resolveIcon } from '../src/renderer/src/stage/icons/resolve'
import { WORD_ICONS } from '../src/renderer/src/stage/icons/word-map'

const GLUE = ['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'is', 'are', 'i', 'you', 'me', 'it', 'that', 'this']

describe('WORD_ICONS', () => {
  it('maps at least 700 words, like Verci', () => {
    expect(Object.keys(WORD_ICONS).length).toBeGreaterThanOrEqual(700)
  })

  it('references only Fluent icons that were generated', () => {
    for (const [word, value] of Object.entries(WORD_ICONS)) {
      expect(value, word).toMatch(/^(e:.+|f:[a-z0-9-]+)$/)
      if (value.startsWith('f:')) expect(FLUENT_ICONS[value.slice(2)], `${word} → ${value}`).toBeDefined()
    }
  })

  it('uses plain lowercase keys and leaves glue words unmapped', () => {
    for (const key of Object.keys(WORD_ICONS)) expect(key).toMatch(/^[a-z]+$/)
    for (const w of GLUE) expect(WORD_ICONS[w], w).toBeUndefined()
  })
})

describe('lemmaCandidates', () => {
  it('produces base forms for common inflections', () => {
    expect(lemmaCandidates('running')).toContain('run')
    expect(lemmaCandidates('cries')).toContain('cry')
    expect(lemmaCandidates('loved')).toContain('love')
    expect(lemmaCandidates('hearts')).toContain('heart')
    expect(lemmaCandidates('dancing')).toContain('dance')
    expect(lemmaCandidates('slowly')).toContain('slow')
    expect(lemmaCandidates('stopped')).toContain('stop')
    expect(lemmaCandidates("lovin'")).toContain('love')
    expect(lemmaCandidates('Heart’s')).toContain('heart')
  })

  it('starts with the word itself', () => {
    expect(lemmaCandidates('Fire')[0]).toBe('fire')
  })
})

describe('resolveIcon', () => {
  it('finds icons for inflected and capitalised words', () => {
    expect(resolveIcon('Hearts')).not.toBeNull()
    expect(resolveIcon('crying')).not.toBeNull()
    expect(resolveIcon('danced')).not.toBeNull()
    expect(resolveIcon('eyes')?.kind).toBe('fluent')
  })

  it('returns null for glue words and unknown words', () => {
    for (const w of GLUE) expect(resolveIcon(w), w).toBeNull()
    expect(resolveIcon('qwertyuiop')).toBeNull()
  })

  it('builds a tinted SVG for Fluent icons', () => {
    const ref = resolveIcon('fire')
    expect(ref?.kind).toBe('fluent')
    if (ref?.kind === 'fluent') {
      const svg = fluentSvg(ref, '#ca415e')
      expect(svg).toContain('viewBox="0 0')
      expect(svg).toContain('#ca415e')
      expect(svg).not.toContain('currentColor')
    }
  })
})
