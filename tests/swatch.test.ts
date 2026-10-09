import { describe, expect, it } from 'vitest'
import { swatchBitmap } from '../src/main/ui/swatch'

describe('swatchBitmap', () => {
  it('returns a BGRA square of the requested size', () => {
    expect(swatchBitmap('#ca415e', 16)).toHaveLength(16 * 16 * 4)
  })

  it('fills the centre with the colour (BGRA order, opaque)', () => {
    const size = 16
    const bmp = swatchBitmap('#ca415e', size)
    const i = (8 * size + 8) * 4
    expect([bmp[i], bmp[i + 1], bmp[i + 2], bmp[i + 3]]).toEqual([0x5e, 0x41, 0xca, 255])
  })

  it('rounds the corners', () => {
    const bmp = swatchBitmap('#ffffff', 16)
    expect(bmp[3]).toBe(0)
  })

  it('falls back to grey for invalid input', () => {
    const bmp = swatchBitmap('nope', 8)
    const i = (4 * 8 + 4) * 4
    expect(bmp[i + 2]).toBe(bmp[i])
  })
})
