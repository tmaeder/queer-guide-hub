import {
  getServiceClient,
  jsonResponse,
  errorResponse,
  corsResponse,
} from '../_shared/supabase-client.ts'

// ============================================================
// Source: TikTok URL → community_submissions
// ------------------------------------------------------------
// Public endpoint. User pastes a TikTok URL. We hit TikTok oEmbed
// for caption + thumbnail + author. If TIKTOK_DOWNLOADER_URL is
// configured (self-hosted yt-dlp), we resolve the direct video
// URL too. Always inserts as 'pending' — review-gate forces human
// approval for social platforms.
// ============================================================

const TIKTOK_DOWNLOADER_URL = Deno.env.get('TIKTOK_DOWNLOADER_URL') || ''
const RATE_LIMIT_PER_HOUR = 20

interface OEmbedResponse {
  title?: string
  author_name?: string
  author_url?: string
  thumbnail_url?: string
  html?: string
  provider_name?: string
}

function isTikTokUrl(u: string): boolean {
  try {
    const url = new URL(u)
    return /(^|\.)tiktok\.com$/.test(url.hostname)
  } catch {
    return false
  }
}

async function fetchOEmbed(url: string): Promise<OEmbedResponse> {
  const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
  const res = await fetch(endpoint, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`oembed ${res.status}`)
  return await res.json()
}

async function tryResolveVideoUrl(tiktokUrl: string): Promise<string | null> {
  if (!TIKTOK_DOWNLOADER_URL) return null
  try {
    const res = await fetch(TIKTOK_DOWNLOADER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: tiktokUrl }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return null
    const data = await res.json()
    return typeof data?.video_url === 'string' ? data.video_url : null
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
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
      .eq('platform', 'tiktok')
      .gte('submitted_at', oneHourAgo)
    if ((count || 0) >= RATE_LIMIT_PER_HOUR) {
      return errorResponse(`Rate limit exceeded (${RATE_LIMIT_PER_HOUR}/hour)`, 429, req)
    }

    const body = await req.json().catch(() => ({}))
    const url = String(body.url ?? '').trim()
    if (!url) return errorResponse('url required', 400, req)
    if (!isTikTokUrl(url)) return errorResponse('not a tiktok URL', 400, req)

    let oembed: OEmbedResponse
    try {
      oembed = await fetchOEmbed(url)
    } catch (e) {
      return errorResponse(`oembed failed: ${(e as Error).message}`, 502, req)
    }

    const caption = oembed.title || ''
    const thumbnail = oembed.thumbnail_url || ''
    const videoUrl = await tryResolveVideoUrl(url)

    const mediaUrls = [thumbnail, videoUrl].filter(Boolean) as string[]

    const { data: row, error: insErr } = await supabase
      .from('community_submissions')
      .insert({
        platform: 'tiktok',
        sub_source_type: 'url_import',
        status: 'pending',
        media_processing_status: mediaUrls.length ? 'pending' : 'not_applicable',
        submitted_by: user.id,
        source_url: url,
        raw_text: caption,
        media_urls: mediaUrls.length ? mediaUrls : null,
        permission_level: 'public_share',
        sensitivity_level: 'public',
        submitter_metadata: {
          author_name: oembed.author_name ?? null,
          author_url: oembed.author_url ?? null,
          provider: oembed.provider_name ?? 'TikTok',
          oembed_html: oembed.html ?? null,
          has_video_url: Boolean(videoUrl),
        },
      })
      .select('id')
      .single()

    if (insErr) return errorResponse(`insert: ${insErr.message}`, 500, req)

    return jsonResponse(
      {
        success: true,
        submission_id: row.id,
        caption,
        thumbnail,
        has_video: Boolean(videoUrl),
      },
      200,
      req,
    )
  } catch (err) {
    console.error('source-tiktok-url:', err)
    return errorResponse((err as Error).message, 500, req)
  }
})
