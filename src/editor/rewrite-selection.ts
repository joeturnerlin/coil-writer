/** Minimum non-whitespace selection length that can open the AI rewrite popup. */
export const MIN_REWRITE_CHARS = 20

/** Selection payload for the rewrite popup, or null when the selection is too short/empty. */
export function buildRewriteSelection(doc: string, from: number, to: number) {
  if (from === to) return null
  const text = doc.slice(from, to)
  if (text.trim().length < MIN_REWRITE_CHARS) return null
  const context = doc.slice(Math.max(0, from - 500), Math.min(doc.length, to + 500))
  return { from, to, text, context }
}
