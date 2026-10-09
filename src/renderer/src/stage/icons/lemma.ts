const undouble = (s: string): string => (/([^aeiou])\1$/.test(s) && !/(ss|ll|ff|zz)$/.test(s) ? s.slice(0, -1) : s)

/**
 * Likely dictionary forms of a lyric word, most specific first:
 * "running" → running, runn, runne, run; "cries" → cries, cry, …; "lovin'" → …, love.
 */
export function lemmaCandidates(word: string): string[] {
  const out: string[] = []
  const add = (s: string): void => {
    if (s.length >= 2 && !out.includes(s)) out.push(s)
  }

  const w = word
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/'s$/, '')
    .replace(/[^a-z']/g, '')
  add(w.replace(/'/g, ''))

  // Dropped g: "lovin'" / "lovin" → "loving".
  const base = /in'$/.test(w) ? `${w.slice(0, -1)}g` : /[^aeiou]in$/.test(w) && w.length >= 5 ? `${w}g` : w.replace(/'/g, '')
  add(base)

  if (base.endsWith('ies')) add(`${base.slice(0, -3)}y`)
  if (base.endsWith('es')) add(base.slice(0, -2))
  if (base.endsWith('s') && !base.endsWith('ss')) add(base.slice(0, -1))
  if (base.endsWith('ied')) add(`${base.slice(0, -3)}y`)
  if (base.endsWith('ed')) {
    const stem = base.slice(0, -2)
    add(`${stem}e`)
    add(stem)
    add(undouble(stem))
  }
  if (base.endsWith('ing')) {
    const stem = base.slice(0, -3)
    add(stem)
    add(`${stem}e`)
    add(undouble(stem))
  }
  if (base.endsWith('ly')) add(base.slice(0, -2))
  if (base.endsWith('er') && base.length > 4) add(base.slice(0, -2))
  return out
}
