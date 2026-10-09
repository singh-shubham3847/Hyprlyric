import type { TimedWord } from '@shared/types'

/** One timed lyric line before word timing is finalised. Times are ms. */
export interface ParsedLine {
  start: number
  /** A real end, when the source knows where singing stops. */
  end?: number
  /** Empty text marks an instrumental break. */
  text: string
  /** Per-word timing from the source; `end` may be NaN when the source leaves it open. */
  words?: TimedWord[]
}

const LEADING_TIME = /^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/
const WORD_TIME = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/g
const META = /^\[([a-z#][\w#]*):(.*)\]$/i

export function timeToMs(min: string, sec: string, frac?: string): number {
  const fraction = frac ? Number(frac) * 10 ** (3 - frac.length) : 0
  return Number(min) * 60_000 + Number(sec) * 1000 + fraction
}

/**
 * Splits A2 "enhanced LRC" word tags. Pieces without a space between them are
 * syllables of the same word (`<t>beau<t>ti<t>ful`), so they are merged.
 */
function parseWordTags(content: string, lineStart: number): { text: string; words?: TimedWord[] } {
  const matches = [...content.matchAll(WORD_TIME)]
  if (!matches.length) return { text: content.replace(/\s+/g, ' ').trim() }

  const segments: { t: number; text: string }[] = []
  const lead = content.slice(0, matches[0]!.index).trim()
  if (lead) segments.push({ t: lineStart, text: `${lead} ` })
  matches.forEach((m, i) => {
    const from = m.index + m[0].length
    const to = i + 1 < matches.length ? matches[i + 1]!.index : content.length
    segments.push({ t: timeToMs(m[1]!, m[2]!, m[3]), text: content.slice(from, to) })
  })

  const words: TimedWord[] = []
  let current: { text: string; start: number } | null = null
  segments.forEach((seg, i) => {
    if (!seg.text.trim()) {
      if (current) words.push({ text: current.text.trim(), start: current.start, end: seg.t })
      current = null
      return
    }
    current ??= { text: '', start: seg.t }
    current.text += seg.text
    if (/\s$/.test(seg.text)) {
      words.push({ text: current.text.trim(), start: current.start, end: segments[i + 1]?.t ?? Number.NaN })
      current = null
    }
  })
  if (current !== null) {
    const open: { text: string; start: number } = current
    words.push({ text: open.text.trim(), start: open.start, end: Number.NaN })
  }

  const text = segments
    .map((s) => s.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  return words.length ? { text, words } : { text }
}

function shift(line: ParsedLine, delta: number): ParsedLine {
  if (!delta) return line
  return {
    ...line,
    start: line.start + delta,
    ...(line.end !== undefined ? { end: line.end + delta } : {}),
    ...(line.words ? { words: line.words.map((w) => ({ ...w, start: w.start + delta, end: w.end + delta })) } : {})
  }
}

/** Parses LRC (standard and A2 enhanced). Result is sorted; blank lines are kept as breaks. */
export function parseLrc(text: string): ParsedLine[] {
  let offset = 0
  const lines: ParsedLine[] = []

  for (const rawLine of text.split(/\r?\n/)) {
    let rest = rawLine.trim()
    if (!rest) continue

    const meta = META.exec(rest)
    if (meta) {
      if (meta[1]!.toLowerCase() === 'offset') {
        const value = Number(meta[2]!.trim())
        if (Number.isFinite(value)) offset = value
      }
      continue
    }

    const starts: number[] = []
    for (let m = LEADING_TIME.exec(rest); m; m = LEADING_TIME.exec(rest)) {
      starts.push(timeToMs(m[1]!, m[2]!, m[3]))
      rest = rest.slice(m[0].length)
    }
    if (!starts.length) continue

    const first = starts[0]!
    const parsed = parseWordTags(rest, first)
    for (const start of starts) {
      const line: ParsedLine = parsed.words ? { start: first, text: parsed.text, words: parsed.words } : { start: first, text: parsed.text }
      lines.push(shift(line, start - first))
    }
  }

  // LRC offset: a positive value shows lyrics sooner.
  const shifted = lines.map((l) => shift(l, -offset)).sort((a, b) => a.start - b.start)

  // Some files put a translation on the same timestamp; keep the first (original) line.
  const result: ParsedLine[] = []
  for (const line of shifted) {
    const prev = result.at(-1)
    if (prev && prev.start === line.start) {
      if (!prev.text && line.text) result[result.length - 1] = line
      continue
    }
    result.push(line)
  }
  return result
}
