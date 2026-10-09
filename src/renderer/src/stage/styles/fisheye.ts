import { DEFAULT_PALETTE } from '@shared/palette-defaults'
import type { Palette, ShowOn } from '@shared/types'
import { iconImage, iconVersion, preloadIcons } from '../icons/raster'
import { resolveIcon } from '../icons/resolve'
import { activeWordIndex, type LyricsModel } from '../model'
import { EMOJI_STACK, FONT_STACK, clamp, easeOutBack, easeOutCubic, lerp, mixHex } from '../util'
import { LensRenderer } from './lens'
import type { FrameInfo, StageStyle } from './types'

const WEIGHT = 700
const HISTORY = 6
const LOOKAHEAD = 5
const ROW_EM = 1.1
const LINE_GAP_EM = 0.24
const ENTER_MS = 260
const WIPE_MS = 150
const PREVIEW_MS = 3000
const ICON_EM = 0.84
const ICON_GAP_EM = 0.3
const PAD_X_EM = 0.14
const PAD_Y_EM = 0.1

/**
 * Fisheye: a vertical stack of words seen through a convex glass lens (WebGL). The word
 * being sung sits at the centre, closest to the glass. `withIcons` adds the Visual icons.
 */
export function createFisheye(withIcons: boolean): StageStyle {
  let host: HTMLDivElement | null = null
  let glCanvas: HTMLCanvasElement | null = null
  let lens: LensRenderer | null = null
  const source = document.createElement('canvas')
  const ctx = source.getContext('2d')!
  let model: LyricsModel | null = null
  let palette: Palette = { ...DEFAULT_PALETTE }
  let mode: ShowOn = 'lock'
  let pixelW = 0
  let pixelH = 0
  let lastSignature = ''
  const widths = new Map<number, number>()

  function textWidth(i: number, size: number): number {
    let unit = widths.get(i)
    if (unit === undefined) {
      ctx.font = `${WEIGHT} 100px ${FONT_STACK}`
      ctx.letterSpacing = '-2px'
      unit = ctx.measureText(model!.words[i]!.text).width / 100
      widths.set(i, unit)
    }
    return unit * size
  }

  function layout(focus: number, from: number, to: number, size: number): Map<number, number> {
    const words = model!.words
    const step = (a: number, b: number): number =>
      size * ROW_EM + (words[a]!.line !== words[b]!.line ? size * LINE_GAP_EM : 0)
    const ys = new Map<number, number>([[focus, 0]])
    for (let i = focus - 1; i >= from; i--) ys.set(i, ys.get(i + 1)! - step(i, i + 1))
    for (let i = focus + 1; i <= to; i++) ys.set(i, ys.get(i - 1)! + step(i - 1, i))
    return ys
  }

  /** Paints the flat word stack; the lens bends it afterwards. */
  function paint(t: number, W: number, H: number, dpr: number): string {
    const words = model?.words ?? []
    let c = model ? activeWordIndex(model, t) : -1
    const preview = c < 0
    if (!words.length || (preview && t < words[0]!.start - PREVIEW_MS)) {
      const signature = `empty|${W}x${H}`
      if (signature !== lastSignature) ctx.clearRect(0, 0, source.width, source.height)
      return signature
    }
    if (preview) c = 0

    const current = words[c]!
    const enterMs = Math.min(ENTER_MS, Math.max(90, (current.end - current.start) * 0.8))
    const p = preview ? 0 : clamp((t - current.start) / enterMs)
    const wipe = preview ? 0 : clamp((t - current.start) / WIPE_MS)
    const iconPop = preview ? 0 : clamp((t - current.start - 60) / 320)
    const next = words[c + 1]
    const idle = preview ? 0 : t - current.end
    const dim = clamp((idle - 2500) / 1500) * clamp(((next ? next.start - t : Number.POSITIVE_INFINITY) - 400) / 1200)
    const previewFade = preview ? clamp((t - (words[0]!.start - PREVIEW_MS)) / 800) : 1

    // Quantised so a settled stack stops re-uploading its texture every frame.
    const q = (v: number): number => Math.round(v * 60)
    const signature = [c, preview, q(p), q(wipe), withIcons ? q(iconPop) : 0, q(dim), q(previewFade), palette.lyric,
      palette.highlight, palette.highlightText, palette.secondary, W, H, iconVersion()].join('|')
    if (signature === lastSignature) return signature

    const size = Math.min(H * 0.085, W * 0.075)
    const from = Math.max(0, c - HISTORY)
    const to = Math.min(words.length - 1, c + LOOKAHEAD)
    const target = layout(c, from, to, size)
    const before = !preview && c > 0 ? layout(c - 1, Math.max(0, c - 1 - HISTORY), to, size) : null
    const e = easeOutCubic(p)

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'

    for (let i = from; i <= to; i++) {
      const word = words[i]!
      const y = H / 2 + lerp(before?.get(i) ?? target.get(i)!, target.get(i)!, e)
      if (y < -size * 2 || y > H + size * 2) continue
      const tw = textWidth(i, size)
      const icon = withIcons ? resolveIcon(word.text) : null
      const iconSize = size * ICON_EM
      const groupW = tw + (icon ? size * ICON_GAP_EM + iconSize : 0)
      const x0 = W / 2 - groupW / 2

      let alpha = 1
      let color = palette.lyric
      let scale = 1
      let box = 0
      let iconScale = 1
      if (preview) {
        const k = i - c
        color = palette.secondary
        alpha = (k === 0 ? 0.6 : k === 1 ? 0.34 : 0.16) * previewFade
        iconScale = 0
      } else if (i === c) {
        // Text turns light in step with the box wiping in, so it never floats without its box.
        color = mixHex(palette.secondary, palette.highlightText, wipe)
        scale = lerp(0.88, 1, easeOutBack(p))
        box = wipe
        iconScale = easeOutBack(iconPop)
      } else if (i < c) {
        const age = c - i - 1 + e
        if (i === c - 1) {
          box = 1 - clamp(p * 1.8)
          color = box > 0.5 ? palette.highlightText : palette.lyric
        }
        alpha = (1 - Math.min(0.5, 0.1 * age)) * clamp(HISTORY - age) * (1 - 0.6 * dim)
      } else {
        const k = i - c
        color = palette.secondary
        alpha = (k === 1 ? 0.62 : k === 2 ? 0.36 : 0.2) * (before && before.has(i) ? 1 : e) * (1 - 0.5 * dim)
        iconScale = 0
      }

      ctx.save()
      ctx.globalAlpha = alpha
      if (scale !== 1) {
        ctx.translate(W / 2, y)
        ctx.scale(scale, scale)
        ctx.translate(-W / 2, -y)
      }
      if (box > 0) {
        // The current word's box wipes in left to right; the previous word's box fades out.
        const padX = size * PAD_X_EM
        const padY = size * PAD_Y_EM
        const wiping = i === c
        ctx.fillStyle = palette.highlight
        ctx.globalAlpha = wiping ? alpha : alpha * box
        ctx.beginPath()
        ctx.roundRect(x0 - padX, y - size / 2 - padY, (tw + padX * 2) * (wiping ? box : 1), size + padY * 2, size * 0.05)
        ctx.fill()
        ctx.globalAlpha = alpha
      }
      ctx.font = `${WEIGHT} ${size}px ${FONT_STACK}`
      ctx.letterSpacing = `${-0.02 * size}px`
      ctx.fillStyle = color
      ctx.fillText(word.text, x0, y + size * 0.04)

      if (icon && iconScale > 0.01) {
        const cx = x0 + tw + size * ICON_GAP_EM + iconSize / 2
        ctx.translate(cx, y)
        ctx.scale(iconScale, iconScale)
        if (icon.kind === 'emoji') {
          ctx.font = `${iconSize * 0.92}px ${EMOJI_STACK}`
          ctx.textAlign = 'center'
          ctx.letterSpacing = '0px'
          ctx.fillText(icon.char, 0, iconSize * 0.04)
          ctx.textAlign = 'left'
        } else {
          const img = iconImage(icon, palette.highlight)
          if (img) ctx.drawImage(img, -iconSize / 2, -iconSize / 2, iconSize, iconSize)
        }
      }
      ctx.restore()
    }
    return signature
  }

  return {
    mount(root) {
      host = document.createElement('div')
      host.className = 'fisheye'
      glCanvas = document.createElement('canvas')
      glCanvas.className = 'fisheye-canvas'
      host.append(glCanvas)
      root.append(host)
      lens = new LensRenderer(glCanvas)
      if (!lens.ok) {
        // No WebGL: show the flat stack instead of the lens.
        glCanvas.remove()
        source.className = 'fisheye-canvas'
        host.append(source)
      }
    },

    setLyrics(next) {
      model = next
      widths.clear()
      lastSignature = ''
    },

    setPalette(next) {
      palette = next
    },

    setMode(next) {
      mode = next
    },

    async ready() {
      if (withIcons && model) await preloadIcons(model.words.map((w) => w.text), palette.highlight)
      await document.fonts.load(`${WEIGHT} 100px "Inter Variable"`)
      lastSignature = ''
    },

    frame({ songMs, wallMs, width: W, height: H }: FrameInfo): boolean {
      if (!host) return false
      const dpr = window.devicePixelRatio || 1
      const w = Math.max(1, Math.round(W * dpr))
      const h = Math.max(1, Math.round(H * dpr))
      if (w !== pixelW || h !== pixelH) {
        pixelW = w
        pixelH = h
        source.width = w
        source.height = h
        lens?.resize(w, h)
        lastSignature = ''
      }
      const signature = paint(songMs, W, H, dpr)
      const changed = signature !== lastSignature
      lastSignature = signature
      if (lens?.ok) {
        const strength = 0.42 + 0.025 * Math.sin(wallMs / 2600)
        const lock = mode === 'lock'
        lens.draw(
          source,
          { strength, radius: 0.64, aberration: 0.014, opaque: lock, fadeTop: 0.17, fadeSpan: lock ? 0.2 : 0 },
          changed
        )
      }
      // Only the slow lens "breathing" is left when the stack did not change.
      return changed
    },

    destroy() {
      lens?.dispose()
      host?.remove()
      host = null
      glCanvas = null
      lens = null
    }
  }
}
