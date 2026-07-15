/**
 * twenty-sync — one-way push of queer.guide company/people records into a
 * self-hosted Twenty CRM (twentyhq/twenty), run on a cron.
 *
 * Mapping (idempotent, keyed on Twenty custom field `externalId`):
 *   organizations         → Company   externalId `org:<id>`
 *   marketplace_merchants → Company   externalId `merchant:<id>`
 *   contact_submissions   → Person    externalId `contact:<id>`
 *   personalities (public)→ Person    externalId `personality:<id>`  (public fields only)
 *   profiles (approved)   → Person    externalId `profile:<id>`      (NON-sensitive fields only)
 *
 * Body params: { limit, offset, only } — `only` targets one entity, `offset` pages a
 * large table (personalities ~2k) for the one-time backfill; the cron runs unfiltered.
 *
 * Twenty is a downstream consumer only. This function holds no cursor and stores
 * nothing back on queer.guide rows — safe to re-run. It NO-OPS cleanly (200) when
 * the TWENTY_* secrets are absent, so the cron stays inert until go-live.
 *
 * Auth: verify_jwt=false at the gateway; gated here by INTERNAL_INVOKE_SECRET
 * (X-Internal-Secret) / service-role / admin. See docs/integrations/twenty-crm-sync.md.
 */
import {
  getServiceClient,
  jsonResponse,
  errorResponse,
  corsResponse,
  requireInternalOrAdmin,
} from '../_shared/supabase-client.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { twentyConfigured, upsertByExternalId, splitName } from '../_shared/twenty-client.ts'

// Wall-clock budget — the Supabase gateway 504s at ~150s and the dispatcher
// dead-letters on that. Stop admitting new rows well before then.
const BUDGET_MS = 110_000
const DEFAULT_LIMIT = 200

// NOTE: we deliberately do NOT populate Twenty's built-in `domainName` — Twenty's
// upsert/duplicate-detection merges records sharing a domainName, which would collapse
// distinct entities and overwrite our `externalId` key. The website goes to the custom
// `qgWebsite` field instead, so `externalId` (unique) is the ONLY merge key.

interface RowResult { externalId: string; action?: string; error?: string }

// Per-prefix { Twenty payload key → source column } for the review-whitelisted fields.
// Used to SKIP pushing a field that currently has a pending inbound review, so a human's
// Twenty edit isn't clobbered by the next outbound run before it's approved/rejected.
const PROTECT: Record<string, Record<string, string>> = {
  org: {
    name: 'name', qgDescription: 'description', qgEditorialHook: 'editorial_hook',
    qgEditorialLong: 'editorial_long', qgEmail: 'email', qgPhone: 'phone',
    qgWebsite: 'website', qgLogoUrl: 'logo_url',
  },
  merchant: { name: 'display_name' },
  contact: { name: 'name', qgCategory: 'category' },
  personality: {
    name: 'name', qgBio: 'description', qgProfession: 'profession',
    qgNationality: 'nationality', qgWebsite: 'website_url',
  },
}

Deno.serve(withErrorReporting('twenty-sync', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  const supabase = getServiceClient()
  const auth = await requireInternalOrAdmin(req, supabase)
  if (auth instanceof Response) return auth

  // Inert until the operator stands up Twenty and sets the secrets.
  if (!twentyConfigured()) {
    return jsonResponse({
      success: true,
      skipped: 'twenty-not-configured',
      items: 0,
      items_processed: 0,
      items_succeeded: 0,
      items_failed: 0,
    }, 200, req)
  }

  const started = Date.now()
  const budgetLeft = () => Date.now() - started < BUDGET_MS

  let limit = DEFAULT_LIMIT
  let offset = 0
  let only: string | null = null
  try {
    const body = await req.json().catch(() => ({})) as { limit?: number; offset?: number; only?: string }
    if (typeof body.limit === 'number' && body.limit > 0) limit = Math.min(body.limit, 2000)
    if (typeof body.offset === 'number' && body.offset >= 0) offset = body.offset
    if (typeof body.only === 'string') only = body.only
  } catch { /* no body */ }
  // `only` restricts to one entity; `offset` pages a large table (e.g. personalities).
  const wants = (name: string) => !only || only === name
  const lo = offset, hi = offset + limit - 1

  // Fields with a pending inbound review (per externalId) — never overwrite these.
  const pendingByExt = new Map<string, Set<string>>()
  {
    const { data: pend } = await supabase
      .from('twenty_inbound_review')
      .select('external_id, changes')
      .eq('status', 'pending')
    for (const r of (pend ?? []) as Array<{ external_id: string; changes: Record<string, unknown> }>) {
      pendingByExt.set(r.external_id, new Set(Object.keys(r.changes ?? {})))
    }
  }

  const results: RowResult[] = []
  let succeeded = 0
  let failed = 0

  // Small pacing delay between writes — a rapid burst of ~300 upserts makes Twenty
  // silently drop records (throttle race), so stay comfortably under its rate.
  const PACE_MS = 70
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

  const push = async (externalId: string, objectPath: string, fields: Record<string, unknown>) => {
    // Don't overwrite a field that has a pending Twenty edit awaiting review.
    const pending = pendingByExt.get(externalId)
    if (pending) {
      const protect = PROTECT[externalId.split(':', 1)[0]]
      if (protect) {
        for (const [key, col] of Object.entries(protect)) {
          if (pending.has(col)) delete fields[key]
        }
      }
    }
    await sleep(PACE_MS)
    try {
      const r = await upsertByExternalId(objectPath, externalId, fields)
      results.push({ externalId, action: r.action })
      succeeded++
    } catch (e) {
      results.push({ externalId, error: (e as Error).message })
      failed++
    }
  }

  const arr = (a?: unknown): string | undefined =>
    Array.isArray(a) && a.length ? a.join(', ') : undefined

  try {
    // ── organizations → Company (all attributes) ─────────────────────────────
    if (budgetLeft() && wants('organizations')) {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, slug, name, legal_name, description, editorial_hook, editorial_long, ' +
          'logo_url, roles, website, website_domain, email, phone, tags, target_groups, ' +
          'status, claim_status, trust_score, completeness_score, safety_gated, needs_attention, ' +
          'city:cities(name), country:countries(name)')
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .range(lo, hi)
      if (error) throw new Error(`organizations: ${error.message}`)
      for (const o of (data ?? []) as Record<string, any>[]) {
        if (!budgetLeft()) break
        await push(`org:${o.id}`, 'companies', {
          name: o.legal_name || o.name,
          qgWebsite: o.website || o.website_domain || undefined,
          qgSource: 'organization',
          qgSlug: o.slug ?? undefined,
          qgDescription: o.description ?? undefined,
          qgEditorialHook: o.editorial_hook ?? undefined,
          qgEditorialLong: o.editorial_long ?? undefined,
          qgLogoUrl: o.logo_url ?? undefined,
          qgRoles: arr(o.roles),
          qgEmail: o.email ?? undefined,
          qgPhone: o.phone ?? undefined,
          qgTags: arr(o.tags),
          qgTargetGroups: arr(o.target_groups),
          qgCity: o.city?.name ?? undefined,
          qgCountry: o.country?.name ?? undefined,
          qgStatus: o.status ?? undefined,
          qgClaimStatus: o.claim_status ?? undefined,
          qgTrustScore: o.trust_score ?? undefined,
          qgCompletenessScore: o.completeness_score ?? undefined,
          qgSafetyGated: o.safety_gated ?? undefined,
          qgNeedsAttention: o.needs_attention ?? undefined,
        })
      }
    }

    // ── marketplace_merchants → Company (all attributes) ─────────────────────
    if (budgetLeft() && wants('merchants')) {
      const { data, error } = await supabase
        .from('marketplace_merchants')
        .select('id, slug, display_name, shop_domain, provider, is_enabled, last_sync_status')
        .eq('is_enabled', true)
        .order('updated_at', { ascending: false })
        .range(lo, hi)
      if (error) throw new Error(`marketplace_merchants: ${error.message}`)
      for (const m of (data ?? []) as Record<string, any>[]) {
        if (!budgetLeft()) break
        await push(`merchant:${m.id}`, 'companies', {
          name: m.display_name,
          qgWebsite: m.shop_domain || undefined,
          qgSource: 'merchant',
          qgSlug: m.slug ?? undefined,
          qgProvider: m.provider ?? undefined,
          qgIsEnabled: m.is_enabled ?? undefined,
          qgLastSyncStatus: m.last_sync_status ?? undefined,
        })
      }
    }

    // ── contact_submissions → Person (all attributes) ────────────────────────
    if (budgetLeft() && wants('contacts')) {
      const { data, error } = await supabase
        .from('contact_submissions')
        .select('id, name, email, category, message, created_at')
        .order('created_at', { ascending: false })
        .range(lo, hi)
      if (error) throw new Error(`contact_submissions: ${error.message}`)
      for (const c of (data ?? []) as Record<string, any>[]) {
        if (!budgetLeft()) break
        await push(`contact:${c.id}`, 'people', {
          name: splitName(c.name),
          emails: c.email ? { primaryEmail: c.email } : undefined,
          qgSource: 'contact',
          qgCategory: c.category ?? undefined,
          qgMessage: c.message ?? undefined,
        })
      }
    }

    // ── personalities → Person (public figures; public fields only) ──────────
    if (budgetLeft() && wants('personalities')) {
      const { data, error } = await supabase
        .from('personalities')
        .select('id, name, slug, description, bio, profession, nationality, website_url')
        .eq('visibility', 'public')
        .order('updated_at', { ascending: false })
        .range(lo, hi)
      if (error) throw new Error(`personalities: ${error.message}`)
      for (const p of (data ?? []) as Record<string, any>[]) {
        if (!budgetLeft()) break
        await push(`personality:${p.id}`, 'people', {
          name: splitName(p.name),
          qgSource: 'personality',
          qgSlug: p.slug ?? undefined,
          qgProfession: p.profession ?? undefined,
          qgNationality: p.nationality ?? undefined,
          qgBio: p.description || p.bio || undefined,
          qgWebsite: p.website_url ?? undefined,
        })
      }
    }

    // ── profiles → Person (users; NON-SENSITIVE fields only — no identity/dating/
    //    contact/encrypted; those are deliberately never sent to a CRM) ─────────
    if (budgetLeft() && wants('profiles')) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, username, location, company, industry, job_title, moderation_status')
        .eq('moderation_status', 'approved')
        .order('updated_at', { ascending: false })
        .range(lo, hi)
      if (error) throw new Error(`profiles: ${error.message}`)
      for (const u of (data ?? []) as Record<string, any>[]) {
        if (!budgetLeft()) break
        const display = u.display_name || u.username
        if (!display) continue
        await push(`profile:${u.id}`, 'people', {
          name: splitName(display),
          qgSource: 'user',
          qgUsername: u.username ?? undefined,
          qgLocation: u.location ?? undefined,
          qgCompany: u.company ?? undefined,
          qgIndustry: u.industry ?? undefined,
          qgJobTitle: u.job_title ?? undefined,
        })
      }
    }

    return jsonResponse({
      success: true,
      items: results.length,
      items_processed: results.length,
      items_succeeded: succeeded,
      items_failed: failed,
      truncated: !budgetLeft(),
      sample_errors: results.filter((r) => r.error).slice(0, 8),
      results: results.slice(0, 50),
    }, 200, req)
  } catch (error) {
    return errorResponse((error as Error).message, 500, req)
  }
}))
