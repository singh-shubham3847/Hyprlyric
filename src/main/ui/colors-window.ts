import { BrowserWindow, ipcMain, screen, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { IPC, type ColorsState } from '@shared/ipc'
import { HEX_COLOR } from '@shared/palette-defaults'
import type { ColorRole } from '@shared/types'
import type { Log } from '../logger'
import { harden, loadPage, secureWebPreferences } from './windows'

const ROLES: readonly ColorRole[] = ['lyric', 'highlight', 'secondary']
/** Content size (excluding the title bar), fitting every control without scrolling. */
const WIDTH = 400
const HEIGHT = 440

export interface ColorsWindowDeps {
  log: Log
  iconPath: string
  state: () => ColorsState
  setColor: (role: ColorRole, hex: string) => void
  setAutoSync: (on: boolean) => void
  reset: () => void
}

/** Small settings window with the three colour wells and Auto Sync (opened from the tray). */
export class ColorsWindow {
  private win: BrowserWindow | null = null

  constructor(private readonly deps: ColorsWindowDeps) {
    ipcMain.handle(IPC.colorsGet, (e: IpcMainInvokeEvent) => (this.fromOwn(e) ? deps.state() : null))
    ipcMain.on(IPC.colorsSet, (e: IpcMainEvent, role: unknown, hex: unknown) => {
      if (!this.fromOwn(e)) return
      if (!ROLES.includes(role as ColorRole) || typeof hex !== 'string' || !HEX_COLOR.test(hex)) return
      deps.setColor(role as ColorRole, hex.toLowerCase())
    })
    ipcMain.on(IPC.colorsAutoSync, (e: IpcMainEvent, on: unknown) => {
      if (this.fromOwn(e) && typeof on === 'boolean') deps.setAutoSync(on)
    })
    ipcMain.on(IPC.colorsReset, (e: IpcMainEvent) => {
      if (this.fromOwn(e)) deps.reset()
    })
  }

  open(): void {
    if (this.win && !this.win.isDestroyed()) {
      if (this.win.isMinimized()) this.win.restore()
      this.win.show()
      this.win.focus()
      return
    }
    const area = screen.getPrimaryDisplay().workArea
    const win = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      useContentSize: true,
      x: area.x + area.width - WIDTH - 24,
      y: Math.max(area.y, area.y + area.height - HEIGHT - 64),
      show: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      title: 'Hyprlyric Colors',
      icon: this.deps.iconPath,
      backgroundColor: '#1c1c1e',
      autoHideMenuBar: true,
      webPreferences: secureWebPreferences()
    })
    win.removeMenu()
    harden(win)
    win.once('ready-to-show', () => win.show())
    win.on('closed', () => {
      if (this.win === win) this.win = null
    })
    this.win = win
    loadPage(win, 'colors').catch((err: unknown) => this.deps.log(`colors: failed to load (${String(err)})`))
  }

  /** Debug/E2E helper: saves what the Colors window shows. */
  async capture(file: string): Promise<boolean> {
    if (!this.win || this.win.isDestroyed() || !this.win.isVisible()) return false
    const image = await this.win.webContents.capturePage()
    const { writeFileSync } = await import('node:fs')
    writeFileSync(file, image.toPNG())
    return true
  }

  push(state: ColorsState): void {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send(IPC.colorsState, state)
  }

  destroy(): void {
    if (this.win && !this.win.isDestroyed()) this.win.destroy()
    this.win = null
  }

  private fromOwn(e: IpcMainEvent | IpcMainInvokeEvent): boolean {
    return !!this.win && !this.win.isDestroyed() && e.sender === this.win.webContents
  }
}
