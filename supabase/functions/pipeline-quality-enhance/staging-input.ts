import { assertPublicHttpUrl } from '../_shared/ssrf-guard.ts'

export const STAGED_NEWS_INPUT_VERSION = 'normalized-news.2026.10.22.1'

function text(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim()
}

function articleUrl(...values: unknown[]): string | undefined {
  for (const value of values) {
    const candidate = text(value)
    if (!candidate) continue
    try {
      const parsed = assertPublicHttpUrl(candidate)
      if (!parsed.username && !parsed.password) return candidate
    } catch { /* Try the next source field. */ }
  }
}

/** Read both legacy flat rows and the shape emitted by pipeline-normalize. */
export function readStagedNewsInput(n: Record<string, unknown>) {
  const metadata = n.metadata && typeof n.metadata === 'object' && !Array.isArray(n.metadata)
    ? n.metadata as Record<string, unknown> : {}
  const urls = Array.isArray(n.urls) ? n.urls : []
  return {
    title: text(n.title, n.name) ?? '',
    content: text(n.content, n.body, n.description) ?? '',
    excerpt: text(n.excerpt, metadata.excerpt, n.description),
    // Match the committer's source identity; retain the old flat fallback.
    url: articleUrl(n.url, urls[0], metadata.url, n.source_url),
    sourceName: text(n.source_name, n.sourceName, metadata.source_name, metadata.publisher_name),
  }
}
