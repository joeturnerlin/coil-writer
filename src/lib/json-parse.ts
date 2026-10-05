/** Parses model JSON text, tolerating ```json fences and prose around the object. */
export function parseJsonLoose<T = unknown>(text: string, label = 'AI'): T {
  try {
    return JSON.parse(text) as T
  } catch {
    // Try to extract JSON from response if wrapped in markdown or preamble
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[0]) as T
      } catch {
        // fall through
      }
    }
    throw new Error(`Failed to parse ${label} response`)
  }
}
