import { join, resolve } from 'node:path'
import { app } from 'electron'

export interface AppPaths {
  userData: string
  settingsFile: string
  cacheDir: string
  logFile: string
  /**
   * User-supplied `.lrc` files, beside the settings. Not in Documents: Windows' ransomware protection
   * (Controlled folder access) stops a new app from creating folders there.
   */
  lyricsDir: string
  bridgeScript: string
  trayIcon: string
  appIcon: string
}

/**
 * Must run before `app.ready`: `TAL_PROFILE` redirects all app data (used by tests so they
 * never touch the real settings), and `TAL_LYRICS_DIR` redirects the local lyrics folder.
 */
export function resolvePaths(): AppPaths {
  const profile = process.env['TAL_PROFILE']
  if (profile) app.setPath('userData', resolve(profile))
  const userData = app.getPath('userData')
  const resources = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
  return {
    userData,
    settingsFile: join(userData, 'settings.json'),
    cacheDir: join(userData, 'lyrics-cache'),
    logFile: join(userData, 'logs', 'hyprlyric.log'),
    lyricsDir: process.env['TAL_LYRICS_DIR'] ? resolve(process.env['TAL_LYRICS_DIR']) : join(userData, 'Lyrics'),
    bridgeScript: join(resources, 'smtc-bridge.ps1'),
    trayIcon: join(resources, 'tray.ico'),
    appIcon: join(resources, 'icon.ico')
  }
}
