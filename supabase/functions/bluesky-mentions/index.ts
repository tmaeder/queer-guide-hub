// bluesky-mentions — fills entity_bluesky_mentions for the "On Bluesky" rail
// (Phase 6c of the AT Protocol plan). See migration 99991792522276 for the
// matching and safety rules; this function only fetches and filters.
//
// Search: api.bsky.app answers app.bsky.feed.searchPosts without auth
// (public.api.bsky.app returns 403 for search).
//
// Auth: x-internal-secret (cron) or admin. Body: { title_limit?, dry_run? }.

import { getCorsHeaders, getServiceClient, jsonResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { type BskyPostView, isBlocked, queerGuidePaths, quotesTitle, toRow } from './mentions.ts'

const APPVIEW = 'https://api.bsky.app'

async function search(q: string, limit: number): Promise<BskyPostView[]> {
  const url = `${APPVIEW}/xrpc/app.bsky.feed.searchPosts?sort=latest&limit=${limit}&q=${encodeURIComponent(q)}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`searchPosts ${res.status} for ${q}`)
  return (await res.json()).posts ?? []
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })
  const supabase = getServiceClient()
  const auth = await requireInternalOrAdmin(req, supabase)
  if (auth instanceof Response) return auth

  const body = await req.json().catch(() => ({}))
  const titleLimit = Math.min(25, Math.max(0, Number(body.title_limit ?? 10)))
  const dryRun = body.dry_run === true
  const botHandle = (Deno.env.get('BLUESKY_BOT_HANDLE') ?? '').toLowerCase()
  const keep = (p: BskyPostView) => !isBlocked(p) && p.author?.handle?.toLowerCase() !== botHandle

  const rows: ReturnType<typeof toRow>[] = []
  const errors: string[] = []
  let blocked = 0

  // 1. Posts linking to queer.guide pages.
  try {
    const posts = await search('domain:queer.guide', 100)
    const byPath = new Map<string, BskyPostView[]>()
    for (const p of posts) {
      if (!keep(p)) { blocked++; continue }
      for (const path of queerGuidePaths(p)) byPath.set(path, [...(byPath.get(path) ?? []), p])
    }
    if (byPath.size) {
      const { data, error } = await supabase.rpc('bluesky_mention_resolve', { p_paths: [...byPath.keys()] })
      if (error) throw error
      for (const r of data ?? []) for (const p of byPath.get(r.path) ?? []) rows.push(toRow(p, r.entity_type, r.entity_id, 'link'))
    }
  } catch (e) {
    errors.push(`domain search: ${e}`)
  }

  // 2. Featured upcoming events by exact title.
  if (titleLimit) {
    const { data: targets, error } = await supabase.rpc('bluesky_mention_title_targets', { p_limit: titleLimit })
    if (error) errors.push(`targets: ${error.message}`)
    for (const t of targets ?? []) {
      try {
        for (const p of await search(`"${t.title}"`, 25)) {
          if (!keep(p)) { blocked++; continue }
          if (quotesTitle(p, t.title)) rows.push(toRow(p, 'event', t.entity_id, 'title'))
        }
      } catch (e) {
        errors.push(`title ${t.title}: ${e}`)
      }
    }
  }

  // One row per post: a link match beats a title match.
  const unique = [...new Map([...rows.filter((r) => r.match_kind === 'title'), ...rows.filter((r) => r.match_kind === 'link')].map((r) => [r.at_uri, r])).values()]

  if (!dryRun && unique.length) {
    // ignoreDuplicates: an admin-hidden row is never resurrected by a re-run.
    const { error } = await supabase.from('entity_bluesky_mentions').upsert(unique, { onConflict: 'at_uri', ignoreDuplicates: true })
    if (error) errors.push(`upsert: ${error.message}`)
  }

  const status = errors.length && !unique.length ? 502 : 200
  return jsonResponse({ dry_run: dryRun, found: unique.length, blocked, errors, ...(dryRun ? { rows: unique } : {}) }, status, req)
})
