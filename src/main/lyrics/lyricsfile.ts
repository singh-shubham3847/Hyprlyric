import { parse } from 'yaml'
import type { TimedWord } from '@shared/types'
import type { ParsedLine } from './lrc'

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const ms = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null)

function readWords(v: unknown): TimedWord[] | undefined {
  if (!Array.isArray(v)) return undefined
  const words: TimedWord[] = []
  for (const w of v) {
    if (!isRecord(w) || typeof w.text !== 'string') continue
    const start = ms(w.start_ms)
    if (start === null) continue
    words.push({ text: w.text.trim(), start, end: ms(w.end_ms) ?? Number.NaN })
  }
  return words.length ? words : undefined
}

/**
 * Parses LRCLIB's `lyricsfile` YAML (`lines: [{ text, start_ms, end_ms, words? }]`).
 * Returns null when the document is unusable, so callers can fall back to `syncedLyrics`.
 */
export function parseLyricsfile(text: string): ParsedLine[] | null {
  let doc: unknown
  try {
    doc = parse(text)
  } catch {
    return null
  }
  if (!isRecord(doc) || !Array.isArray(doc.lines)) return null

  const lines: ParsedLine[] = []
  for (const item of doc.lines) {
    if (!isRecord(item)) continue
    const start = ms(item.start_ms)
    if (start === null) continue
    const end = ms(item.end_ms)
    const words = readWords(item.words)
    lines.push({
      start,
      ...(end !== null && end > start ? { end } : {}),
      text: typeof item.text === 'string' ? item.text.trim() : '',
      ...(words ? { words } : {})
    })
  }
  return lines.length ? lines.sort((a, b) => a.start - b.start) : null
}
