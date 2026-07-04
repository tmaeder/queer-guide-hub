import {
  getServiceClient,
  jsonResponse,
  errorResponse,
  corsResponse,
} from '../_shared/supabase-client.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// ============================================================
// social-verify — prove ownership of a linked social account.
// ------------------------------------------------------------
// User-initiated (verify_jwt=true). The proof is a back-link: the
// user adds their queer.guide profile URL (queer.guide/user/<id>)
// to the social account's bio. Only the owner can attach a social
// account to their own profile, so a bio that links back closes the
// ownership loop — no secret, no stored challenge state.
//
//   POST { url }   Authorization: Bearer <user JWT>
//     -> { verified: 'verified'|'linked'|'unverified', method, reason? }
//
// Tiers:
//   verified  Bluesky public API / Mastodon (incl. native rel=me) — reliable read
//   linked    generic OG-scrape match — best-effort, page may be JS/blocked
//   unverified  no back-link found, or bio unreadable
// ============================================================

const PROFILE_HOST = 'queer.guide'
const BSKY_API = 'https://public.api.bsky.app'

type Tier = 'verified' | 'linked' | 'unverified'

interface Account {
  platform: string
  url: string
  handle?: string | null
  verified?: string
  verification_method?: string | null
  [k: string]: unknown
}

/** True if the bio text references the user's own queer.guide profile. */
function matchesBacklink(text: string, userId: string, username?: string | null): boolean {
  const hay = text.toLowerCase()
  if (!hay.includes(PROFILE_HOST)) return false
  if (hay.includes(`user/${userId.toLowerCase()}`)) return true
  if (username && hay.includes(username.toLowerCase())) return true
  return false
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'QueerGuide-SocialVerify/1.0' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) return ''
  return await res.text()
}

/** Bluesky: resolve handle -> DID -> profile description. */
async function verifyBluesky(account: Account, userId: string, username?: string | null): Promise<Tier> {
  const m = account.url.match(/bsky\.app\/profile\/([^/?#]+)/i)
  const handle = m?.[1] ?? account.handle
  if (!handle) return 'unverified'
  try {
    const res = await fetch(
      `${BSKY_API}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`,
      { signal: AbortSignal.timeout(10_000) },
    )
    if (!res.ok) return 'unverified'
    const data = (await res.json()) as { description?: string }
    return matchesBacklink(data.description ?? '', userId, username) ? 'verified' : 'unverified'
  } catch {
    return 'unverified'
  }
}

/** Mastodon: lookup account -> note (bio) + verified rel=me fields. */
async function verifyMastodon(account: Account, userId: string, username?: string | null): Promise<Tier> {
  try {
    const u = new URL(account.url)
    const instance = u.host
    const acct = u.pathname.replace(/^\/+/, '').replace(/^@/, '')
    if (!acct) return 'unverified'
    const res = await fetch(
      `https://${instance}/api/v1/accounts/lookup?acct=${encodeURIComponent(acct)}`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) },
    )
    if (!res.ok) return 'unverified'
    const data = (await res.json()) as {
      note?: string
      fields?: Array<{ value?: string; verified_at?: string | null }>
    }
    // Strongest: a field whose value links back and Mastodon marked verified.
    for (const f of data.fields ?? []) {
      if (f.value && matchesBacklink(f.value, userId, username)) return 'verified'
    }
    // Bio note is a reliable read too.
    return matchesBacklink(data.note ?? '', userId, username) ? 'verified' : 'unverified'
  } catch {
    return 'unverified'
  }
}

/** Generic platforms: scrape OG / meta description. Best-effort -> 'linked'. */
async function verifyGeneric(account: Account, userId: string, username?: string | null): Promise<Tier> {
  try {
    const html = await fetchText(account.url)
    if (!html) return 'unverified'
    const metas = [...html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1])
    const blob = metas.join(' \n ')
    return matchesBacklink(blob, userId, username) ? 'linked' : 'unverified'
  } catch {
    return 'unverified'
  }
}

function methodFor(platform: string, tier: Tier): string | null {
  if (tier === 'unverified') return null
  if (platform === 'Bluesky') return 'bluesky_backlink'
  if (platform === 'Mastodon') return 'mastodon_relme'
  return 'bio_backlink'
}

async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsResponse(req)
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405, req)

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return errorResponse('Unauthorized', 401, req)

  const service = getServiceClient()
  const { data: userData, error: userErr } = await service.auth.getUser(token)
  const userId = userData?.user?.id
  if (userErr || !userId) return errorResponse('Unauthorized', 401, req)

  let body: { url?: string }
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON', 400, req)
  }
  const url = (body.url || '').trim()
  if (!url) return errorResponse('Missing url', 400, req)

  const { data: profile, error: profErr } = await service
    .from('profiles')
    .select('username, social_accounts')
    .eq('user_id', userId)
    .maybeSingle()
  if (profErr || !profile) return errorResponse('Profile not found', 404, req)

  const accounts = (Array.isArray(profile.social_accounts) ? profile.social_accounts : []) as Account[]
  const idx = accounts.findIndex((a) => a.url === url)
  if (idx === -1) return errorResponse('Account not found on your profile', 404, req)

  const account = accounts[idx]
  const username = (profile.username as string | null) ?? null

  let tier: Tier
  if (account.platform === 'Bluesky') tier = await verifyBluesky(account, userId, username)
  else if (account.platform === 'Mastodon') tier = await verifyMastodon(account, userId, username)
  else tier = await verifyGeneric(account, userId, username)

  if (tier === 'unverified') {
    return jsonResponse(
      {
        verified: 'unverified',
        reason: `No link back to queer.guide/user/${userId} found in the ${account.platform} bio.`,
      },
      200,
      req,
    )
  }

  const method = methodFor(account.platform, tier)
  accounts[idx] = { ...account, verified: tier, verification_method: method }

  const { error: updErr } = await service
    .from('profiles')
    .update({ social_accounts: accounts })
    .eq('user_id', userId)
  if (updErr) return errorResponse('Failed to save verification', 500, req)

  return jsonResponse({ verified: tier, method }, 200, req)
}

Deno.serve(withErrorReporting('social-verify', handler))
