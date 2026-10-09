import { FLUENT_ICONS } from './fluent.gen'
import { lemmaCandidates } from './lemma'
import { WORD_ICONS } from './word-map'

export type IconRef =
  | { kind: 'emoji'; char: string }
  | { kind: 'fluent'; name: string; body: string; size: number }

const cache = new Map<string, IconRef | null>()

/** The icon for a sung word, or null when the word has none. */
export function resolveIcon(word: string): IconRef | null {
  const key = word.toLowerCase()
  const hit = cache.get(key)
  if (hit !== undefined) return hit

  let ref: IconRef | null = null
  for (const candidate of lemmaCandidates(word)) {
    const value = WORD_ICONS[candidate]
    if (!value) continue
    if (value.startsWith('e:')) {
      ref = { kind: 'emoji', char: value.slice(2) }
      break
    }
    const icon = FLUENT_ICONS[value.slice(2)]
    if (icon) {
      ref = { kind: 'fluent', name: value.slice(2), ...icon }
      break
    }
  }
  cache.set(key, ref)
  return ref
}

/** Standalone SVG markup for a Fluent icon filled with `color`. */
export function fluentSvg(icon: { body: string; size: number }, color: string): string {
  const body = icon.body.replace(/currentColor/g, color)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${icon.size} ${icon.size}" width="${icon.size}" height="${icon.size}" fill="${color}">${body}</svg>`
}
