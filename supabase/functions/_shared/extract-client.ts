import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { withCircuitBreaker, CircuitOpenError } from './circuit-breaker.ts'

// Client for the self-hosted deepcrawl extract worker (workers/extract).
// Fetches a URL server-side and returns cleaned markdown + metadata + (optional)
// a same-origin links list for crawl/discovery.
//
// Every call is wrapped in the `deepcrawl_extract` circuit breaker. On breaker
// trip OR any failure this returns null so callers degrade gracefully (e.g. the
// extract node falls back to the local readability-lite path). NEVER throws.

export interface ExtractMeta {
  title: string | null
  description: string | null
  lang: string | null
  author: string | null
  publishedAt: string | null
  image: string | null
}

export interface ExtractResult {
  url: string
  finalUrl: string
  markdown: string
  meta: ExtractMeta
  links?: { flat: string[]; external: string[] }
  method: 'fetch' | 'render'
  charCount: number
}

const BREAKER = 'deepcrawl_extract'
const RENDER_BREAKER = 'cf_browser_render'
const TIMEOUT_MS = 12_000

export async function extractContent(
  supabase: SupabaseClient,
  opts: { url: string; render?: boolean; crawl?: boolean },
): Promise<ExtractResult | null> {
  const base = Deno.env.get('EXTRACT_WORKER_URL')
  const secret = Deno.env.get('INTERNAL_INVOKE_SECRET')
  if (!base || !secret) {
    console.warn('extract-client: EXTRACT_WORKER_URL or INTERNAL_INVOKE_SECRET unset — skipping')
    return null
  }

  const breaker = opts.render ? RENDER_BREAKER : BREAKER

  try {
    return await withCircuitBreaker(supabase, breaker, async () => {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort('timeout'), TIMEOUT_MS)
      try {
        const res = await fetch(`${base.replace(/\/$/, '')}/extract`, {
          method: 'POST',
          signal: ctrl.signal,
          headers: {
            'content-type': 'application/json',
            'x-internal-secret': secret,
          },
          body: JSON.stringify({
            url: opts.url,
            render: opts.render === true,
            crawl: opts.crawl === true,
          }),
        })
        if (!res.ok) throw new Error(`extract worker ${res.status}`)
        return (await res.json()) as ExtractResult
      } finally {
        clearTimeout(t)
      }
    })
  } catch (err) {
    if (!(err instanceof CircuitOpenError)) {
      console.warn(`extract-client ${opts.url}: ${(err as Error).message}`)
    }
    return null
  }
}
