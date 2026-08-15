// personality-link-adult-profiles — resolves adult performers' profile URLs
// on pornhub / xhamster / xvideos and either links them or queues them.
//
// Auth: X-Webhook-Secret (pg_cron) or admin / service-role.
// Body: { batch_size?, dry_run?, personality_ids?, platforms? }
//
// No LLM, so no llm_budget: corroboration is a deterministic comparison of the
// platform's own page title against our stored name. The probing rules and the
// tier decision live in _shared/adult-profile-probe.ts and are unit-tested
// there; this file is orchestration, rate-limiting and persistence only.
//
// ── Invariants ─────────────────────────────────────────────────────────────
//   * never writes to a row where is_adult = false (re-checked here, not just
//     trusted from the selector)
//   * never touches visibility / seo_indexable / review_status /
//     lgbti_connection — linking must not publish anybody
//   * auto-applies only self-proving matches; see decideTier()
//   * one UPDATE per personality per run, never one per platform —
//     trg_search_documents_personality fires on every row UPDATE and this DB
//     is disk-constrained

import {
  getCorsHeaders,
  getServiceClient,
  jsonResponse,
  requireInternalOrAdmin,
} from '../_shared/supabase-client.ts'
import { hasValidWebhookSecret } from '../_shared/webhook-auth.ts'
import { checkCircuit, recordFailure, recordSuccess } from '../_shared/circuit-breaker.ts'
import {
  BREAKER,
  DEFAULT_PLATFORMS,
  PLATFORM_KEYS,
  decideTier,
  nextMissState,
  probeProfile,
  type Fetcher,
  type PlatformKey,
} from '../_shared/adult-profile-probe.ts'

const DEFAULT_BATCH = 40
const REQUEST_TIMEOUT_MS = 12_000
const POLITE_DELAY_MS = 350
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface DueRow {
  id: string
  name: string
  slug: string
  is_living: boolean | null
  encyclopedic: boolean
  single_token: boolean
  missing: string[]
  last_attempt_at: string | null
}

/**
 * redirect:'manual' is load-bearing — pornhub and xvideos both encode
 * "no such profile" as a redirect, and following it lands on a 200 index page.
 * See the header of _shared/adult-profile-probe.ts.
 */
const makeFetcher = (): Fetcher => async (url: string) => {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      signal: ctl.signal,
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' },
    })
    // Only 200s need a body; reading one on a redirect wastes bandwidth.
    const body = res.status === 200 ? await res.text() : ''
    if (res.status !== 200) await res.body?.cancel().catch(() => {})
    return { status: res.status, location: res.headers.get('location'), body }
  } finally {
    clearTimeout(timer)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })

  const supabase = getServiceClient()

  if (!hasValidWebhookSecret(req, 'WEBHOOK_SECRET')) {
    const auth = await requireInternalOrAdmin(req, supabase)
    if (auth instanceof Response) return auth
  }

  const body = await req.json().catch(() => ({})) as {
    batch_size?: number
    dry_run?: boolean
    personality_ids?: string[]
    platforms?: PlatformKey[]
  }

  const dryRun = body.dry_run === true
  const batchSize = Math.max(1, Math.min(Number(body.batch_size) || DEFAULT_BATCH, 200))

  // An explicit `platforms` list is passed through to the SELECTOR too, so an
  // on-demand xhamster run still finds work. Omitted means the nightly set,
  // which the selector defaults to as well — see DEFAULT_PLATFORMS.
  const explicitPlatforms: PlatformKey[] | null =
    Array.isArray(body.platforms) && body.platforms.length
      ? body.platforms.filter((p) => PLATFORM_KEYS.includes(p))
      : null
  const wanted: PlatformKey[] = explicitPlatforms ?? DEFAULT_PLATFORMS

  // A breaker that is open degrades that ONE platform; the others still run.
  const open = new Set<PlatformKey>()
  for (const p of wanted) {
    const c = await checkCircuit(supabase, BREAKER[p])
    if (!c.allowed) open.add(p)
  }
  const active = wanted.filter((p) => !open.has(p))
  if (active.length === 0) {
    return jsonResponse(
      { success: true, circuit_open: true, examined: 0, linked: 0, queued: 0, skipped_reason: 'all_circuits_open' },
      200,
      req,
    )
  }

  // ── Work list ─────────────────────────────────────────────────────────────
  // No `= []` initializer: both branches below assign `due`, so the empty array
  // was a dead store (`no-useless-assignment`). Declaring it unassigned makes
  // the compiler prove that instead — if a third branch ever forgets to write
  // it, that is a type error rather than a silent empty batch.
  let due: DueRow[]
  if (body.personality_ids?.length) {
    const { data, error } = await supabase
      .from('personalities')
      .select('id, name, slug, is_living, social_links, enrichment_status')
      .in('id', body.personality_ids.slice(0, 200))
      .eq('is_adult', true)
    if (error) return jsonResponse({ success: false, error: error.message }, 500, req)
    due = (data ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      slug: r.slug as string,
      is_living: r.is_living as boolean | null,
      encyclopedic: true, // explicit targeting is manual; stay conservative
      single_token: !/\s/.test(String(r.name ?? '')),
      missing: PLATFORM_KEYS.filter(
        (k) => !((r.social_links ?? {}) as Record<string, unknown>)[k],
      ),
      last_attempt_at: null,
    }))
  } else {
    const { data, error } = await supabase.rpc('personalities_due_for_adult_links', {
      p_limit: batchSize,
      ...(explicitPlatforms ? { p_platforms: explicitPlatforms } : {}),
    })
    if (error) return jsonResponse({ success: false, error: error.message }, 500, req)
    due = (data ?? []) as DueRow[]
  }

  if (due.length === 0) {
    return jsonResponse({ success: true, examined: 0, linked: 0, queued: 0 }, 200, req)
  }

  // Current state for the rows we are about to touch — the selector returns
  // tiering signals, not the jsonb columns we have to merge into.
  const { data: current, error: curErr } = await supabase
    .from('personalities')
    .select('id, is_adult, social_links, enrichment_status, field_provenance')
    .in('id', due.map((d) => d.id))
  if (curErr) return jsonResponse({ success: false, error: curErr.message }, 500, req)

  const state = new Map(
    (current ?? []).map((r) => [
      r.id as string,
      {
        isAdult: r.is_adult === true,
        social: (r.social_links ?? {}) as Record<string, string>,
        enrich: (r.enrichment_status ?? {}) as Record<string, unknown>,
        prov: (r.field_provenance ?? {}) as Record<string, unknown>,
      },
    ]),
  )

  // Fields already awaiting a human. `uq_erq_open` is a PARTIAL index on
  // (entity_type, entity_id, field) WHERE status='open', which ON CONFLICT
  // inference cannot target from PostgREST — so idempotency is enforced here
  // instead, which also saves re-probing a profile someone is already
  // reviewing. Rejected rows are not 'open', so they are never re-suggested.
  const { data: openRows, error: openErr } = await supabase
    .from('entity_review_queue')
    .select('entity_id, field')
    .eq('entity_type', 'personality')
    .eq('status', 'open')
    .in('entity_id', due.map((d) => d.id))
  if (openErr) return jsonResponse({ success: false, error: openErr.message }, 500, req)
  const alreadyQueued = new Set(
    (openRows ?? []).map((r) => `${r.entity_id}:${r.field}`),
  )

  const fetcher = makeFetcher()
  const now = new Date().toISOString()
  const summary = {
    examined: 0,
    linked: 0,
    queued: 0,
    missed: 0,
    retired: 0,
    by_platform: {} as Record<string, { linked: number; queued: number; missed: number }>,
    samples: [] as Array<Record<string, unknown>>,
  }
  const bump = (p: string, k: 'linked' | 'queued' | 'missed') => {
    summary.by_platform[p] ??= { linked: 0, queued: 0, missed: 0 }
    summary.by_platform[p][k]++
  }

  for (const row of due) {
    const st = state.get(row.id)
    // Defense in depth: the selector already filters is_adult, but an adult
    // link must never land on a row that is not in the adult cohort.
    if (!st || !st.isAdult) continue

    summary.examined++

    const adultLinks = { ...((st.enrich['adult_links'] ?? {}) as Record<string, unknown>) }
    const socialPatch: Record<string, string> = {}
    const provPatch: Record<string, unknown> = {
      ...((st.prov['social_links'] ?? {}) as Record<string, unknown>),
    }
    const queueRows: Array<Record<string, unknown>> = []
    let changed = false

    for (const platform of active) {
      if (!row.missing.includes(platform)) continue
      if (st.social[platform]) continue
      if (alreadyQueued.has(`${row.id}:social_links.${platform}`)) continue

      const probe = await probeProfile(platform, row.name, fetcher)
      await sleep(POLITE_DELAY_MS)

      if (probe.error) {
        await recordFailure(supabase, BREAKER[platform])
        continue
      }
      await recordSuccess(supabase, BREAKER[platform])

      const decision = decideTier({
        name: row.name,
        encyclopedic: row.encyclopedic,
        singleToken: row.single_token,
        probe,
      })

      if (summary.samples.length < 40) {
        summary.samples.push({
          name: row.name,
          platform,
          tier: decision.tier,
          reason: decision.reason,
          url: probe.url ?? null,
          display_name: probe.displayName ?? null,
          curated: probe.curated ?? null,
        })
      }

      if (decision.tier === 'miss') {
        const next = nextMissState(adultLinks[platform])
        adultLinks[platform] = { ...next, at: now }
        if (next.state === 'data_unavailable') summary.retired++
        summary.missed++
        bump(platform, 'missed')
        changed = true
        continue
      }

      if (decision.tier === 'auto') {
        socialPatch[platform] = probe.url!
        provPatch[platform] = {
          source: 'adult-profile-probe',
          confidence: decision.confidence,
          reason: decision.reason,
          display_name: probe.displayName ?? null,
          at: now,
        }
        adultLinks[platform] = { state: 'linked', tier: 'auto', url: probe.url, at: now }
        summary.linked++
        bump(platform, 'linked')
        changed = true
        continue
      }

      // review
      queueRows.push({
        entity_type: 'personality',
        entity_id: row.id,
        field: `social_links.${platform}`,
        proposed_value: { value: probe.url },
        citations: [probe.url],
        confidence: decision.confidence,
        model: `adult-profile-probe:${decision.reason}`,
        status: 'open',
      })
      adultLinks[platform] = { state: 'review_queued', url: probe.url, reason: decision.reason, at: now }
      summary.queued++
      bump(platform, 'queued')
      changed = true
    }

    if (!changed || dryRun) continue

    adultLinks['last_attempt_at'] = now

    // ONE update per personality — never one per platform.
    const update: Record<string, unknown> = {
      enrichment_status: { ...st.enrich, adult_links: adultLinks },
    }
    if (Object.keys(socialPatch).length) {
      update.social_links = { ...st.social, ...socialPatch }
      update.field_provenance = { ...st.prov, social_links: provPatch }
    }

    const { error: upErr } = await supabase.from('personalities').update(update).eq('id', row.id)
    if (upErr) {
      console.error(`update failed for ${row.id}: ${upErr.message}`)
      continue
    }

    if (queueRows.length) {
      // Plain insert: the open-row pre-filter above already guarantees these
      // are new, and the partial unique index is the backstop.
      const { error: qErr } = await supabase.from('entity_review_queue').insert(queueRows)
      if (qErr) console.error(`queue insert failed for ${row.id}: ${qErr.message}`)
    }
  }

  return jsonResponse(
    {
      success: true,
      dry_run: dryRun,
      circuit_open: open.size > 0,
      circuits_open: [...open],
      ...summary,
    },
    200,
    req,
  )
})
