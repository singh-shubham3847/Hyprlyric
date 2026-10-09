/**
 * A rounded colour square as raw BGRA pixels, for tray-menu colour wells
 * (`nativeImage.createFromBitmap`). Edges are anti-aliased; a slightly darker rim
 * keeps light colours visible on light menus.
 */
export function swatchBitmap(hex: string, size: number): Buffer {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  const n = m ? Number.parseInt(m[1]!, 16) : 0x808080
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const
  const rim = rgb.map((c) => Math.round(c * 0.72))
  const out = Buffer.alloc(size * size * 4)
  const radius = size * 0.22
  const inset = 0.5

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Signed distance to a rounded rectangle, sampled at the pixel centre.
      const px = x + 0.5
      const py = y + 0.5
      const qx = Math.abs(px - size / 2) - (size / 2 - inset - radius)
      const qy = Math.abs(py - size / 2) - (size / 2 - inset - radius)
      const dist = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius
      const coverage = Math.min(1, Math.max(0, 0.5 - dist))
      const isRim = dist > -1.2
      const [r, g, b] = isRim ? rim : rgb
      const i = (y * size + x) * 4
      out[i] = b!
      out[i + 1] = g!
      out[i + 2] = r!
      out[i + 3] = Math.round(coverage * 255)
    }
  }
  return out
}
