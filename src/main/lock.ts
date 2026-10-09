import { spawn } from 'node:child_process'
import { join } from 'node:path'
import type { Log } from './logger'

/** Locks Windows (the real sign-in screen). Tests set TAL_NO_LOCK=1 so the PC is never locked. */
export function lockWorkstation(log: Log): void {
  if (process.env['TAL_NO_LOCK'] === '1') {
    log('lock: would lock Windows now (skipped by TAL_NO_LOCK)')
    return
  }
  const rundll = join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'rundll32.exe')
  try {
    spawn(rundll, ['user32.dll,LockWorkStation'], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
    log('lock: locked Windows')
  } catch (err) {
    log(`lock: failed (${String(err)})`)
  }
}
