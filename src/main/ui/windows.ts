import { join } from 'node:path'
import { app, type BrowserWindow, type WebPreferences } from 'electron'

export type Page = 'stage' | 'colors'

export const preloadPath = (): string => join(__dirname, '../preload/index.js')

/** Locked-down defaults for every Hyprlyric window. */
export function secureWebPreferences(extra: WebPreferences = {}): WebPreferences {
  return {
    preload: preloadPath(),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webSecurity: true,
    spellcheck: false,
    backgroundThrottling: false,
    ...extra
  }
}

export function harden(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event) => event.preventDefault())
}

export function loadPage(win: BrowserWindow, page: Page): Promise<void> {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) return win.loadURL(`${devUrl}/${page}.html`)
  return win.loadFile(join(__dirname, `../renderer/${page}.html`))
}
