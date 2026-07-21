// milestone-discovery — provider-agnostic AI proposes new LGBTQ+ history
// milestones NOT already in the timeline. Proposals are STAGED as
// status='draft' / review_status='pending' (the publish gate only shows
// status='published'), so nothing the model invents can reach the public
// calendar until an admin approves it at /admin/content/milestones.
//
// Runs from a weekly pg_cron (X-Webhook-Secret) or on demand from the admin
// "AI suggestions" button (admin/service-role). LLM-gated: circuit-broken +
// per-day cap. "Any AI" — the model is whatever chatCompletion() resolves
// (Cloudflare Workers AI by default, OpenAI/Anthropic via env).
//
// Body: { count?, focus?, dry_run?, daily_cap? }

import { getCorsHeaders, getServiceClient, requireInternalOrAdmin, jsonResponse } from '../_shared/supabase-client.ts'
import { hasValidWebhookSecret } from '../_shared/webhook-auth.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import { proposeMilestones, type MilestoneCandidate } from '../_shared/ai-enrichment.ts'

const STEP = 'milestone-discovery'
const DEFAULT_COUNT = 8
const DEFAULT_DAILY_CAP = 40 // max proposals staged per day (bounds LLM spend + review load)

function slugify(title: string, date: string): string {
  const year = date.slice(0, 4)
  const base = title
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
  return `${base || 'milestone'}-${year}`
}

const normTitle = (t: string) =>
  t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })

  const supabase = getServiceClient()
  if (!hasValidWebhookSecret(req, 'MILESTONE_DISCOVERY_WEBHOOK_SECRET')) {
    const auth = await requireInternalOrAdmin(req, supabase)
    if (auth instanceof Response) return auth
  }

  const body = await req.json().catch(() => ({}))
  const count: number = Math.max(1, Math.min(20, body.count ?? DEFAULT_COUNT))
  const dailyCap: number = body.daily_cap ?? DEFAULT_DAILY_CAP
  const dryRun: boolean = body.dry_run ?? false
  const focus: string | undefined = body.focus

  // Per-day cap (skip for explicit on-demand? no — always cap to bound spend).
  const since = new Date(); since.setUTCHours(0, 0, 0, 0)
  const { count: doneToday } = await supabase
    .from('enrichment_log').select('id', { count: 'exact', head: true })
    .eq('step', STEP).eq('status', 'done').gte('created_at', since.toISOString())
  if ((doneToday ?? 0) >= dailyCap) {
    return jsonResponse({ proposed: 0, inserted: 0, capped: true, done_today: doneToday, daily_cap: dailyCap }, 200, req)
  }

  // Existing milestones for dedupe context + guard.
  const { data: existing, error: exErr } = await supabase
    .from('milestones')
    .select('slug, title, date')
    .is('duplicate_of_id', null)
  if (exErr) return jsonResponse({ error: exErr.message }, 500, req)

  const existingSlugs = new Set((existing ?? []).map((m) => m.slug))
  const existingTitles = new Set((existing ?? []).map((m) => normTitle(m.title ?? '')))
  const existingByDate = new Map<string, Set<string>>()
  for (const m of existing ?? []) {
    const d = String(m.date)
    if (!existingByDate.has(d)) existingByDate.set(d, new Set())
    existingByDate.get(d)!.add(normTitle(m.title ?? ''))
  }
  const digest = (existing ?? [])
    .map((m) => `${String(m.date).slice(0, 4)} · ${m.title}`)
    .sort()

  // Propose (circuit-broken).
  let candidates: MilestoneCandidate[]
  try {
    candidates = await withCircuitBreaker(supabase, 'llm.openai.milestone-discovery', () =>
      proposeMilestones(supabase, { count, existing: digest, focus }))
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return jsonResponse({ proposed: 0, inserted: 0, circuit_open: true }, 200, req)
    }
    return jsonResponse({ error: (err as Error).message }, 500, req)
  }

  // Dedupe + build insert rows.
  const rows: Record<string, unknown>[] = []
  const skipped: { title: string; reason: string }[] = []
  const seenThisRun = new Set<string>()

  for (const c of candidates) {
    const slug = slugify(c.title, c.date)
    const nt = normTitle(c.title)
    if (existingSlugs.has(slug) || seenThisRun.has(slug)) { skipped.push({ title: c.title, reason: 'dup-slug' }); continue }
    if (existingTitles.has(nt)) { skipped.push({ title: c.title, reason: 'dup-title' }); continue }
    if (existingByDate.get(c.date)?.has(nt)) { skipped.push({ title: c.title, reason: 'dup-date-title' }); continue }
    seenThisRun.add(slug)
    rows.push({
      slug,
      title: c.title.trim(),
      description: c.description.trim(),
      date: c.date,
      date_precision: c.date_precision,
      location: c.location ?? null,
      region: c.region ?? null,
      country_name: c.country_name ?? null,
      category: c.category,
      impact: c.impact,
      significance: c.significance,
      sources: [{ url: c.source_url, label: c.source_label ?? c.source_url }],
      tags: [],
      status: 'draft',            // staged, invisible to the public gate
      review_status: 'pending',   // awaits admin approval
      seo_indexable: false,
      is_featured: false,
    })
  }

  // Clamp to the remaining daily budget so a big proposal batch can't blow past the cap.
  const remaining = Math.max(0, dailyCap - (doneToday ?? 0))
  const capClamped = rows.length > remaining
  const toInsert = rows.slice(0, remaining)

  if (dryRun) {
    return jsonResponse({ proposed: candidates.length, would_insert: toInsert.length, skipped, cap_clamped: capClamped, dry_run: true, rows: toInsert }, 200, req)
  }

  let inserted = 0
  if (toInsert.length) {
    const { data: insData, error: insErr } = await supabase
      .from('milestones').insert(toInsert).select('id')
    if (insErr) return jsonResponse({ error: insErr.message, proposed: candidates.length }, 500, req)
    const ids = (insData ?? []) as { id: string }[]
    inserted = ids.length
    // One enrichment_log row per staged proposal → the daily cap counts proposals.
    if (ids.length) {
      await supabase.from('enrichment_log').insert(
        ids.map((r) => ({ entity_type: 'milestone', entity_id: r.id, step: STEP, status: 'done', duration_ms: 0 })),
      ).then(() => {}, () => {})
    }
  }

  return jsonResponse({ proposed: candidates.length, inserted, skipped, cap_clamped: capClamped, dry_run: false }, 200, req)
})
