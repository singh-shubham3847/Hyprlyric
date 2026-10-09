import { describe, expect, it } from 'vitest'
import { contrastRatio, hexToRgb, oklabToOklch, rgbToHex, rgbToOklab } from '../src/main/palette/color'
import { extractPalette, paletteFromColors } from '../src/main/palette/extract'
import { DEFAULT_COLORS } from '../src/shared/palette-defaults'

/** Builds a BGRA bitmap from a per-pixel colour function. */
function bitmap(w: number, h: number, color: (x: number, y: number) => [number, number, number, number?]): Uint8Array {
  const out = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a = 255] = color(x, y)
      const i = (y * w + x) * 4
      out[i] = b
      out[i + 1] = g
      out[i + 2] = r
      out[i + 3] = a
    }
  }
  return out
}

const hueOf = (hex: string): number => oklabToOklch(rgbToOklab(hexToRgb(hex))).h
const hueDistance = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

describe('colour helpers', () => {
  it('round-trips hex', () => {
    expect(rgbToHex(hexToRgb('#dc372a'))).toBe('#dc372a')
    expect(rgbToHex({ r: 300, g: -5, b: 127.6 })).toBe('#ff0080')
  })

  it('computes WCAG contrast', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0)
    expect(contrastRatio('#dc372a', '#000000')).toBeGreaterThan(4.5)
  })

  it('places pure red near 29° in OKLCH', () => {
    expect(hueOf('#ff0000')).toBeGreaterThan(25)
    expect(hueOf('#ff0000')).toBeLessThan(33)
  })
})

describe('extractPalette', () => {
  const redCover = bitmap(32, 32, (x, y) => ((x + y) % 7 === 0 ? [20, 18, 22] : [200, 30, 40]))

  it('builds a readable palette from a red cover', () => {
    const p = extractPalette(redCover, 32, 32)
    expect(p).not.toBeNull()
    expect(hueDistance(hueOf(p!.lyric), 25)).toBeLessThan(20)
    expect(contrastRatio(p!.lyric, '#000000')).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(p!.highlightText, p!.highlight)).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(p!.secondary, '#000000')).toBeGreaterThan(7)
  })

  it('uses a second hue for the highlight when the cover has one', () => {
    const twoTone = bitmap(40, 40, (x) => (x < 22 ? [220, 60, 30] : [40, 90, 220]))
    const p = extractPalette(twoTone, 40, 40)!
    expect(hueDistance(hueOf(p.lyric), hueOf(p.highlight))).toBeGreaterThan(40)
  })

  it('returns null for greyscale art so the defaults stay in use', () => {
    const grey = bitmap(32, 32, (x, y) => {
      const v = (x * 8 + y * 3) % 256
      return [v, v, v]
    })
    expect(extractPalette(grey, 32, 32)).toBeNull()
  })

  it('ignores transparent pixels and tiny inputs', () => {
    expect(extractPalette(bitmap(32, 32, () => [255, 0, 0, 0]), 32, 32)).toBeNull()
    expect(extractPalette(bitmap(2, 2, () => [255, 0, 0]), 2, 2)).toBeNull()
  })

  it('is deterministic', () => {
    expect(extractPalette(redCover, 32, 32)).toEqual(extractPalette(redCover, 32, 32))
  })

  it('keeps near-black covers readable', () => {
    const dark = bitmap(32, 32, (x) => (x < 16 ? [40, 8, 12] : [10, 10, 30]))
    const p = extractPalette(dark, 32, 32)
    if (p) expect(contrastRatio(p.lyric, '#000000')).toBeGreaterThanOrEqual(4.5)
  })
})

describe('paletteFromColors', () => {
  it('keeps the chosen colours and adds readable highlight text', () => {
    const p = paletteFromColors({ ...DEFAULT_COLORS })
    expect(p).toMatchObject(DEFAULT_COLORS)
    expect(p.highlightText).toBe('#fff1f3')
  })

  it('switches to dark text on a light highlight', () => {
    for (const highlight of ['#ffeeaa', '#aaffcc', '#ffffff', '#f0c000']) {
      const p = paletteFromColors({ ...DEFAULT_COLORS, highlight })
      expect(contrastRatio(p.highlightText, highlight)).toBeGreaterThanOrEqual(3)
    }
  })
})
