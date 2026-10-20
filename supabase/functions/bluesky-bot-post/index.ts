// bluesky-bot-post — posts new news + featured upcoming events from the
// official @queer.guide Bluesky account (Phase 6d of the AT Protocol plan).
//
// What may be posted is decided ONLY by the SQL selector bluesky_bot_candidates
// (never gated, deindexed, duplicate, past or adult-tagged). Each post is
// recorded in bluesky_bot_posts, whose primary key makes a repeat impossible.
//
// Raw XRPC over fetch (createSession + createRecord) instead of @atproto/api:
// two calls do not justify bundling the SDK into an edge function.
//
// Auth: x-internal-secret (cron) or admin. Body: { limit?, dry_run? }.
// Secrets: BLUESKY_BOT_HANDLE, BLUESKY_BOT_APP_PASSWORD (app password, never
// the account password). Missing secrets = a no-op that says so.

import { getCorsHeaders, getServiceClient, jsonResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { buildPost, type Candidate } from './post.ts'

const PDS = Deno.env.get('BLUESKY_BOT_PDS') ?? 'https://bsky.social'

async function xrpc(method: string, body: unknown, token?: string) {
  const res = await fetch(`${PDS}/xrpc/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${method} ${res.status}: ${json.error ?? ''} ${json.message ?? ''}`.trim())
  return json
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })

  const supabase = getServiceClient()
  const auth = await requireInternalOrAdmin(req, supabase)
  if (auth instanceof Response) return auth

  const body = await req.json().catch(() => ({}))
  const limit = Math.min(10, Math.max(1, Number(body.limit) || 3))
  const dryRun = body.dry_run === true

  const { data, error } = await supabase.rpc('bluesky_bot_candidates', { p_limit: limit })
  if (error) return jsonResponse({ error: error.message }, 500, req)
  const candidates = (data ?? []) as Candidate[]

  if (dryRun) {
    return jsonResponse({ dry_run: true, would_post: candidates.map((c) => buildPost(c)) }, 200, req)
  }

  const identifier = Deno.env.get('BLUESKY_BOT_HANDLE')
  const password = Deno.env.get('BLUESKY_BOT_APP_PASSWORD')
  if (!identifier || !password) {
    return jsonResponse({ skipped: 'BLUESKY_BOT_HANDLE / BLUESKY_BOT_APP_PASSWORD not set', candidates: candidates.length }, 200, req)
  }
  if (!candidates.length) return jsonResponse({ posted: 0 }, 200, req)

  let session: { did: string; accessJwt: string }
  try {
    session = await xrpc('com.atproto.server.createSession', { identifier, password })
  } catch (e) {
    return jsonResponse({ error: String(e) }, 502, req)
  }

  const posted: string[] = []
  const errors: string[] = []
  for (const c of candidates) {
    try {
      const res = await xrpc(
        'com.atproto.repo.createRecord',
        { repo: session.did, collection: 'app.bsky.feed.post', record: buildPost(c) },
        session.accessJwt,
      )
      const { error: insErr } = await supabase
        .from('bluesky_bot_posts')
        .insert({ entity_type: c.entity_type, entity_id: c.entity_id, at_uri: res.uri })
      // A failed bookkeeping write would repost next run: delete the post rather than risk a duplicate.
      if (insErr) {
        const rkey = String(res.uri).split('/').pop()
        await xrpc('com.atproto.repo.deleteRecord', { repo: session.did, collection: 'app.bsky.feed.post', rkey }, session.accessJwt).catch(() => {})
        throw new Error(`record ${insErr.message}`)
      }
      posted.push(res.uri)
    } catch (e) {
      errors.push(`${c.entity_type}:${c.entity_id} ${e}`)
    }
  }

  // Any error with nothing posted is a failed run, so auto-pause can see it.
  const status = errors.length && !posted.length ? 502 : 200
  return jsonResponse({ posted: posted.length, uris: posted, errors }, status, req)
})
