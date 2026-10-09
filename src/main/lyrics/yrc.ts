import type { TimedWord } from '@shared/types'
import type { ParsedLine } from './lrc'

const LINE_HEAD = /^\[(\d+),(\d+)\]/
/** `(startMs,durationMs,flag)text` — one timed piece (a word, a syllable or a CJK character). */
const PIECE = /\((\d+),(\d+),-?\d+\)([^(]*)/g
const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ가-힯]/u

/**
 * Parses NetEase's word-timed lyrics ("YRC"): `[lineStart,lineDuration](start,duration,0)word…`,
 * all in milliseconds. Credit lines (JSON objects) are skipped. Pieces without a trailing space
 * are syllables of the same word and are merged; CJK characters stay separate words.
 */
export function parseYrc(text: string): ParsedLine[] | null {
  const lines: ParsedLine[] = []

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('{')) continue
    const head = LINE_HEAD.exec(line)
    if (!head) continue
    const start = Number(head[1])
    const duration = Number(head[2])

    const words: TimedWord[] = []
    let pending: TimedWord | null = null
    const flush = (): void => {
      if (pending) words.push(pending)
      pending = null
    }

    for (const m of line.slice(head[0].length).matchAll(PIECE)) {
      const pieceStart = Number(m[1])
      const pieceEnd = pieceStart + Number(m[2])
      const piece = m[3] ?? ''
      const word = piece.trim()
      if (!word) {
        flush()
        continue
      }
      if (CJK.test(word)) {
        flush()
        words.push({ text: word, start: pieceStart, end: pieceEnd })
        continue
      }
      if (pending) {
        const joined: TimedWord = pending
        joined.text += word
        joined.end = pieceEnd
      } else {
        pending = { text: word, start: pieceStart, end: pieceEnd }
      }
      if (/\s$/.test(piece)) flush()
    }
    flush()

    if (words.length) {
      lines.push({ start, end: start + duration, text: words.map((w) => w.text).join(' '), words })
    }
  }

  return lines.length ? lines.sort((a, b) => a.start - b.start) : null
}
