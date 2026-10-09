import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { makeDir } from '../dirs'
import type { TrackQuery } from './match'
import { cleanTitle, normalizeForMatch, primaryArtist } from './normalize'

const README = `Hyprlyric — your own lyrics
=========================

Drop synced lyric files here to use them instead of the online database.

Name each file:   <Artist> - <Title>.lrc
Example:          Lantern Test Band - Paper Lanterns.lrc

Standard LRC lines work:        [00:12.30]a line of words
Word-level ("enhanced") LRC is used exactly when present:
                                [00:12.30]<00:12.30>a <00:12.55>line <00:12.90>of <00:13.10>words

Matching ignores capitalisation, accents, punctuation and "feat." credits.
Changes are picked up the next time the song starts.
`

function decode(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le')
  return buf.toString('utf8')
}

/** User-supplied `.lrc` files, looked up before any network request. */
export class LocalLyrics {
  constructor(readonly dir: string) {}

  async ensureDir(): Promise<void> {
    await makeDir(this.dir)
    try {
      await writeFile(join(this.dir, 'README.txt'), README, { encoding: 'utf8', flag: 'wx' })
    } catch {
      // Already there.
    }
  }

  async find(q: TrackQuery): Promise<string | null> {
    let names: string[]
    try {
      names = await readdir(this.dir)
    } catch {
      return null
    }
    const artists = new Set([normalizeForMatch(q.artist), normalizeForMatch(primaryArtist(q.artist))])
    const titles = new Set([normalizeForMatch(q.title), normalizeForMatch(cleanTitle(q.title))])

    for (const name of names) {
      if (!/\.lrc$/i.test(name)) continue
      const base = name.slice(0, -4)
      const sep = base.indexOf(' - ')
      if (sep <= 0) continue
      const artist = normalizeForMatch(base.slice(0, sep))
      const title = normalizeForMatch(base.slice(sep + 3))
      if (artists.has(artist) && titles.has(title)) {
        return decode(await readFile(join(this.dir, name)))
      }
    }
    return null
  }
}
