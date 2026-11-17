import { cleanText, excerptOf, firstHttpUrl } from './rss-parse.ts'

export function isIlgaMonitorFeed(url: string): boolean {
  const parsed = new URL(url)
  return parsed.hostname === 'monitor.ilga.org' && parsed.pathname === '/api/articles/latest_mou_general'
}

// This registered source publishes JSON, not RSS. Preserve the original
// headline and publisher URL; translated headlines are not source evidence.
export function parseIlgaMonitorItems(payload: unknown, maxItems: number): Record<string, unknown>[] {
  if (!Array.isArray(payload) || maxItems <= 0) return []
  const items: Record<string, unknown>[] = []
  for (const row of payload) {
    if (items.length >= maxItems) break
    if (!row || typeof row !== 'object') continue
    const url = firstHttpUrl(typeof row.u === 'string' ? row.u : null)
    const title = typeof row.h === 'string' ? cleanText(row.h) : ''
    if (!url || !title) continue
    const content = typeof row.d === 'string' ? cleanText(row.d) : ''
    const date = typeof row.da === 'string' && Number.isFinite(Date.parse(row.da)) ? row.da : null
    items.push({ title, url, content, excerpt: excerptOf(content), published_at: date,
      image_url: null, author: null, original_author: null })
  }
  return items
}
