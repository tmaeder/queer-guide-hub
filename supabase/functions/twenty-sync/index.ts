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
 * Body params: { limit, offset, only, mode, recent } — `only` targets one entity,
 * `offset` pages a large table for a one-time backfill, `mode:'prune'` deletes
 * source-duplicate rows, and `recent:<hours>` is the incremental cron mode (only rows
 * changed in the window). The hourly cron uses `{recent:3}` — light, covers all entities.
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
import { twentyConfigured, upsertByExternalId, splitName, listExternalIdMap, deleteRecord } from '../_shared/twenty-client.ts'
import { buildCountryCanon } from '../_shared/geo-normalize.ts'
import { extractDomain } from '../_shared/logo-enrichment.ts'

// entity → { source table, Twenty object plural, externalId prefix } for prune mode.
const PRUNE: Record<string, { table: string; obj: string; prefix: string }> = {
  venues: { table: 'venues', obj: 'venues', prefix: 'venue' },
  events: { table: 'events', obj: 'qgEvents', prefix: 'event' },
  cities: { table: 'cities', obj: 'qgCities', prefix: 'city' },
  countries: { table: 'countries', obj: 'qgCountries', prefix: 'country' },
  news: { table: 'news_articles', obj: 'newsArticles', prefix: 'news' },
  products: { table: 'marketplace_listings', obj: 'products', prefix: 'product' },
  personalities: { table: 'personalities', obj: 'people', prefix: 'personality' },
  // organizations intentionally absent: the table has no duplicate_of_id column
  // (org merges are review-only today), so there is nothing to prune. Add an
  // { table: 'organizations', obj: 'companies', prefix: 'org' } entry if/when
  // soft-merge (duplicate_of_id) lands on organizations.
}

// externalId → Twenty-id maps for resolving relations. Module scope so a warm isolate
// reuses them across a rapid backfill loop. Cache the PROMISE so concurrent callers on a
// cold entry share one build instead of racing.
const idMapCache = new Map<string, Promise<Map<string, string>>>()

// Wall-clock budget — the Supabase gateway 504s at ~150s and the dispatcher
// dead-letters on that. Stop admitting new rows well before then.
const BUDGET_MS = 110_000
const DEFAULT_LIMIT = 200

// NOTE: we deliberately do NOT populate Twenty's built-in `domainName` — Twenty's
// upsert/duplicate-detection merges records sharing a domainName, which would collapse
// distinct entities and overwrite our `externalId` key. The website goes to the custom
// `qgWebsite` field instead, so `externalId` (unique) is the ONLY merge key.

interface RowResult { externalId: string; action?: string; error?: string }

type Named = { name: string | null } | null
interface OrgRow {
  id: string; slug: string | null; name: string | null; legal_name: string | null
  description: string | null; editorial_hook: string | null; editorial_long: string | null
  logo_url: string | null; roles: string[] | null; website: string | null; website_domain: string | null
  email: string | null; phone: string | null; tags: string[] | null; target_groups: string[] | null
  status: string | null; claim_status: string | null; trust_score: number | null
  completeness_score: number | null; safety_gated: boolean | null; needs_attention: boolean | null
  city: Named; country: Named
  city_id: string | null; country_id: string | null; primary_venue_id: string | null
}
interface MerchantRow {
  id: string; slug: string | null; display_name: string | null; shop_domain: string | null
  provider: string | null; is_enabled: boolean | null; last_sync_status: string | null
  organization_id: string | null
}
interface ContactRow { id: string; name: string | null; email: string | null; category: string | null; message: string | null }
interface PersonalityRow {
  id: string; name: string | null; slug: string | null; description: string | null; bio: string | null
  profession: string | null; nationality: string | null; website_url: string | null
  birth_date: string | null; death_date: string | null; image_url: string | null
  city_id: string | null; country_id: string | null
}
interface ProfileRow {
  id: string; display_name: string | null; username: string | null; location: string | null
  company: string | null; industry: string | null; job_title: string | null
}

// Per-prefix { Twenty payload key → source column } for the review-whitelisted fields.
// Used to SKIP pushing a field that currently has a pending inbound review, so a human's
// Twenty edit isn't clobbered by the next outbound run before it's approved/rejected.
const PROTECT: Record<string, Record<string, string>> = {
  org: {
    name: 'name', qgDescription: 'description', qgEditorialHook: 'editorial_hook',
    qgEditorialLong: 'editorial_long', qgEmail: 'email', qgPhone: 'phone',
    qgWebsite: 'website', qgDomain: 'website', qgLogoUrl: 'logo_url',
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
  let mode: string | null = null
  let recentHours = 0
  let foldMerchants = false
  try {
    const body = await req.json().catch(() => ({})) as
      { limit?: number; offset?: number; only?: string; mode?: string; recent?: number; foldMerchants?: boolean }
    if (typeof body.limit === 'number' && body.limit > 0) limit = Math.min(body.limit, 200_000)
    if (typeof body.offset === 'number' && body.offset >= 0) offset = body.offset
    if (typeof body.only === 'string') only = body.only
    if (typeof body.mode === 'string') mode = body.mode
    if (typeof body.recent === 'number' && body.recent > 0) recentHours = body.recent
    if (body.foldMerchants === true) foldMerchants = true
  } catch { /* no body */ }
  // Incremental cron mode: only sync rows changed within the last `recent` hours (cheap,
  // covers all entities). Relation maps stay lazy so nothing is built when nothing changed.
  const recentCutoff = recentHours > 0 ? new Date(Date.now() - recentHours * 3_600_000).toISOString() : null
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

  // Concurrency pool — upserts run in parallel (Twenty's limit is 20k/min, retry
  // handles 429s). `push` awaits a free slot (backpressure) then fires the write in the
  // background; all in-flight writes are awaited before the response is returned.
  const CONC = 16
  let active = 0
  const waiters: Array<() => void> = []
  const acquire = (): Promise<void> =>
    active < CONC ? (active++, Promise.resolve()) : new Promise<void>((r) => waiters.push(() => { active++; r() }))
  const release = () => { active--; const w = waiters.shift(); if (w) w() }
  const inflight: Promise<void>[] = []

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
    await acquire()
    const task = (async () => {
      try {
        const r = await upsertByExternalId(objectPath, externalId, fields)
        results.push({ externalId, action: r.action })
        succeeded++
      } catch (e) {
        results.push({ externalId, error: (e as Error).message })
        failed++
      } finally {
        release()
      }
    })()
    inflight.push(task)
  }

  // Empty source values are sent as EXPLICIT null (never omitted) so junk written in the
  // TEXT era — '' placeholders, stale values — is cleared by the next sync. Omission is
  // reserved for PROTECT (pending inbound review) and unresolved relation targets.
  const arr = (a?: unknown): string | null =>
    Array.isArray(a) && a.length ? a.join(', ') : null
  const s = (v: unknown) => (v == null || v === '' ? null : String(v))
  const n = (v: unknown) => { const x = Number(v); return (v == null || v === '' || Number.isNaN(x)) ? null : x }
  // Twenty typed-field encoders (fields were migrated from TEXT to SELECT/LINKS/
  // EMAILS/PHONES/MULTI_SELECT/CURRENCY — see docs/integrations/twenty-crm-field-types.md).
  const upperSnake = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  // SELECT option value (Twenty requires UPPER_SNAKE_CASE option values).
  const sel = (v: unknown) => { const x = s(v); return x ? upperSnake(x) : null }
  // MULTI_SELECT: array of option values.
  const msel = (a?: unknown): string[] | null =>
    Array.isArray(a) && a.length ? a.map((v) => upperSnake(String(v))) : null
  // Canonical URL: scheme added for bare domains, host lowercased, tracking params and
  // pure trailing slash stripped. Unparseable values are treated as junk → null.
  const canonUrl = (raw: string): string | null => {
    try {
      const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
      u.hostname = u.hostname.toLowerCase()
      if (!u.hostname.includes('.')) return null
      for (const p of [...u.searchParams.keys()]) {
        if (/^(utm_|fbclid|gclid|mc_cid|mc_eid)/i.test(p)) u.searchParams.delete(p)
      }
      const out = u.toString()
      return u.pathname === '/' && !u.search && !u.hash ? out.replace(/\/$/, '') : out
    } catch { return null }
  }
  // LINKS composite.
  const link = (v: unknown) => { const x = s(v); if (!x) return null; const u = canonUrl(x); return u ? { primaryLinkUrl: u, primaryLinkLabel: '' } : null }
  // Instagram: accepts full URLs or bare handles.
  const igLink = (v: unknown) => {
    const x = s(v)
    if (!x) return null
    const h = x.replace(/^@/, '')
    const u = canonUrl(/^https?:\/\//i.test(x) ? x : h.includes('.') ? h : `https://instagram.com/${h}`)
    return u ? { primaryLinkUrl: u, primaryLinkLabel: '' } : null
  }
  // EMAILS composite.
  const email = (v: unknown) => { const x = s(v); return x ? { primaryEmail: x.toLowerCase() } : null }
  // PHONES composite — number kept verbatim; source formats vary too much to split codes.
  const phone = (v: unknown) => { const x = s(v); return x ? { primaryPhoneNumber: x, primaryPhoneCallingCode: '', primaryPhoneCountryCode: '' } : null }
  // CURRENCY composite (micros).
  const money = (amount: unknown, code: unknown) => {
    const x = n(amount)
    return x == null ? null : { amountMicros: Math.round(x * 1_000_000), currencyCode: (s(code) ?? 'USD').toUpperCase() }
  }
  // jsonb columns stringify as "[object Object]" via String(); serialize them properly.
  const jsonText = (v: unknown) => (v == null || v === '' ? null : typeof v === 'string' ? v : JSON.stringify(v))
  // Placeholder addresses from old imports (venue address === venue name, hotel
  // address === city) read as "populated" but carry no information — suppress.
  const addr = (address: unknown, junk: unknown) => {
    const a = s(address)
    if (!a) return null
    const j = s(junk)
    return j && a.trim().toLowerCase() === j.trim().toLowerCase() ? null : a
  }
  // Canonical country names — venues/events store ISO-2 codes, companies/hotels full
  // names; Twenty gets full names everywhere so cross-object filters line up.
  const { data: countryRows } = await supabase.from('countries').select('name, code')
  const countryCanon = buildCountryCanon((countryRows ?? []) as Array<{ name: string | null; code: string | null }>)
  const country = (v: unknown): string | null => {
    const x = s(v)
    return x ? (countryCanon.get(x.trim().toLowerCase()) ?? x) : null
  }

  // Relation resolution: look up the target Twenty id by its externalId.
  const getMap = (plural: string): Promise<Map<string, string>> => {
    let p = idMapCache.get(plural)
    if (!p) { p = listExternalIdMap(plural); idMapCache.set(plural, p) }
    return p
  }
  interface Rel { field: string; target: string; fk: string; prefix: string }
  const relIds = async (rels: Rel[], r: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const out: Record<string, unknown> = {}
    for (const rl of rels) {
      const v = r[rl.fk]
      // Source FK cleared → clear the Twenty relation too. FK set but target not yet
      // synced → omit (don't wipe a valid link over ordering).
      if (!v) { out[`${rl.field}Id`] = null; continue }
      const id = (await getMap(rl.target)).get(`${rl.prefix}:${v}`)
      if (id) out[`${rl.field}Id`] = id
    }
    return out
  }
  const REL_CITY: Rel = { field: 'city', target: 'qgCities', fk: 'city_id', prefix: 'city' }
  const REL_COUNTRY: Rel = { field: 'country', target: 'qgCountries', fk: 'country_id', prefix: 'country' }
  const REL_VILLAGE: Rel = { field: 'village', target: 'villages', fk: 'queer_village_id', prefix: 'village' }

  // ── prune mode: delete Twenty records whose SOURCE row is a soft-duplicate
  //    (duplicate_of_id NOT NULL) — those should never have been synced. ──────────
  if (mode === 'prune' && only && PRUNE[only]) {
    const e = PRUNE[only]
    const map = await getMap(e.obj) // externalId → Twenty id
    let deleted = 0, scanned = 0, off = lo
    while (budgetLeft() && off <= hi) {
      const { data, error } = await supabase
        .from(e.table).select('id').not('duplicate_of_id', 'is', null)
        .order('id', { ascending: true }).range(off, Math.min(off + 999, hi))
      if (error) throw new Error(`prune ${only}: ${error.message}`)
      const rows = (data ?? []) as Array<{ id: string }>
      if (!rows.length) break
      for (const r of rows) {
        if (!budgetLeft()) break
        scanned++
        const tid = map.get(`${e.prefix}:${r.id}`)
        if (!tid) continue
        await acquire()
        const t = (async () => {
          try { await deleteRecord(e.obj, tid); deleted++ } catch { /* gone already */ } finally { release() }
        })()
        inflight.push(t)
      }
      off += rows.length
      if (rows.length < 1000) break
    }
    await Promise.all(inflight)
    return jsonResponse({ success: true, mode: 'prune', only, deleted, scanned, items_processed: scanned, truncated: !budgetLeft() }, 200, req)
  }

  try {
    // ── organizations → Company (all attributes) ─────────────────────────────
    if (budgetLeft() && wants('organizations')) {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, slug, name, legal_name, description, editorial_hook, editorial_long, ' +
          'logo_url, roles, website, website_domain, email, phone, tags, target_groups, ' +
          'status, claim_status, trust_score, completeness_score, safety_gated, needs_attention, ' +
          'city_id, country_id, primary_venue_id, city:cities(name), country:countries(name)')
        .eq('status', 'active')
        .gte('updated_at', recentCutoff ?? '1970-01-01')
        .order('updated_at', { ascending: false })
        .range(lo, hi)
      if (error) throw new Error(`organizations: ${error.message}`)
      for (const o of (data ?? []) as unknown as OrgRow[]) {
        if (!budgetLeft()) break
        const orgRels = await relIds([
          { field: 'cityRef', target: 'qgCities', fk: 'city_id', prefix: 'city' },
          { field: 'countryRef', target: 'qgCountries', fk: 'country_id', prefix: 'country' },
          { field: 'qgPrimaryVenue', target: 'venues', fk: 'primary_venue_id', prefix: 'venue' },
        ], o as unknown as Record<string, unknown>)
        await push(`org:${o.id}`, 'companies', {
          ...orgRels,
          name: o.legal_name || o.name,
          qgWebsite: link(o.website || o.website_domain),
          qgDomain: extractDomain(o.website || o.website_domain),
          qgSource: 'ORGANIZATION',
          qgSlug: s(o.slug),
          qgDescription: s(o.description),
          qgEditorialHook: s(o.editorial_hook),
          qgEditorialLong: s(o.editorial_long),
          qgLogoUrl: link(o.logo_url),
          qgRoles: msel(o.roles),
          qgEmail: email(o.email),
          qgPhone: phone(o.phone),
          qgTags: arr(o.tags),
          qgTargetGroups: arr(o.target_groups),
          qgCity: s(o.city?.name),
          qgCountry: country(o.country?.name),
          qgStatus: sel(o.status),
          qgClaimStatus: sel(o.claim_status),
          qgTrustScore: n(o.trust_score),
          qgCompletenessScore: n(o.completeness_score),
          qgSafetyGated: o.safety_gated ?? null,
          qgNeedsAttention: o.needs_attention ?? null,
        })
      }
    }

    // ── marketplace_merchants → Company (all attributes) ─────────────────────
    if (budgetLeft() && wants('merchants')) {
      const { data, error } = await supabase
        .from('marketplace_merchants')
        .select('id, slug, display_name, shop_domain, provider, is_enabled, last_sync_status, organization_id')
        .eq('is_enabled', true)
        .gte('updated_at', recentCutoff ?? '1970-01-01')
        .order('updated_at', { ascending: false })
        .range(lo, hi)
      if (error) throw new Error(`marketplace_merchants: ${error.message}`)
      for (const m of (data ?? []) as unknown as MerchantRow[]) {
        if (!budgetLeft()) break
        // A merchant linked to an organization (link_org_merchant_domain_matches)
        // duplicates its org's Company card. With {foldMerchants:true} those rows
        // are skipped so only the org card is pushed; default keeps both (unchanged
        // behavior). No merchant→org relation is pushed: companies has no
        // parentOrg RELATION field yet — created by the Phase 5 schema tooling.
        if (foldMerchants && m.organization_id) continue
        await push(`merchant:${m.id}`, 'companies', {
          name: m.display_name,
          qgWebsite: link(m.shop_domain),
          qgDomain: extractDomain(m.shop_domain),
          qgSource: 'MERCHANT',
          qgSlug: s(m.slug),
          qgProvider: sel(m.provider),
          qgIsEnabled: m.is_enabled ?? null,
          qgLastSyncStatus: sel(m.last_sync_status),
        })
      }
    }

    // ── contact_submissions → Person (all attributes) ────────────────────────
    if (budgetLeft() && wants('contacts')) {
      const { data, error } = await supabase
        .from('contact_submissions')
        .select('id, name, email, category, message, created_at')
        .gte('created_at', recentCutoff ?? '1970-01-01')
        .order('created_at', { ascending: false })
        .range(lo, hi)
      if (error) throw new Error(`contact_submissions: ${error.message}`)
      for (const c of (data ?? []) as unknown as ContactRow[]) {
        if (!budgetLeft()) break
        await push(`contact:${c.id}`, 'people', {
          name: splitName(c.name),
          emails: email(c.email),
          qgSource: 'CONTACT',
          qgCategory: s(c.category),
          qgMessage: s(c.message),
        })
      }
    }

    // ── personalities → Person (public figures; public fields only) ──────────
    if (budgetLeft() && wants('personalities')) {
      const { data, error } = await supabase
        .from('personalities')
        .select('id, name, slug, description, bio, profession, nationality, website_url, ' +
          'birth_date, death_date, image_url, city_id, country_id')
        .eq('visibility', 'public')
        .is('duplicate_of_id', null)
        .gte('updated_at', recentCutoff ?? '1970-01-01')
        .order('updated_at', { ascending: false })
        .range(lo, hi)
      if (error) throw new Error(`personalities: ${error.message}`)
      for (const p of (data ?? []) as unknown as PersonalityRow[]) {
        if (!budgetLeft()) break
        const pRels = await relIds([
          { field: 'qgCity', target: 'qgCities', fk: 'city_id', prefix: 'city' },
          { field: 'qgCountry', target: 'qgCountries', fk: 'country_id', prefix: 'country' },
        ], p as unknown as Record<string, unknown>)
        await push(`personality:${p.id}`, 'people', {
          ...pRels,
          name: splitName(p.name),
          qgSource: 'PERSONALITY',
          qgSlug: s(p.slug),
          qgProfession: s(p.profession),
          qgNationality: s(p.nationality),
          qgBio: s(p.description || p.bio),
          qgWebsite: link(p.website_url),
          qgBirthDate: s(p.birth_date),
          qgDeathDate: s(p.death_date),
          qgImageUrl: link(p.image_url),
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
        .gte('updated_at', recentCutoff ?? '1970-01-01')
        .order('updated_at', { ascending: false })
        .range(lo, hi)
      if (error) throw new Error(`profiles: ${error.message}`)
      for (const u of (data ?? []) as unknown as ProfileRow[]) {
        if (!budgetLeft()) break
        const display = u.display_name || u.username
        if (!display) continue
        await push(`profile:${u.id}`, 'people', {
          name: splitName(display),
          qgSource: 'USER',
          qgUsername: s(u.username),
          qgLocation: s(u.location),
          qgCompany: s(u.company),
          qgIndustry: s(u.industry),
          qgJobTitle: s(u.job_title),
        })
      }
    }

    // ── content entities → Twenty custom objects (ALL meaningful attributes + FK
    //    relations). id-ordered for a stable offset backfill; qg* TEXT so nums/dates
    //    are stringified. Relations set via `<field>Id` resolved through id-maps.
    type Row = Record<string, unknown>
    const content: Array<{
      only: string; table: string; obj: string; prefix: string; sel: string;
      map: (r: Row) => Record<string, unknown>; rels?: Rel[]; dedup?: boolean;
    }> = [
      { only: 'venues', dedup: true, table: 'venues', obj: 'venues', prefix: 'venue',
        sel: 'id, name, description, website, city, country, category, address, slug, phone, email, instagram, tags, amenities, services, price_range, star_rating, latitude, longitude, state, postal_code, verified, venue_subtype, booking_url, accessibility_notes, closed_at, vibe_tags, city_id, country_id, organization_id, queer_village_id',
        map: (r) => ({ name: r.name, qgDescription: s(r.description), qgWebsite: link(r.website), qgCity: s(r.city), qgCountry: country(r.country), qgCategory: sel(r.category), qgAddress: addr(r.address, r.name), qgSlug: s(r.slug), qgPhone: phone(r.phone), qgEmail: email(r.email), qgInstagram: igLink(r.instagram), qgTags: arr(r.tags), qgAmenities: arr(r.amenities), qgServices: arr(r.services), qgPriceRange: n(r.price_range), qgStarRating: n(r.star_rating), qgLat: n(r.latitude), qgLng: n(r.longitude), qgState: s(r.state), qgPostalCode: s(r.postal_code), qgVerified: r.verified ?? null, qgSubtype: sel(r.venue_subtype), qgBookingUrl: link(r.booking_url), qgAccessibility: s(r.accessibility_notes), qgClosedAt: s(r.closed_at), qgVibeTags: arr(r.vibe_tags) }),
        rels: [REL_CITY, REL_COUNTRY, REL_VILLAGE, { field: 'org', target: 'companies', fk: 'organization_id', prefix: 'org' }] },
      { only: 'events', dedup: true, table: 'events', obj: 'qgEvents', prefix: 'event',
        sel: 'id, title, description, event_type, start_date, end_date, ticket_url, price_min, price_max, is_free, age_restriction, address, state, city, country, latitude, longitude, venue_name, organizer_name, website, status, target_groups, tags, currency, liveness_status, slug, city_id, country_id, venue_id, organizer_id, queer_village_id',
        map: (r) => ({ name: r.title, qgDescription: s(r.description), qgType: sel(r.event_type), qgStartDate: s(r.start_date), qgEndDate: s(r.end_date), qgTicketUrl: link(r.ticket_url), qgPriceMin: n(r.price_min), qgPriceMax: n(r.price_max), qgIsFree: r.is_free ?? null, qgAgeRestriction: s(r.age_restriction), qgAddress: s(r.address), qgState: s(r.state), qgCity: s(r.city), qgCountry: country(r.country), qgLat: n(r.latitude), qgLng: n(r.longitude), qgVenue: s(r.venue_name), qgOrganizerName: s(r.organizer_name), qgWebsite: link(r.website), qgStatus: sel(r.status), qgTargetGroups: arr(r.target_groups), qgTags: arr(r.tags), qgCurrency: s(r.currency), qgLiveness: sel(r.liveness_status), qgSlug: s(r.slug) }),
        rels: [REL_CITY, REL_COUNTRY, REL_VILLAGE, { field: 'venue', target: 'venues', fk: 'venue_id', prefix: 'venue' }, { field: 'organizer', target: 'venues', fk: 'organizer_id', prefix: 'venue' }] },
      { only: 'cities', dedup: true, table: 'cities', obj: 'qgCities', prefix: 'city',
        sel: 'id, name, description, slug, region_name, population, is_capital, latitude, longitude, timezone, climate_type, founded_year, area_km2, local_language, official_website, lgbt_friendly_rating, best_time_to_visit, local_customs, editorial_hook, image_url, safety_notes, major_airport_code, country_id',
        map: (r) => ({ name: r.name, qgDescription: s(r.description), qgSlug: s(r.slug), qgRegion: s(r.region_name), qgPopulation: n(r.population), qgIsCapital: r.is_capital ?? null, qgLat: n(r.latitude), qgLng: n(r.longitude), qgTimezone: s(r.timezone), qgClimate: s(r.climate_type), qgFounded: n(r.founded_year), qgAreaKm2: n(r.area_km2), qgLocalLanguage: s(r.local_language), qgOfficialWebsite: link(r.official_website), qgLgbtRating: n(r.lgbt_friendly_rating), qgBestTime: s(r.best_time_to_visit), qgLocalCustoms: s(r.local_customs), qgEditorialHook: s(r.editorial_hook), qgImageUrl: link(r.image_url), qgSafetyNotes: s(r.safety_notes), qgAirportCode: s(r.major_airport_code) }),
        rels: [REL_COUNTRY] },
      { only: 'countries', dedup: true, table: 'countries', obj: 'qgCountries', prefix: 'country',
        sel: 'id, name, code, equality_score, description, slug, capital, population, area_km2, currency, languages, timezone, calling_code, internet_tld, driving_side, gdp_usd, gdp_per_capita_usd, human_development_index, life_expectancy, literacy_rate, flag_emoji, editorial_hook, editorial_long, image_url, lgbti_same_sex_unions, lgbti_adoption_rights, lgbti_gender_recognition, lgbti_conversion_therapy_regulation',
        map: (r) => ({ name: r.name, qgCode: s(r.code), qgEqualityScore: s(r.equality_score), qgDescription: s(r.description), qgSlug: s(r.slug), qgCapital: s(r.capital), qgPopulation: n(r.population), qgAreaKm2: n(r.area_km2), qgCurrency: s(r.currency), qgLanguages: arr(r.languages), qgTimezone: s(r.timezone), qgCallingCode: s(r.calling_code), qgTld: s(r.internet_tld), qgDrivingSide: s(r.driving_side), qgGdpUsd: n(r.gdp_usd), qgGdpPerCapita: n(r.gdp_per_capita_usd), qgHdi: n(r.human_development_index), qgLifeExpectancy: n(r.life_expectancy), qgLiteracyRate: n(r.literacy_rate), qgFlagEmoji: s(r.flag_emoji), qgEditorialHook: s(r.editorial_hook), qgEditorialLong: s(r.editorial_long), qgImageUrl: link(r.image_url), qgSameSexUnions: jsonText(r.lgbti_same_sex_unions), qgAdoptionRights: jsonText(r.lgbti_adoption_rights), qgGenderRecognition: jsonText(r.lgbti_gender_recognition), qgConversionTherapy: jsonText(r.lgbti_conversion_therapy_regulation) }) },
      { only: 'hotels', table: 'hotels', obj: 'hotels', prefix: 'hotel',
        sel: 'id, name, description, hotel_type, city, country, website, address, slug, phone, email, booking_url, price_range, star_rating, amenities, tags, queer_safety_notes, lgbtq_friendly, latitude, longitude, verified, city_id, country_id, queer_village_id',
        map: (r) => ({ name: r.name, qgDescription: s(r.description), qgType: sel(r.hotel_type), qgCity: s(r.city), qgCountry: country(r.country), qgWebsite: link(r.website), qgAddress: addr(r.address, r.city), qgSlug: s(r.slug), qgPhone: phone(r.phone), qgEmail: email(r.email), qgBookingUrl: link(r.booking_url), qgPriceRange: n(r.price_range), qgStarRating: n(r.star_rating), qgAmenities: arr(r.amenities), qgTags: arr(r.tags), qgSafetyNotes: s(r.queer_safety_notes), qgLgbtqFriendly: r.lgbtq_friendly ?? null, qgLat: n(r.latitude), qgLng: n(r.longitude), qgVerified: r.verified ?? null }),
        rels: [REL_CITY, REL_COUNTRY, REL_VILLAGE] },
      { only: 'villages', table: 'queer_villages', obj: 'villages', prefix: 'village',
        sel: 'id, name, description, website, slug, history, latitude, longitude, notable_landmarks, tags, editorial_hook, image_url, city_id, country_id',
        map: (r) => ({ name: r.name, qgDescription: s(r.description), qgWebsite: link(r.website), qgSlug: s(r.slug), qgHistory: s(r.history), qgLat: n(r.latitude), qgLng: n(r.longitude), qgLandmarks: arr(r.notable_landmarks), qgTags: arr(r.tags), qgEditorialHook: s(r.editorial_hook), qgImageUrl: link(r.image_url) }),
        rels: [REL_CITY, REL_COUNTRY] },
      { only: 'news', dedup: true, table: 'news_articles', obj: 'newsArticles', prefix: 'news',
        sel: 'id, title, url, published_at, category, slug, publisher_name, excerpt, author, sentiment, tags, media_type, canonical_url, image_url, content_language',
        map: (r) => ({ name: r.title, qgPublisher: s(r.publisher_name), qgUrl: link(r.url), qgPublishedAt: s(r.published_at), qgCategory: sel(r.category), qgSlug: s(r.slug), qgExcerpt: s(r.excerpt), qgAuthor: s(r.author), qgSentiment: sel(r.sentiment), qgTags: arr(r.tags), qgMediaType: sel(r.media_type), qgCanonicalUrl: link(r.canonical_url), qgImageUrl: link(r.image_url), qgLanguage: sel(r.content_language) }) },
      { only: 'products', dedup: true, table: 'marketplace_listings', obj: 'products', prefix: 'product',
        sel: 'id, title, brand, price_usd, external_url, website, merchant_domain, category, slug, description, subcategory, price_type, currency, business_name, availability, in_stock, department, boutique_score, content_rating, community_owned_tags, venue_id',
        map: (r) => ({ name: r.title, qgBrand: s(r.brand), qgPrice: s(r.price_usd), qgPriceMoney: money(r.price_usd, r.currency), qgUrl: link(r.external_url ?? r.website), qgMerchant: s(r.merchant_domain), qgCategory: s(r.category), qgSlug: s(r.slug), qgDescription: s(r.description), qgSubcategory: s(r.subcategory), qgPriceType: sel(r.price_type), qgCurrency: sel(r.currency), qgBusinessName: s(r.business_name), qgAvailability: sel(r.availability), qgInStock: r.in_stock ?? null, qgDepartment: sel(r.department), qgBoutiqueScore: n(r.boutique_score), qgContentRating: sel(r.content_rating), qgOwnershipTags: msel(r.community_owned_tags) }),
        rels: [{ field: 'venue', target: 'venues', fk: 'venue_id', prefix: 'venue' }] },
    ]

    // Page internally in 1000-row chunks (PostgREST's cap) up to `limit`/budget, so the
    // relation id-maps are built ONCE per call and reused across many pages.
    for (const c of content) {
      if (!budgetLeft() || !wants(c.only)) continue
      let off = lo
      while (budgetLeft() && off <= hi) {
        const pageHi = Math.min(off + 999, hi)
        let q = supabase.from(c.table).select(c.sel)
        if (c.dedup) q = q.is('duplicate_of_id', null)
        if (recentCutoff) q = q.gte('updated_at', recentCutoff)
        q = recentCutoff ? q.order('updated_at', { ascending: false }) : q.order('id', { ascending: true })
        const { data, error } = await q.range(off, pageHi)
        if (error) throw new Error(`${c.only}: ${error.message}`)
        const rows = (data ?? []) as Row[]
        if (!rows.length) break
        for (const r of rows) {
          if (!budgetLeft()) break
          const fields = c.map(r)
          if (c.rels) Object.assign(fields, await relIds(c.rels, r))
          await push(`${c.prefix}:${r.id}`, c.obj, fields)
        }
        off += rows.length
        if (rows.length < 1000) break
      }
    }

    await Promise.all(inflight)

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
