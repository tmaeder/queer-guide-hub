// Shared harness for the agentic-enrich family (city/event/hotel): URL
// normalization, size-capped streaming page fetch with timeout, HTML→text,
// and the enrichment_log daily-cap counter. Extracted from three cloned
// copies that had already drifted (byte caps, UA strings, variable names).

export function normalizeUrl(url: string): string {
  const t = (url ?? '').trim()
  return t && !/^https?:\/\//i.test(t) ? `https://${t}` : t
}

export function htmlToText(html: string): string {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script[^>]*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&#39;/g, "'").replace(/&quot;/gi, '"').replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ').trim()
}

export interface FetchPageOptions {
  userAgent?: string
  maxBytes?: number
  timeoutMs?: number
}

/**
 * GET a page and return its visible text, reading at most `maxBytes` of the
 * body (stream is cancelled after the cap) and aborting after `timeoutMs`.
 * Returns null on any failure — enrichment treats missing grounding as "skip".
 */
export async function fetchPageText(rawUrl: string, opts: FetchPageOptions = {}): Promise<string | null> {
  const url = normalizeUrl(rawUrl)
  if (!url) return null
  const maxBytes = opts.maxBytes ?? 500_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000)
  try {
    const resp = await fetch(url, {
      method: 'GET', signal: controller.signal, redirect: 'follow',
      headers: {
        'User-Agent': opts.userAgent ?? 'Mozilla/5.0 (compatible; QueerGuide-Enrich/1.0)',
        'Accept': 'text/html,*/*',
      },
    })
    if (!resp.ok || !resp.body) return null
    const reader = resp.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    while (total < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value); total += value.length
    }
    reader.cancel().catch(() => {})
    const len = chunks.reduce((n, c) => n + c.length, 0)
    const buf = new Uint8Array(len); let off = 0
    for (const c of chunks) { buf.set(c, off); off += c.length }
    return htmlToText(new TextDecoder('utf-8', { fatal: false }).decode(buf))
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * How many enrichment_log rows this step completed since UTC midnight — the
 * daily-cap counter shared by the agentic-enrich functions.
 */
// deno-lint-ignore no-explicit-any
export async function countDoneToday(supabase: any, step: string): Promise<number> {
  const since = new Date(); since.setUTCHours(0, 0, 0, 0)
  const { count } = await supabase
    .from('enrichment_log').select('id', { count: 'exact', head: true })
    .eq('step', step).eq('status', 'done').gte('created_at', since.toISOString())
  return count ?? 0
}
