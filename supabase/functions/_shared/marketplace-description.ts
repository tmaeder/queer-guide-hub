const SOURCE_DESCRIPTION_KEYS = [
  'description',
  'body_html',
  'bodyHtml',
  'body',
  'product_description',
  'translated_description',
  'excerpt',
  'summary',
]

export function marketplaceDescriptionPlainText(value: unknown): string {
  return String(value ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Deterministically recovers merchant copy from retained source payloads.
 * It deliberately does not generate or infer facts; model rewriting happens
 * only after this source-first step has produced a factual description.
 */
export function marketplaceDescriptionFromRaw(raw: Record<string, unknown>): string | null {
  const scopes: Record<string, unknown>[] = [raw]
  for (const key of ['product', 'item', 'data', 'attributes']) {
    const nested = raw[key]
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      scopes.push(nested as Record<string, unknown>)
    }
  }
  for (const scope of scopes) {
    for (const key of SOURCE_DESCRIPTION_KEYS) {
      if (typeof scope[key] !== 'string') continue
      const candidate = marketplaceDescriptionPlainText(scope[key])
      if (candidate.length >= 25) return candidate.slice(0, 4000)
    }
  }
  return null
}
