// Renders the app's original icon (a white "a" monogram with a small sparkle, on the pink-red highlight
// colour of a lit word) to PNGs with Chromium and packs them into Windows .ico files.
// Run with: electron scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, app } from 'electron'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'resources')

/** Four-point sparkle centred on (x, y): long tips at radius r, a pinched waist at r * 0.28. */
function sparkle(x, y, r) {
  const w = r * 0.28
  return `M${x} ${y - r} L${x + w} ${y - w} L${x + r} ${y} L${x + w} ${y + w} L${x} ${y + r} L${x - w} ${y + w} L${x - r} ${y} L${x - w} ${y - w} Z`
}

/**
 * Hyprlyric Icon: A vibrant, geometric, futuristic 'H' monogram formed with hyper-clean isometric strokes
 * and dynamic sound/kinetic energy styling, glowing on a modern cyber-dark / neon gradient rounded squircle.
 */
function svg(size) {
  const small = size <= 24
  const radius = small ? 12 : 14
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#181528"/>
      <stop offset="1" stop-color="#0b0a12"/>
    </linearGradient>
    <linearGradient id="hGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff4b72"/>
      <stop offset="50%" stop-color="#ea3966"/>
      <stop offset="100%" stop-color="#9d21eb"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#ffb8c7"/>
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="60" height="60" rx="${radius}" fill="url(#bg)"/>
  <rect x="2" y="2" width="60" height="60" rx="${radius}" fill="none" stroke="url(#hGrad)" stroke-width="1.8" stroke-opacity="0.6"/>
  <!-- Kinetic H monogram -->
  <g fill="url(#hGrad)">
    <!-- Left pillar -->
    <rect x="15" y="14" width="9" height="36" rx="4.5"/>
    <!-- Right pillar -->
    <rect x="40" y="14" width="9" height="36" rx="4.5"/>
    <!-- Crossbar -->
    <rect x="21" y="28" width="22" height="8" rx="4"/>
  </g>
  <!-- Futuristic 3D dynamic core highlight -->
  <g fill="url(#accent)">
    <circle cx="19.5" cy="18.5" r="2.4"/>
    <circle cx="44.5" cy="45.5" r="2.4"/>
  </g>
  ${small ? '' : `<path d="${sparkle(50, 14, 5.5)}" fill="#ff5c8a"/>`}
</svg>`
}

async function render(win, size) {
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg(size))}`
  const dataUrl = await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = ${size}; c.height = ${size}
      c.getContext('2d').drawImage(img, 0, 0, ${size}, ${size})
      resolve(c.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('svg failed to load'))
    img.src = ${JSON.stringify(src)}
  })`)
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}

/** ICO container with PNG-compressed entries (supported since Windows Vista). */
function ico(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  const entries = []
  let offset = 6 + 16 * images.length
  for (const { size, png } of images) {
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0)
    e.writeUInt8(size >= 256 ? 0 : size, 1)
    e.writeUInt8(0, 2)
    e.writeUInt8(0, 3)
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(png.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += png.length
    entries.push(e)
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)])
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  await win.loadURL('data:text/html,<html><body></body></html>')
  const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256]
  const images = []
  for (const size of sizes) images.push({ size, png: await render(win, size) })
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'icon.png'), images.at(-1).png)
  writeFileSync(join(out, 'icon.ico'), ico(images))
  writeFileSync(join(out, 'tray.ico'), ico(images.filter((i) => i.size <= 64)))
  console.log(`wrote icon.png, icon.ico (${images.length} sizes) and tray.ico to ${out}`)
  app.quit()
})
