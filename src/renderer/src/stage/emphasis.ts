/** Glue words that stay small in the Ship wall, so content words carry the size. */
const SMALL = new Set([
  'a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'by', 'for', 'and', 'or', 'but', 'so', 'as', 'if', 'is', 'am',
  'are', 'was', 'be', 'i', "i'm", 'im', "i'll", "i've", "i'd", 'me', 'my', 'we', 'us', 'our', 'you', 'your',
  "you're", 'it', 'its', "it's", 'he', 'she', 'his', 'her', 'they', 'them', 'their', 'this', 'that', 'with',
  'from', 'up', 'oh', 'ooh', 'ah', 'yeah', 'la', 'na', 'da', 'do', 'just', 'then', 'than', 'there', 'when'
])

/** Helpers and short words: a step down, but still bold. */
const MEDIUM = new Set([
  'could', 'would', 'should', 'will', 'can', 'have', 'has', 'had', 'been', 'were', 'what', 'where', 'who', 'how',
  'all', 'not', "don't", 'dont', "can't", 'cant', "won't", 'wont', 'every', 'some', 'into', 'onto', 'over', 'like',
  'know', 'got', 'get', 'let', 'make', 'made', 'said', 'say', 'too', 'now', 'here', 'still', 'only'
])

/** Relative font size of a word in the Ship wall (0.5 small glue words … 1 content words). */
export function shipScale(word: string): number {
  const w = word.toLowerCase().replace(/’/g, "'")
  if (SMALL.has(w)) return 0.5
  if (MEDIUM.has(w)) return 0.78
  return [...w].length <= 2 ? 0.7 : 1
}
