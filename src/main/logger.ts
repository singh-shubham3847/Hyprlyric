import { appendFileSync, renameSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { makeDirSync } from './dirs'

export type Log = (message: string) => void

const MAX_BYTES = 1024 * 1024

/** Appends timestamped lines to `file` (rotating at 1 MB) and echoes them to stdout when asked. */
export function createLogger(file: string, echo: boolean): Log {
  let written = 0
  try {
    makeDirSync(dirname(file))
    written = statSync(file, { throwIfNoEntry: false })?.size ?? 0
    if (written > MAX_BYTES) {
      renameSync(file, `${file}.1`)
      written = 0
    }
  } catch {
    // Logging must never stop the app.
  }
  return (message: string) => {
    const line = `${new Date().toISOString()} ${message}\n`
    if (echo) process.stdout.write(line)
    try {
      appendFileSync(file, line, 'utf8')
      written += line.length
      if (written > MAX_BYTES) {
        renameSync(file, `${file}.1`)
        written = 0
      }
    } catch {
      // Disk full or file locked: drop the line.
    }
  }
}
