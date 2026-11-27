import { transcriptUrl, type PodcastTranscriptLink } from './podcast-transcripts.ts'

export interface TranscriptCheck {
  state: 'available' | 'unavailable' | 'unknown'
  status: number | null
}

/** Reject definite failures; bot blocks, throttling and timeouts are not 404s. */
export async function checkTranscriptLink(
  link: PodcastTranscriptLink,
  fetcher: typeof fetch = fetch,
): Promise<TranscriptCheck> {
  let url = transcriptUrl(link.url)
  if (!url) return { state: 'unavailable', status: null }
  try {
    const signal = AbortSignal.timeout(5000)
    for (let redirects = 0; redirects < 5; redirects++) {
      const response: Response = await fetcher(url, {
        redirect: 'manual', signal,
        headers: { Range: 'bytes=0-8191', 'User-Agent': 'QueerGuideBot/1.0 (+https://queer.guide/bot)' },
      })
      if (response.status >= 300 && response.status < 400) {
        const location: string | null = response.headers.get('location')
        await response.body?.cancel()
        url = location ? transcriptUrl(location, url) : null
        if (!url) return { state: 'unavailable', status: response.status }
        continue
      }
      if (!response.ok) {
        await response.body?.cancel()
        return { state: [404, 410].includes(response.status) ? 'unavailable' : 'unknown', status: response.status }
      }
      const type = response.headers.get('content-type') ?? ''
      if (/^(?:audio|video|image)\//i.test(type)) {
        await response.body?.cancel()
        return { state: 'unavailable', status: response.status }
      }
      const reader = response.body?.getReader()
      let text = '', bytes = 0
      if (reader) try {
        const decoder = new TextDecoder()
        while (bytes < 8192) {
          const chunk = await reader.read()
          if (chunk.done) break
          const part = chunk.value.subarray(0, 8192 - bytes)
          bytes += part.byteLength
          text += decoder.decode(part, { stream: true })
        }
      } finally { await reader.cancel() }
      const title = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''
      if (/just a moment|access denied|checking your browser/i.test(title)) return { state: 'unknown', status: response.status }
      if (!text.trim() || /page (?:not found|doesn.t exist)|\b404\b|\b410 gone\b|sign in|log in|domain (?:for sale|expired)/i.test(title)) {
        return { state: 'unavailable', status: response.status }
      }
      return { state: 'available', status: response.status }
    }
  } catch { /* A failed probe does not prove that a publisher removed a transcript. */ }
  return { state: 'unknown', status: null }
}

export async function checkTranscriptBatch(
  items: { id: string; source_hash: string; links: PodcastTranscriptLink[] }[],
  maxUrls = 24,
  fetcher: typeof fetch = fetch,
) {
  const results = new Map<string, TranscriptCheck>()
  const selected = []
  const urls = new Set<string>()
  for (const item of items) {
    const fresh = item.links.filter((link) => !urls.has(link.url))
    if (urls.size + new Set(fresh.map((link) => link.url)).size > maxUrls) continue
    for (const link of fresh) urls.add(link.url)
    selected.push(item)
  }
  const links = new Map(selected.flatMap((item) => item.links.map((link) => [link.url, link] as const)))
  const pending = [...links.values()]
  let cursor = 0
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < pending.length) {
      const link = pending[cursor++]
      results.set(link.url, await checkTranscriptLink(link, fetcher))
    }
  }))
  return {
    items: selected.map((item) => ({ ...item, links: item.links.filter((link) => results.get(link.url)?.state !== 'unavailable') })),
    rejected: [...results.values()].filter((r) => r.state === 'unavailable').length,
    deferred: items.length - selected.length,
  }
}
