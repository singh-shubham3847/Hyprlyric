import { describe, expect, it } from 'vitest'
import { shipScale } from '../src/renderer/src/stage/emphasis'

describe('shipScale', () => {
  it('shrinks function words and keeps content words large', () => {
    expect(shipScale('the')).toBeLessThan(shipScale('shame'))
    expect(shipScale('a')).toBeLessThan(shipScale('could'))
    expect(shipScale('could')).toBeLessThan(shipScale('shame'))
    expect(shipScale('shame')).toBe(1)
  })

  it('ignores case and apostrophe style', () => {
    expect(shipScale('The')).toBe(shipScale('the'))
    expect(shipScale('I’m')).toBe(shipScale("i'm"))
  })

  it('stays within 0.5–1', () => {
    for (const w of ['a', 'oh', 'you', 'wonderful', '光', 'x']) {
      expect(shipScale(w)).toBeGreaterThanOrEqual(0.5)
      expect(shipScale(w)).toBeLessThanOrEqual(1)
    }
  })
})
