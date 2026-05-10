import {
import { withErrorReporting } from '../_shared/report-api-error.ts'
  getServiceClient,
  jsonResponse,
  errorResponse,
  corsResponse,
} from '../_shared/supabase-client.ts'

// ============================================================
// Source: Generic social URL → community_submissions
// ------------------------------------------------------------
// Fallback connector for Instagram, Facebook, X, FetLife, Signal,
// or any URL we can extract OG meta from. We don't try platform
// APIs (most require auth/scraping) — we just scrape OG/Twitter
// card meta tags and let the human reviewer fill the gaps.
// ============================================================

const RATE_LIMIT_PER_HOUR = 30
const FETCH_TIMEOUT_MS = 12_000
const MAX_HTML_BYTES = 1_500_000

const PLATFORM_HOST_MATCHERS: Array<[RegExp, string]> = [
  [/(^|\.)instagram\.com$/i, 'instagram'],
  [/(^|\.)facebook\.com$/i, 'facebook'],
  [/(^|\.)fb\.com$/i, 'facebook'],
  [/(^|\.)twitter\.com$/i, 'x'],
  [/(^|\.)x\.com$/i, 'x'],
  [/(^|\.)fetlife\.com$/i, 'fetlife'],
  [/(^|\.)signal\.org$/i, 'signal'],
  [/(^|\.)bsky\.app$/i, 'bluesky'],
  [/(^|\.)tiktok\.com$/i, 'tiktok'],
]

function detectPlatform(u: string): string {
  try {
    const host = new URL(u).hostname
    for (const [re, name] of PLATFORM_HOST_MATCHERS) {
      if (re.test(host)) return name
    }
    return 'web'
  } catch {
    return 'other'
  }
}

interface OGMeta {
  title: string | null
  description: string | null
  image: string | null
  site_name: string | null
  url: string | null
}

function extractMeta(html: string): OGMeta {
  const get = (re: RegExp): string | null => {
    const m = html.match(re)
    return m?.[1]?.trim() || null
  }
  const og = (prop: string) =>
    new RegExp(
      `<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']*)["']`,
      'i',
    )
  const tw = (name: string) =>
    new RegExp(
      `<meta[^>]+name=["']twitter:${name}["'][^>]+content=["']([^"']*)["']`,
      'i',
    )
  return {
    title: get(og('title')) ?? get(tw('title')) ?? get(/<title[^>]*>([^<]*)<\/title>/i),
    description: get(og('description')) ?? get(tw('description')),
    image: get(og('image')) ?? get(tw('image')),
    site_name: get(og('site_name')),
    url: get(og('url')),
  }
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; queer.guide/1.0; +https://queer.guide)',
      Accept: 'text/html,*/*',
    },
  })
  if (!res.ok) throw new Error(`fetch ${res.status}`)
  const reader = res.body?.getReader()
  if (!reader) return await res.text()
  const decoder = new TextDecoder()
  let html = ''
  let total = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    total += value.byteLength
    html += decoder.decode(value, { stream: true })
    if (total >= MAX_HTML_BYTES) {
      try {
        await reader.cancel()
      } catch { /* ignore */ }
      break
    }
  }
  html += decoder.decode()
  return html
}

Deno.serve(withErrorReporting('source-social-url', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  if (req.method !== 'POST') return errorResponse('POST only', 405, req)

  const supabase = getServiceClient()

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Missing authorization', 401, req)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return errorResponse('Invalid authorization', 401, req)

    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString()
    const { count } = await supabase
      .from('community_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('submitted_by', user.id)
      .eq('sub_source_type', 'url_import')
      .gte('submitted_at', oneHourAgo)
    if ((count || 0) >= RATE_LIMIT_PER_HOUR) {
      return errorResponse(`Rate limit exceeded (${RATE_LIMIT_PER_HOUR}/hour)`, 429, req)
    }

    const body = await req.json().catch(() => ({}))
    const url = String(body.url ?? '').trim()
    if (!url) return errorResponse('url required', 400, req)
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return errorResponse('invalid url', 400, req)
    }
    if (!/^https?:$/.test(parsed.protocol)) {
      return errorResponse('http(s) only', 400, req)
    }

    const platform = detectPlatform(url)

    let html: string
    try {
      html = await fetchHtml(url)
    } catch (e) {
      return errorResponse(`fetch failed: ${(e as Error).message}`, 502, req)
    }

    const meta = extractMeta(html)
    const text = [meta.title, meta.description].filter(Boolean).join('\n\n')
    const media = meta.image ? [meta.image] : []

    const { data: row, error: insErr } = await supabase
      .from('community_submissions')
      .insert({
        platform,
        sub_source_type: 'url_import',
        status: 'pending',
        media_processing_status: media.length ? 'pending' : 'not_applicable',
        submitted_by: user.id,
        source_url: url,
        raw_text: text,
        media_urls: media.length ? media : null,
        permission_level: 'public_share',
        sensitivity_level: 'public',
        submitter_metadata: {
          og: meta,
          host: parsed.hostname,
        },
      })
      .select('id')
      .single()

    if (insErr) return errorResponse(`insert: ${insErr.message}`, 500, req)

    return jsonResponse(
      {
        success: true,
        submission_id: row.id,
        platform,
        title: meta.title,
        has_image: media.length > 0,
      },
      200,
      req,
    )
  } catch (err) {
    console.error('source-social-url:', err)
    return errorResponse((err as Error).message, 500, req)
  }
}))
