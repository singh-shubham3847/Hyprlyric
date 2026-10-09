import { resolve } from 'node:path'
import { app } from 'electron'
import { AppController } from './app-controller'
import { createLogger } from './logger'
import { resolvePaths } from './paths'
import { runSnapshots } from './snapshot'

// Hyprlyric never plays media itself, so it must not claim the keyboard media keys.
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,MediaSessionService')
// Performance optimizations: reduce background render load & memory footprint
// Prefer power-saving integrated GPU over high-power discrete GPU on dual-GPU laptops
app.commandLine.appendSwitch('force_low_power_gpu')
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256')

const argValue = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)

const argNumber = (name: string): number | undefined => {
  const value = Number(argValue(name))
  return Number.isFinite(value) ? value : undefined
}

const snapshotDir = argValue('snapshot')

if (process.argv.includes('--smoke')) {
  void app.whenReady().then(() => {
    console.log('TAL_READY')
    app.quit()
  })
} else if (snapshotDir) {
  void app.whenReady().then(async () => {
    try {
      const files = await runSnapshots({ outDir: resolve(snapshotDir) })
      console.log(`TAL_SNAPSHOTS ${files.length}`)
      app.quit()
    } catch (err) {
      console.error('snapshot failed:', err)
      app.exit(1)
    }
  })
} else {
  startApp()
}

function startApp(): void {
  const paths = resolvePaths()
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }
  const log = createLogger(paths.logFile, !app.isPackaged || process.argv.includes('--verbose'))
  process.on('uncaughtException', (err) => log(`error: uncaught ${err.stack ?? String(err)}`))
  process.on('unhandledRejection', (reason) => log(`error: unhandled rejection ${String(reason)}`))
  app.setAppUserModelId('hyprlyric')

  let controller: null | AppController = null
  // The desktop icon again while Hyprlyric runs: show the lyrics instead of starting a second copy.
  app.on('second-instance', () => controller?.showLyrics())
  // Hyprlyric lives in the tray; closing its windows must not quit it.
  app.on('window-all-closed', () => undefined)
  app.on('will-quit', () => controller?.stop())

  // A plain launch of the packaged app (desktop icon, Start menu) has no arguments; starting with
  // Windows passes --autostart, and development/test runs pass their own flags.
  const openedByUser = app.isPackaged && process.argv.length === 1

  void app.whenReady().then(async () => {
    controller = new AppController(
      paths,
      log,
      {
        captureAfterMs: argNumber('capture-after'),
        captureFile: argValue('capture-file'),
        openLockAfterMs: argNumber('open-lock-after'),
        returnAfterMs: argNumber('return-after'),
        colorsCaptureFile: argValue('capture-colors'),
        quitAfterMs: argNumber('quit-after')
      },
      { showLyricsOnLaunch: openedByUser }
    )
    try {
      await controller.start()
    } catch (err) {
      log(`error: failed to start (${err instanceof Error ? (err.stack ?? err.message) : String(err)})`)
      app.exit(1)
    }
  })
}
