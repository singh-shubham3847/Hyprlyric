/** sRGB channels 0–255. */
export interface Rgb {
  r: number
  g: number
  b: number
}

export interface Oklab {
  L: number
  a: number
  b: number
}

export interface Oklch {
  L: number
  C: number
  /** Degrees, 0–360. */
  h: number
}

export function hexToRgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return { r: 0, g: 0, b: 0 }
  const n = Number.parseInt(m[1]!, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

const channelHex = (v: number): string =>
  Math.round(Math.min(255, Math.max(0, Number.isFinite(v) ? v : 0)))
    .toString(16)
    .padStart(2, '0')

export const rgbToHex = ({ r, g, b }: Rgb): string => `#${channelHex(r)}${channelHex(g)}${channelHex(b)}`

const toLinear = (c: number): number => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

const fromLinear = (v: number): number => {
  const a = Math.abs(v)
  const s = a <= 0.0031308 ? 12.92 * a : 1.055 * a ** (1 / 2.4) - 0.055
  return 255 * Math.sign(v) * s
}

/** Björn Ottosson's OKLab, a perceptually uniform space (equal steps look equal). */
export function rgbToOklab({ r, g, b }: Rgb): Oklab {
  const lr = toLinear(r)
  const lg = toLinear(g)
  const lb = toLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  }
}

function oklabToLinear({ L, a, b }: Oklab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ]
}

export function oklabToRgb(lab: Oklab): Rgb {
  const [r, g, b] = oklabToLinear(lab)
  return { r: fromLinear(r), g: fromLinear(g), b: fromLinear(b) }
}

export function oklabToOklch({ L, a, b }: Oklab): Oklch {
  return { L, C: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 }
}

export function oklchToOklab({ L, C, h }: Oklch): Oklab {
  const rad = (h * Math.PI) / 180
  return { L, a: C * Math.cos(rad), b: C * Math.sin(rad) }
}

const inGamut = (lab: Oklab): boolean => oklabToLinear(lab).every((v) => v >= -1e-4 && v <= 1 + 1e-4)

/** OKLCH → hex, lowering chroma (keeping lightness and hue) until the colour fits sRGB. */
export function oklchToHex(L: number, C: number, h: number): string {
  const lightness = Math.min(1, Math.max(0, L))
  let lab = oklchToOklab({ L: lightness, C, h })
  if (!inGamut(lab)) {
    let lo = 0
    let hi = C
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (inGamut(oklchToOklab({ L: lightness, C: mid, h }))) lo = mid
      else hi = mid
    }
    lab = oklchToOklab({ L: lightness, C: lo, h })
  }
  return rgbToHex(oklabToRgb(lab))
}

export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/** WCAG 2 contrast ratio, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(hexToRgb(a))
  const lb = relativeLuminance(hexToRgb(b))
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}
