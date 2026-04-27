import {
  getServiceClient,
  jsonResponse,
  errorResponse,
  corsResponse,
} from '../_shared/supabase-client.ts'

// ============================================================
// Source: Bluesky URL → community_submissions
// ------------------------------------------------------------
// Public endpoint. User pastes a Bluesky post URL. We resolve the
// handle to a DID and fetch the post thread via the public AppView.
// No auth required for public posts. Always inserts as 'pending'.
// ============================================================

const PUBLIC_API = 'https://public.api.bsky.app'
const RATE_LIMIT_PER_HOUR = 20

interface PostUrlParts {
  handle: string
  rkey: string
}

function parsePostUrl(u: string): PostUrlParts | null {
  try {
    const url = new URL(u)
    if (!/(^|\.)bsky\.app$/.test(url.hostname)) return null
    const m = url.pathname.match(/^\/profile\/([^/]+)\/post\/([^/]+)\/?$/)
    if (!m) return null
    return { handle: decodeURIComponent(m[1]), rkey: m[2] }
  } catch {
    return null
  }
}

async function resolveHandleToDid(handle: string): Promise<string> {
  const res = await fetch(
    `${PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
    { signal: AbortSignal.timeout(10_000) },
  )
  if (!res.ok) throw new Error(`resolveHandle ${res.status}`)
  const data = await res.json()
  if (!data?.did) throw new Error('did missing')
  return data.did
}

async function getPostThread(did: string, rkey: string): Promise<Record<string, unknown>> {
  const uri = `at://${did}/app.bsky.feed.post/${rkey}`
  const res = await fetch(
    `${PUBLIC_API}/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=0&parentHeight=0`,
    { signal: AbortSignal.timeout(10_000) },
  )
  if (!res.ok) throw new Error(`getPostThread ${res.status}`)
  return await res.json()
}

function extractMedia(post: Record<string, unknown>): { text: string; media: string[] } {
  const record = (post.record ?? {}) as Record<string, unknown>
  const text = typeof record.text === 'string' ? record.text : ''
  const media: string[] = []
  const embed = (post.embed ?? {}) as Record<string, unknown>
  const images = (embed.images ?? []) as Array<{ fullsize?: string; thumb?: string }>
  for (const img of images) {
    if (img.fullsize) media.push(img.fullsize)
    else if (img.thumb) media.push(img.thumb)
  }
  const video = (embed.video ?? embed.playlist ?? null) as string | null
  if (typeof video === 'string') media.push(video)
  return { text, media }
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
      .eq('platform', 'bluesky')
      .gte('submitted_at', oneHourAgo)
    if ((count || 0) >= RATE_LIMIT_PER_HOUR) {
      return errorResponse(`Rate limit exceeded (${RATE_LIMIT_PER_HOUR}/hour)`, 429, req)
    }

    const body = await req.json().catch(() => ({}))
    const url = String(body.url ?? '').trim()
    if (!url) return errorResponse('url required', 400, req)
    const parts = parsePostUrl(url)
    if (!parts) return errorResponse('not a bluesky post URL', 400, req)

    let did: string
    try {
      did = await resolveHandleToDid(parts.handle)
    } catch (e) {
      return errorResponse(`resolveHandle failed: ${(e as Error).message}`, 502, req)
    }

    let thread: Record<string, unknown>
    try {
      thread = await getPostThread(did, parts.rkey)
    } catch (e) {
      return errorResponse(`getPostThread failed: ${(e as Error).message}`, 502, req)
    }

    const post = ((thread.thread as Record<string, unknown>)?.post ?? {}) as Record<string, unknown>
    const { text, media } = extractMedia(post)

    const { data: row, error: insErr } = await supabase
      .from('community_submissions')
      .insert({
        platform: 'bluesky',
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
          handle: parts.handle,
          did,
          rkey: parts.rkey,
        },
      })
      .select('id')
      .single()

    if (insErr) return errorResponse(`insert: ${insErr.message}`, 500, req)

    return jsonResponse(
      { success: true, submission_id: row.id, text, media_count: media.length },
      200,
      req,
    )
  } catch (err) {
    console.error('source-bluesky-url:', err)
    return errorResponse((err as Error).message, 500, req)
  }
})
