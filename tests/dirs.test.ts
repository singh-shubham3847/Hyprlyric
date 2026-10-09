import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { makeDir, makeDirSync } from '../src/main/dirs'

const errno = (code: string): NodeJS.ErrnoException => Object.assign(new Error(code), { code })

/**
 * A fake file system where Windows' Controlled folder access blocks one folder: creating it
 * fails with ENOENT even though its parent exists, exactly as Windows reports it.
 */
function protectedDisk(blocked: string) {
  const dirs = new Set([dirname(dirname(blocked)), dirname(blocked)])
  const calls: string[] = []
  const mk = (dir: string): void => {
    calls.push(dir)
    if (dir === blocked) throw errno('ENOENT')
    if (dirs.has(dir)) throw errno('EEXIST')
    if (!dirs.has(dirname(dir))) throw errno('ENOENT')
    dirs.add(dir)
  }
  return { dirs, calls, mk, mkAsync: async (dir: string) => mk(dir) }
}

describe('makeDir', () => {
  it('creates missing parents and accepts a folder that already exists', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'tal-dirs-')), 'a', 'b', 'Lyrics')
    await makeDir(dir)
    await makeDir(dir)
    expect(existsSync(dir)).toBe(true)
  })

  it('fails at once when Windows refuses the folder, instead of retrying forever', async () => {
    const blocked = join('C:', 'Users', 'me', 'Documents', 'app')
    const disk = protectedDisk(blocked)
    await expect(makeDir(join(blocked, 'Lyrics'), disk.mkAsync)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(disk.calls.length).toBeLessThanOrEqual(6)
  })

  it('fails for a path under a file', async () => {
    const base = mkdtempSync(join(tmpdir(), 'tal-dirs-'))
    writeFileSync(join(base, 'file'), 'x')
    await expect(makeDir(join(base, 'file', 'sub', 'dir'))).rejects.toThrow()
  })
})

describe('makeDirSync', () => {
  it('creates missing parents and accepts a folder that already exists', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'tal-dirs-')), 'logs', 'deep')
    makeDirSync(dir)
    makeDirSync(dir)
    expect(existsSync(dir)).toBe(true)
  })

  it('fails at once when Windows refuses the folder, instead of retrying forever', () => {
    const blocked = join('C:', 'Users', 'me', 'Documents', 'app')
    const disk = protectedDisk(blocked)
    expect(() => makeDirSync(join(blocked, 'logs'), disk.mk)).toThrow('ENOENT')
    expect(disk.calls.length).toBeLessThanOrEqual(6)
  })
})
