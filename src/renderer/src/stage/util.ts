export const clamp = (v: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, v))
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

export const easeOutCubic = (t: number): number => 1 - (1 - clamp(t)) ** 3
export const easeInOutCubic = (t: number): number => {
  const x = clamp(t)
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
}
export const easeOutBack = (t: number): number => {
  const x = clamp(t)
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2
}

/** Stable pseudo-random value in [-1, 1] for an integer seed. */
export function hashSigned(seed: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= h >>> 16
  return ((h >>> 0) / 0xffffffff) * 2 - 1
}

function parseHex(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Mixes two #rrggbb colours in sRGB (fine for short UI transitions). */
export function mixHex(a: string, b: string, t: number): string {
  const x = parseHex(a)
  const y = parseHex(b)
  const k = clamp(t)
  const c = x.map((v, i) => Math.round(v + (y[i]! - v) * k))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex)
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha)})`
}

export const FONT_STACK = '"Inter Variable", "Segoe UI Variable Display", "Segoe UI", sans-serif'
export const EMOJI_STACK = '"Segoe UI Emoji", "Segoe UI Symbol", sans-serif'
