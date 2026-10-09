import { mkdirSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

// Node's mkdir(dir, { recursive: true }) never returns on Windows when Controlled folder access
// (ransomware protection) blocks the folder. Windows reports the block as ENOENT, which Node reads
// as "parent missing", so it recreates the parent and retries forever at full CPU. These helpers
// create one level at a time, so a blocked folder fails with an ordinary error instead.

const code = (err: unknown): string | undefined => (err as NodeJS.ErrnoException | null)?.code

/** Creates `dir` and any missing parents. `mk` is replaceable for tests. */
export async function makeDir(dir: string, mk: (dir: string) => Promise<unknown> = (d) => mkdir(d)): Promise<void> {
  try {
    await mk(dir)
    return
  } catch (err) {
    if (code(err) === 'EEXIST') return
    const parent = dirname(dir)
    if (code(err) !== 'ENOENT' || parent === dir) throw err
    await makeDir(parent, mk)
  }
  // The parent exists now, so a second ENOENT means Windows refused this folder.
  try {
    await mk(dir)
  } catch (err) {
    if (code(err) !== 'EEXIST') throw err
  }
}

/** `makeDir` for code that cannot wait, such as the logger. */
export function makeDirSync(dir: string, mk: (dir: string) => unknown = (d) => mkdirSync(d)): void {
  try {
    mk(dir)
    return
  } catch (err) {
    if (code(err) === 'EEXIST') return
    const parent = dirname(dir)
    if (code(err) !== 'ENOENT' || parent === dir) throw err
    makeDirSync(parent, mk)
  }
  try {
    mk(dir)
  } catch (err) {
    if (code(err) !== 'EEXIST') throw err
  }
}
