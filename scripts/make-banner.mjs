import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, app } from 'electron'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const iconPngPath = join(root, 'resources', 'icon.png')
const iconBase64 = readFileSync(iconPngPath).toString('base64')
const outBannerPath = join(root, 'docs', 'images', 'banner.png')

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1280px;
    height: 640px;
    background: #08080c;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    color: #ffffff;
  }

  /* Ambient Glows */
  .glow-1 {
    position: absolute;
    width: 700px;
    height: 350px;
    top: 50px;
    left: 290px;
    background: radial-gradient(circle, rgba(255, 60, 110, 0.16) 0%, rgba(150, 30, 220, 0.08) 50%, transparent 70%);
    filter: blur(40px);
    pointer-events: none;
  }
  .glow-2 {
    position: absolute;
    width: 500px;
    height: 300px;
    bottom: 20px;
    left: 390px;
    background: radial-gradient(circle, rgba(130, 40, 240, 0.12) 0%, transparent 70%);
    filter: blur(50px);
    pointer-events: none;
  }

  /* 3D Kinetic Tesseract Grid in Background */
  .grid-bg {
    position: absolute;
    inset: 0;
    background-image: 
      linear-gradient(to right, rgba(255, 255, 255, 0.02) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
    background-size: 40px 40px;
    mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
    pointer-events: none;
  }

  /* Header Line: every word lights up */
  .lyrics-line {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 22px;
    margin-bottom: 58px;
    z-index: 2;
  }
  .word-dim {
    font-size: 58px;
    font-weight: 700;
    color: #ca415e;
    letter-spacing: -0.02em;
    opacity: 0.88;
  }
  .word-lit {
    position: relative;
    font-size: 64px;
    font-weight: 800;
    color: #ffffff;
    background: #e23b65;
    padding: 8px 30px;
    border-radius: 18px;
    box-shadow: 0 10px 40px rgba(226, 59, 101, 0.55), 0 0 80px rgba(226, 59, 101, 0.35);
    letter-spacing: -0.03em;
    display: inline-block;
  }
  .word-upcoming {
    font-size: 58px;
    font-weight: 700;
    color: #8c7684;
    letter-spacing: -0.02em;
  }

  /* Brand Card */
  .brand-card {
    display: flex;
    align-items: center;
    gap: 20px;
    z-index: 2;
    margin-bottom: 24px;
  }
  .brand-icon {
    width: 68px;
    height: 68px;
    border-radius: 18px;
    box-shadow: 0 8px 30px rgba(240, 50, 95, 0.35);
  }
  .brand-title {
    font-size: 62px;
    font-weight: 800;
    letter-spacing: -0.04em;
    color: #ffffff;
    text-shadow: 0 2px 20px rgba(255, 255, 255, 0.2);
  }

  /* Subtitle */
  .subtitle {
    font-size: 23px;
    color: #f1b3c4;
    font-weight: 500;
    margin-bottom: 16px;
    z-index: 2;
    letter-spacing: -0.01em;
  }
  .subtitle strong {
    color: #ffffff;
    font-weight: 700;
  }

  /* Meta tags */
  .meta {
    font-size: 15px;
    color: #7a6e78;
    letter-spacing: 0.05em;
    text-transform: lowercase;
    z-index: 2;
    font-weight: 500;
  }
</style>
</head>
<body>
  <div class="grid-bg"></div>
  <div class="glow-1"></div>
  <div class="glow-2"></div>

  <div class="lyrics-line">
    <span class="word-dim">every</span>
    <span class="word-dim">word</span>
    <span class="word-lit">lights</span>
    <span class="word-upcoming">up</span>
  </div>

  <div class="brand-card">
    <img class="brand-icon" src="data:image/png;base64,${iconBase64}" alt="Hyprlyric icon">
    <div class="brand-title">Hyprlyric</div>
  </div>

  <div class="subtitle">
    Word-by-word synced lyrics for <strong>Spotify</strong> and <strong>Apple Music</strong> on Windows
  </div>

  <div class="meta">
    free &amp; open source &bull; no account &bull; no installer
  </div>
</body>
</html>`

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 640,
    show: false,
    frame: false,
    webPreferences: {
      offscreen: true
    }
  })

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  // Wait a moment for layout & font rendering
  await new Promise((r) => setTimeout(r, 600))

  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1280, height: 640 })
  writeFileSync(outBannerPath, image.toPNG())
  console.log(`Successfully generated banner at ${outBannerPath}`)
  app.quit()
})
