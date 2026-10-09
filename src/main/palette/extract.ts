import { DEFAULT_HIGHLIGHT_TEXT } from '@shared/palette-defaults'
import type { ColorRole, Palette } from '@shared/types'
import { contrastRatio, hueDistance, oklabToOklch, oklchToHex, rgbToOklab, type Oklab } from './color'

const DARK_TEXT = '#1c0a0f'
const CLUSTERS = 6
const ITERATIONS = 10
const MAX_SIDE_SAMPLES = 48
/** A cluster must cover this share of the cover to set a colour. */
const MIN_SHARE = 0.03
/** Below this OKLCH chroma a colour reads as grey. */
const MIN_CHROMA = 0.04

/** Completes three chosen colours with highlight text that stays readable on the box. */
export function paletteFromColors(colors: Record<ColorRole, string>): Palette {
  const candidates = [DEFAULT_HIGHLIGHT_TEXT, '#ffffff', DARK_TEXT, '#000000']
  const highlightText = candidates.find((t) => contrastRatio(t, colors.highlight) >= 3) ?? '#000000'
  return { lyric: colors.lyric, highlight: colors.highlight, secondary: colors.secondary, highlightText }
}

interface Cluster extends Oklab {
  count: number
}

function kmeans(points: Oklab[]): Cluster[] {
  // Deterministic start: centroids at lightness quantiles.
  const byLightness = [...points].sort((p, q) => p.L - q.L)
  let centroids: Oklab[] = Array.from({ length: CLUSTERS }, (_, i) => {
    const p = byLightness[Math.min(byLightness.length - 1, Math.floor(((i + 0.5) / CLUSTERS) * byLightness.length))]!
    return { L: p.L, a: p.a, b: p.b }
  })
  const assignment = new Int32Array(points.length)
  let counts: number[] = []

  for (let iteration = 0; iteration < ITERATIONS; iteration++) {
    points.forEach((p, i) => {
      let best = 0
      let bestDistance = Number.POSITIVE_INFINITY
      centroids.forEach((c, j) => {
        const d = (p.L - c.L) ** 2 + (p.a - c.a) ** 2 + (p.b - c.b) ** 2
        if (d < bestDistance) {
          bestDistance = d
          best = j
        }
      })
      assignment[i] = best
    })
    const sums = centroids.map(() => ({ L: 0, a: 0, b: 0, count: 0 }))
    points.forEach((p, i) => {
      const s = sums[assignment[i]!]!
      s.L += p.L
      s.a += p.a
      s.b += p.b
      s.count++
    })
    counts = sums.map((s) => s.count)
    centroids = sums.map((s, j) => (s.count ? { L: s.L / s.count, a: s.a / s.count, b: s.b / s.count } : centroids[j]!))
  }
  return centroids.map((c, j) => ({ ...c, count: counts[j] ?? 0 }))
}

/** Raises lightness until the colour reaches `min` contrast against `background`. */
function liftForContrast(L: number, C: number, h: number, background: string, min: number): string {
  let lightness = L
  let hex = oklchToHex(lightness, C, h)
  while (contrastRatio(hex, background) < min && lightness < 0.96) {
    lightness += 0.02
    hex = oklchToHex(lightness, C, h)
  }
  return hex
}

/** Darkens a box colour until light text on it reaches 3:1, without sinking into the black background. */
function boxColor(C: number, h: number): string {
  let lightness = 0.58
  let hex = oklchToHex(lightness, C, h)
  while (contrastRatio(DEFAULT_HIGHLIGHT_TEXT, hex) < 3 && lightness > 0.42) {
    lightness -= 0.02
    hex = oklchToHex(lightness, C, h)
  }
  return hex
}

/**
 * Album art (BGRA, as Electron's `nativeImage.toBitmap()` returns it on Windows) → the three
 * stage colours. Returns null for greyscale art so the caller keeps its current colours.
 */
export function extractPalette(bgra: Uint8Array, width: number, height: number): Palette | null {
  if (width < 4 || height < 4 || bgra.length < width * height * 4) return null

  const step = Math.max(1, Math.floor(Math.max(width, height) / MAX_SIDE_SAMPLES))
  const points: Oklab[] = []
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4
      if (bgra[i + 3]! < 128) continue
      points.push(rgbToOklab({ r: bgra[i + 2]!, g: bgra[i + 1]!, b: bgra[i]! }))
    }
  }
  if (points.length < 16) return null

  const colours = kmeans(points)
    .filter((c) => c.count > 0)
    .map((c) => ({ ...oklabToOklch(c), share: c.count / points.length }))
  const vivid = colours.filter((c) => c.share >= MIN_SHARE && c.C >= MIN_CHROMA)
  if (!vivid.length) return null

  const vibrancy = (c: { C: number; L: number; share: number }): number =>
    c.C * Math.sqrt(c.share) * (c.L < 0.12 || c.L > 0.96 ? 0.3 : 1)
  vivid.sort((p, q) => vibrancy(q) - vibrancy(p))

  const main = vivid[0]!
  const lyric = liftForContrast(Math.min(0.74, Math.max(0.62, main.L)), Math.max(main.C, 0.1), main.h, '#000000', 4.5)

  const contrastAccent = vivid.slice(1).find((c) => c.C >= 0.05 && hueDistance(c.h, main.h) >= 25)
  const accent = contrastAccent ?? [...vivid].sort((p, q) => q.C - p.C)[0]!
  const highlight = boxColor(Math.max(accent.C, 0.14), accent.h)

  const secondary = oklchToHex(0.84, Math.min(0.05, Math.max(0.02, main.C * 0.4)), main.h)

  return paletteFromColors({ lyric, highlight, secondary })
}
