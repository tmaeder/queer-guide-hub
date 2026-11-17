export { sitemapLocations } from '../_shared/sitemap-locations.ts'

export function robotsSitemaps(robots: string): string[] {
  // Splitting with split(':', 2) truncates https://host/path to just "https".
  return robots.split(/\r?\n/).flatMap(line => {
    const match = /^\s*sitemap\s*:\s*(\S+)/i.exec(line)
    if (!match) return []
    try {
      const url = new URL(match[1])
      return ['http:', 'https:'].includes(url.protocol) ? [url.href] : []
    } catch { return [] }
  })
}

export function sitemapPathMatchers(patterns: string[]): RegExp[] {
  return patterns.map(pattern => {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`^${escaped.replace(/\\\*/g, '.*')}$`, 'i')
  })
}

// Keep the complete prefix (including complete structured-data blocks) and
// cancel large response bodies before a DOM parser can materialize them all.
export async function readScrapeBody(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = value.subarray(0, maxBytes - total)
      chunks.push(chunk)
      total += chunk.byteLength
    }
    if (total >= maxBytes) {
      await reader.cancel()
      console.warn(`Scrape response reached ${maxBytes}-byte budget; parsing complete prefix blocks only`)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder().decode(bytes)
}
