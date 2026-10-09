import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BrowserWindow, ipcMain } from 'electron'
import { DEMO_LRC, DEMO_MOMENTS, DEMO_TRACK } from '@shared/demo-song'
import { IPC, type StageState } from '@shared/ipc'
import { DEFAULT_PALETTE } from '@shared/palette-defaults'
import { STYLE_IDS, type Palette, type ShowOn, type StyleId } from '@shared/types'
import { makeDirSync } from './dirs'
import { parseLrc } from './lyrics/lrc'
import { buildTimedLyrics } from './lyrics/word-timing'
import { harden, loadPage, secureWebPreferences } from './ui/windows'

export interface SnapshotOptions {
  outDir: string
  width?: number
  height?: number
  styles?: readonly StyleId[]
  mode?: ShowOn
  palette?: Palette
}

/**
 * Renders the demo song in every style offscreen and saves PNGs. Nothing appears on
 * screen, so it is safe to run while someone is using the PC.
 */
export async function runSnapshots(opts: SnapshotOptions): Promise<string[]> {
  const width = opts.width ?? 1536
  const height = opts.height ?? 864
  const lyrics = buildTimedLyrics(parseLrc(DEMO_LRC), DEMO_TRACK.durationMs)
  if (!lyrics) throw new Error('demo lyrics failed to parse')
  makeDirSync(opts.outDir)

  const win = new BrowserWindow({
    width,
    height,
    show: false,
    frame: false,
    backgroundColor: '#000000',
    webPreferences: secureWebPreferences({ offscreen: true })
  })
  harden(win)
  win.webContents.setFrameRate(30)
  await loadPage(win, 'stage')

  const written: string[] = []
  let nextId = 1
  const waitDone = (id: number): Promise<void> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        ipcMain.removeListener(IPC.stageSnapshotDone, onDone)
        reject(new Error(`snapshot ${id} timed out`))
      }, 10_000)
      const onDone = (_e: unknown, doneId: number): void => {
        if (doneId !== id) return
        clearTimeout(timer)
        ipcMain.removeListener(IPC.stageSnapshotDone, onDone)
        resolve()
      }
      ipcMain.on(IPC.stageSnapshotDone, onDone)
    })

  try {
    for (const style of opts.styles ?? STYLE_IDS) {
      const state: StageState = {
        track: DEMO_TRACK,
        lyrics,
        config: {
          style,
          mode: opts.mode ?? 'lock',
          palette: opts.palette ?? { ...DEFAULT_PALETTE },
          offsetMs: 0,
          ambientBackdrop: false,
          nowPlayingHud: false
        }
      }
      win.webContents.send(IPC.stageState, state)
      for (const [i, songMs] of DEMO_MOMENTS.entries()) {
        const id = nextId++
        const done = waitDone(id)
        win.webContents.send(IPC.stageSnapshot, { id, songMs, wallMs: 3_000 + i * 2_300 })
        await done
        const image = await win.webContents.capturePage()
        const file = join(opts.outDir, `${style}-${i + 1}.png`)
        writeFileSync(file, image.toPNG())
        written.push(file)
      }
    }
  } finally {
    win.destroy()
  }
  return written
}
