import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { normalizeSocialLinks, normalizeHandle, canonicalizeUrl, type SocialPlatformKey } from '../_shared/social.ts'

// ============================================================
// Social Card Refresh (Pillar B)
// Seeds social_profiles from entity social links (enrichable platforms only),
// then resolves pending/stale rows via the image-cdn worker's /social/resolve
// endpoint (which mirrors avatars to R2 — clients never hit the platform).
// Cron: daily. Manual: POST { mode: 'seed' | 'resolve' | 'both' }.
// ============================================================

// Only platforms our resolver can actually enrich are cached; everything else
// renders the client-side fallback card, so social_profiles stays small.
const ENRICHABLE: SocialPlatformKey[] = ['bluesky', 'mastodon', 'spotify', 'soundcloud']

const ENTITY_SOURCES: Array<{ table: string; col: string }> = [
  { table: 'venues', col: 'social_links' },
  { table: 'events', col: 'social_links' },
  { table: 'cities', col: 'social_links' },
  { table: 'queer_villages', col: 'social_links' },
  { table: 'personalities', col: 'social_links' },
  { table: 'organizations', col: 'social' },
  { table: 'marketplace_listings', col: 'social_media' },
]

const REFRESH_DAYS = 7
const WORKER_URL = (Deno.env.get('IMAGE_CDN_URL') || 'https://img.queer.guide').replace(/\/$/, '')
const WORKER_SECRET = Deno.env.get('IMAGE_CDN_ADMIN_SECRET') || ''

type Supa = ReturnType<typeof getServiceClient>

async function seed(supabase: Supa, perTable: number): Promise<number> {
  const candidates = new Map<string, { platform: string; handle: string; profile_url: string }>()
  for (const { table, col } of ENTITY_SOURCES) {
    const { data } = await supabase
      .from(table)
      .select(`${col}`)
      .neq(col, {})
      .limit(perTable)
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const normalized = normalizeSocialLinks(row[col] as Record<string, unknown> | null)
      for (const [platform, url] of Object.entries(normalized)) {
        if (!ENRICHABLE.includes(platform as SocialPlatformKey)) continue
        const handle = normalizeHandle(platform as SocialPlatformKey, url)
        if (!handle) continue
        candidates.set(`${platform}:${handle}`, {
          platform,
          handle,
          profile_url: canonicalizeUrl(platform as SocialPlatformKey, url),
        })
      }
    }
  }
  if (candidates.size === 0) return 0
  // Insert missing rows as pending; existing (platform,handle) left untouched.
  const rows = [...candidates.values()].map((c) => ({ ...c, status: 'pending' }))
  const { error } = await supabase
    .from('social_profiles')
    .upsert(rows, { onConflict: 'platform,handle', ignoreDuplicates: true })
  if (error) throw new Error(`seed upsert: ${error.message}`)
  return rows.length
}

async function resolveBatch(supabase: Supa, batch: number): Promise<{ resolved: number; failed: number }> {
  if (!WORKER_SECRET) throw new Error('IMAGE_CDN_ADMIN_SECRET not configured')
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('social_profiles')
    .select('id, platform, handle, profile_url, status, refresh_after')
    .or(`status.eq.pending,refresh_after.lt.${nowIso}`)
    .limit(batch)
  if (error) throw new Error(`select pending: ${error.message}`)

  let resolved = 0, failed = 0
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    try {
      const res = await fetch(`${WORKER_URL}/social/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': WORKER_SECRET },
        body: JSON.stringify({ platform: row.platform, handle: row.handle, profile_url: row.profile_url }),
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) throw new Error(`worker ${res.status}`)
      const card = await res.json() as {
        status: string; display_name: string | null; bio: string | null
        avatar_url: string | null; follower_count: number | null
      }
      const refreshAfter = new Date(Date.now() + REFRESH_DAYS * 86400_000).toISOString()
      await supabase.from('social_profiles').update({
        status: card.status,
        display_name: card.display_name,
        bio: card.bio,
        avatar_url: card.avatar_url,
        follower_count: card.follower_count,
        fetched_at: new Date().toISOString(),
        refresh_after: refreshAfter,
        error: null,
      }).eq('id', row.id)
      resolved++
    } catch (e) {
      failed++
      await supabase.from('social_profiles').update({
        status: 'error',
        error: String((e as Error).message).slice(0, 300),
        refresh_after: new Date(Date.now() + REFRESH_DAYS * 86400_000).toISOString(),
      }).eq('id', row.id)
    }
  }
  return { resolved, failed }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const mode = (body.mode as string) || 'both'
    const perTable = Number(body.per_table) || 500
    const batch = Number(body.batch) || 40

    let seeded = 0
    let resolveResult = { resolved: 0, failed: 0 }
    if (mode === 'seed' || mode === 'both') seeded = await seed(supabase, perTable)
    if (mode === 'resolve' || mode === 'both') resolveResult = await resolveBatch(supabase, batch)

    return jsonResponse({ success: true, seeded, ...resolveResult }, 200, req)
  } catch (e) {
    return errorResponse(`social-card-refresh: ${(e as Error).message}`, 500, req)
  }
})
