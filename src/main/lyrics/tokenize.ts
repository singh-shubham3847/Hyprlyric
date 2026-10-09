export interface Token {
  /** What gets displayed: edge punctuation removed. */
  text: string
  /** The original whitespace-separated piece, punctuation included (used for pause hints). */
  raw: string
}

/** Kana, CJK ideographs and halfwidth katakana read one character at a time. */
const CJK_CHAR = /[぀-ヿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ]/u
const HANGUL_SYLLABLE = /[가-힯]/u
/** Keeps letters, numbers and combining marks (Devanagari/Tamil vowel signs live in \p{M}). */
const EDGE_PUNCT = /^[^\p{L}\p{N}\p{M}]+|[^\p{L}\p{N}\p{M}]+$/gu

const clean = (piece: string): string => piece.replace(EDGE_PUNCT, '')

function splitCjk(raw: string): string[] {
  const pieces: string[] = []
  let run = ''
  for (const ch of raw) {
    if (CJK_CHAR.test(ch)) {
      if (run) pieces.push(run)
      run = ''
      pieces.push(ch)
    } else {
      run += ch
    }
  }
  if (run) pieces.push(run)
  return pieces
}

export function tokenizeLine(text: string): Token[] {
  const tokens: Token[] = []
  for (const raw of text.split(/\s+/u)) {
    if (!raw) continue
    for (const piece of CJK_CHAR.test(raw) ? splitCjk(raw) : [raw]) {
      const display = clean(piece)
      if (display) tokens.push({ text: display, raw: piece })
    }
  }
  return tokens
}

function latinSyllables(word: string): number {
  let s = word.replace(/[^a-z]/g, '')
  if (s.length <= 3) return 1
  s = s
    .replace(/(?:[^laeiouy]es|[^laeiouy]e)$/, '')
    .replace(/([^aeiouytd])ed$/, '$1')
    .replace(/^y/, '')
  return Math.max(1, s.match(/[aeiouy]+/g)?.length ?? 0)
}

/** Rough syllable count used to weight how long each word is sung. Always >= 1. */
export function countSyllables(word: string): number {
  const lower = word.toLowerCase()
  let blocks = 0
  for (const ch of lower) if (CJK_CHAR.test(ch) || HANGUL_SYLLABLE.test(ch)) blocks++
  if (blocks > 0) return blocks

  const base = lower.normalize('NFD').replace(/\p{M}/gu, '')
  if (/[a-z]/.test(base)) return latinSyllables(base)
  const cyrillic = base.match(/[аеёиоуыэюяіїє]+/g)
  if (cyrillic) return cyrillic.length
  const greek = base.match(/[αεηιουω]+/g)
  if (greek) return greek.length
  // Abugidas (Devanagari, Tamil, Thai…): each base letter roughly carries a syllable.
  const letters = Array.from(base).filter((c) => /\p{L}/u.test(c)).length
  return Math.max(1, letters)
}
