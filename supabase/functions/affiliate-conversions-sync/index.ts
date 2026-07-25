import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

// ============================================================
// affiliate-conversions-sync — pull realized affiliate transactions into
// affiliate_conversions and match them back to affiliate_clicks.
//
// Networks:
//   awin           GET api.awin.com/publishers/{AWIN_PUBLISHER_ID}/transactions/
//                  Bearer AWIN_API_TOKEN. Max 31-day window per call.
//   travelpayouts  GET api.travelpayouts.com/finance/v2/get_user_actions_affecting_balance
//                  X-Access-Token: TRAVELPAYOUTS_API_TOKEN. Paginated, limit<=300.
//   (amazon has no earnings API — CSV import via admin_import_amazon_conversions RPC)
//
// Matching: the /go worker embeds "<surface>.<code>" in sub_id/clickref and
// "queerguide-452012-<surface>-<code>" in the Booking label; the code resolves
// an affiliate_clicks row (click_code). No code → surface-level attribution.
//
// Idempotent: upsert ON (network, network_txn_id). Re-pulling the trailing
// window is how pending → approved/rejected → paid transitions land.
// A network without its token configured is skipped with reason no_credentials.
//
// Body: { network?: 'awin'|'travelpayouts'|'all', days_back?, dry_run? }
// ============================================================

const RUN_BUDGET_MS = 120_000

interface ConversionRow {
  network: string
  network_txn_id: string
  advertiser_ref: string | null
  status: string
  commission_amount: number | null
  commission_currency: string | null
  commission_usd: number | null
  sale_amount: number | null
  sale_currency: string | null
  sale_usd: number | null
  click_time: string | null
  transaction_time: string | null
  sub_id: string | null
  click_code: string | null
  surface: string | null
  partner_key: string | null
  vertical: string | null
  matched_click_id: string | null
  listing_id: string | null
  merchant_id: string | null
  raw: Record<string, unknown>
}

interface ClickMatch {
  click_code: string | null
  surface: string | null
  partner_key: string | null
  vertical: string | null
  matched_click_id: string | null
  listing_id: string | null
  merchant_id: string | null
}

function parseSubId(subId: string | null | undefined): { surface: string | null; code: string | null } {
  if (!subId) return { surface: null, code: null }
  let m = subId.match(/^([a-z0-9_]+)\.([0-9a-f]{8,16})$/i)
  if (m) return { surface: m[1], code: m[2].toLowerCase() }
  m = subId.match(/^queerguide-\d+-([a-z0-9_]+)-([0-9a-f]{8,16})$/i)
  if (m) return { surface: m[1], code: m[2].toLowerCase() }
  m = subId.match(/^queerguide-\d+-([a-z0-9_]+)$/i)
  if (m) return { surface: m[1], code: null }
  if (/^[a-z0-9_]+$/i.test(subId)) return { surface: subId, code: null }
  return { surface: null, code: null }
}

async function matchClick(supabase: SupabaseClient, subId: string | null | undefined): Promise<ClickMatch> {
  const { surface, code } = parseSubId(subId)
  const base: ClickMatch = {
    click_code: code, surface, partner_key: null, vertical: null,
    matched_click_id: null, listing_id: null, merchant_id: null,
  }
  if (!code) return base

  const { data: clicks } = await supabase
    .from('affiliate_clicks')
    .select('id, surface, partner, vertical, entity_type, entity_id')
    .eq('click_code', code)
    .limit(1)
  const click = clicks?.[0]
  if (!click) return base

  base.matched_click_id = click.id
  base.surface = click.surface ?? surface
  base.partner_key = click.partner
  base.vertical = click.vertical

  if (click.entity_type === 'marketplace_listing' && click.entity_id) {
    base.listing_id = click.entity_id
    const { data: listings } = await supabase
      .from('marketplace_listings')
      .select('source_type, merchant_domain')
      .eq('id', click.entity_id)
      .limit(1)
    const listing = listings?.[0]
    if (listing) {
      const { data: merchants } = await supabase
        .from('marketplace_merchants')
        .select('id')
        .or(`slug.eq.${listing.source_type ?? ''},shop_domain.eq.${listing.merchant_domain ?? ''}`)
        .limit(1)
      base.merchant_id = merchants?.[0]?.id ?? null
    }
  }
  return base
}

// ── FX ─────────────────────────────────────────────────────────────

async function loadFx(supabase: SupabaseClient): Promise<Record<string, number>> {
  const { data } = await supabase.from('fx_rates').select('currency, rate_to_usd')
  const map: Record<string, number> = { USD: 1 }
  for (const r of data ?? []) map[String(r.currency).toUpperCase()] = Number(r.rate_to_usd)
  return map
}

function toUsd(fx: Record<string, number>, amount: number | null, currency: string | null): number | null {
  if (amount == null) return null
  const rate = fx[(currency ?? 'USD').toUpperCase()]
  return rate ? Math.round(amount * rate * 100) / 100 : null
}

// ── Awin ───────────────────────────────────────────────────────────

const AWIN_STATUS: Record<string, string> = {
  pending: 'pending',
  approved: 'approved',
  declined: 'rejected',
  deleted: 'rejected',
}

async function pullAwin(
  supabase: SupabaseClient,
  fx: Record<string, number>,
  daysBack: number,
): Promise<{ rows: ConversionRow[] } | { skipped: string }> {
  const token = Deno.env.get('AWIN_API_TOKEN')
  const publisherId = Deno.env.get('AWIN_PUBLISHER_ID')
  if (!token || !publisherId) return { skipped: 'no_credentials' }

  // Awin caps the range at 31 days per call.
  const days = Math.min(Math.max(daysBack, 1), 31)
  const end = new Date()
  const start = new Date(end.getTime() - days * 86_400_000)
  const fmt = (d: Date) => d.toISOString().slice(0, 19)

  const url =
    `https://api.awin.com/publishers/${publisherId}/transactions/` +
    `?startDate=${encodeURIComponent(fmt(start))}&endDate=${encodeURIComponent(fmt(end))}` +
    `&timezone=UTC&dateType=transaction`

  const txns = await withCircuitBreaker(supabase, 'affiliate.awin.transactions', async () => {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(`awin transactions ${res.status}: ${(await res.text()).slice(0, 200)}`)
    return (await res.json()) as Array<Record<string, unknown>>
  })

  // advertiserId → merchant map (awin_advertiser_id set from the Merchants tab).
  const { data: merchantRows } = await supabase
    .from('marketplace_merchants')
    .select('id, awin_advertiser_id')
    .not('awin_advertiser_id', 'is', null)
  const merchantByAdvertiser: Record<string, string> = {}
  for (const m of merchantRows ?? []) merchantByAdvertiser[String(m.awin_advertiser_id)] = m.id

  const rows: ConversionRow[] = []
  for (const t of txns) {
    const id = t.id != null ? String(t.id) : null
    if (!id) continue
    const commission = t.commissionAmount as { amount?: number; currency?: string } | undefined
    const sale = t.saleAmount as { amount?: number; currency?: string } | undefined
    const clickRef =
      (t.clickRefs as Record<string, string> | undefined)?.clickRef ?? (t.clickRef as string | undefined) ?? null
    const match = await matchClick(supabase, clickRef)
    const advertiserId = t.advertiserId != null ? String(t.advertiserId) : null
    const status = t.paidToPublisher === true
      ? 'paid'
      : AWIN_STATUS[String(t.commissionStatus ?? '').toLowerCase()] ?? 'pending'
    rows.push({
      network: 'awin',
      network_txn_id: id,
      advertiser_ref: advertiserId,
      status,
      commission_amount: commission?.amount ?? null,
      commission_currency: commission?.currency ?? null,
      commission_usd: toUsd(fx, commission?.amount ?? null, commission?.currency ?? null),
      sale_amount: sale?.amount ?? null,
      sale_currency: sale?.currency ?? null,
      sale_usd: toUsd(fx, sale?.amount ?? null, sale?.currency ?? null),
      click_time: (t.clickDate as string) ?? null,
      transaction_time: (t.transactionDate as string) ?? null,
      sub_id: clickRef,
      click_code: match.click_code,
      surface: match.surface,
      partner_key: match.partner_key ?? 'mkt:awin',
      vertical: match.vertical ?? 'shopping',
      matched_click_id: match.matched_click_id,
      listing_id: match.listing_id,
      merchant_id: match.merchant_id ?? (advertiserId ? merchantByAdvertiser[advertiserId] ?? null : null),
      raw: t,
    })
  }
  return { rows }
}

// ── Travelpayouts ──────────────────────────────────────────────────

const TP_STATUS: Record<string, string> = {
  processing: 'pending',
  paid: 'approved',
  cancelled: 'rejected',
  canceled: 'rejected',
}

async function pullTravelpayouts(
  supabase: SupabaseClient,
  daysBack: number,
): Promise<{ rows: ConversionRow[] } | { skipped: string }> {
  const token = Deno.env.get('TRAVELPAYOUTS_API_TOKEN')
  if (!token) return { skipped: 'no_credentials' }

  const days = Math.min(Math.max(daysBack, 1), 365)
  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
  const until = new Date().toISOString().slice(0, 10)

  const PAGE = 300
  const actions: Array<Record<string, unknown>> = []
  for (let offset = 0; offset < 10_000; offset += PAGE) {
    const url =
      `https://api.travelpayouts.com/finance/v2/get_user_actions_affecting_balance` +
      `?currency=usd&from=${from}&until=${until}&limit=${PAGE}&offset=${offset}`
    const page = await withCircuitBreaker(supabase, 'affiliate.travelpayouts.actions', async () => {
      const res = await fetch(url, { headers: { 'X-Access-Token': token } })
      if (!res.ok) throw new Error(`tp actions ${res.status}: ${(await res.text()).slice(0, 200)}`)
      return (await res.json()) as Record<string, unknown>
    })
    // Response shape is loosely documented — accept both a bare array and
    // wrapped { data: { actions: [...] } } / { actions: [...] } forms.
    const batch = Array.isArray(page)
      ? page
      : ((page.data as Record<string, unknown> | undefined)?.actions ??
          page.actions ??
          (page.data as unknown)) as Array<Record<string, unknown>> | undefined
    if (!Array.isArray(batch) || batch.length === 0) break
    actions.push(...batch)
    if (batch.length < PAGE) break
  }

  const rows: ConversionRow[] = []
  for (const a of actions) {
    const actionId = a.action_id ?? a.id
    const subId = (a.sub_id as string) ?? (a.label as string) ?? null
    // Stable synthetic id when the API exposes no action id (defensive).
    const txnId = actionId != null
      ? String(actionId)
      : `synth:${a.action_date ?? a.created_at ?? from}:${a.campaign_id ?? 'na'}:${subId ?? 'na'}:${a.profit ?? 0}`
    const match = await matchClick(supabase, subId)
    const profit = a.profit != null ? Number(a.profit) : null
    rows.push({
      network: 'travelpayouts',
      network_txn_id: txnId,
      advertiser_ref: a.campaign_id != null ? String(a.campaign_id) : null,
      status: TP_STATUS[String(a.action_state ?? a.state ?? '').toLowerCase()] ?? 'pending',
      commission_amount: profit,
      commission_currency: 'USD', // requested with currency=usd
      commission_usd: profit,
      sale_amount: a.price != null ? Number(a.price) : null,
      sale_currency: a.price != null ? 'USD' : null,
      sale_usd: a.price != null ? Number(a.price) : null,
      click_time: null,
      transaction_time: (a.action_date as string) ?? (a.created_at as string) ?? null,
      sub_id: subId,
      click_code: match.click_code,
      surface: match.surface,
      partner_key: match.partner_key ?? 'travelpayouts',
      vertical: match.vertical ?? 'other',
      matched_click_id: match.matched_click_id,
      listing_id: match.listing_id,
      merchant_id: match.merchant_id,
      raw: a,
    })
  }
  return { rows }
}

// ── Handler ────────────────────────────────────────────────────────

Deno.serve(withErrorReporting('affiliate-conversions-sync', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  const supabase = getServiceClient()
  const authResult = await requireInternalOrAdmin(req, supabase)
  if (authResult instanceof Response) return authResult

  try {
    const body = await req.json().catch(() => ({}))
    const network = (body.network as string) || 'all'
    const daysBack = Math.max(1, Number(body.days_back ?? 35))
    const dryRun = body.dry_run === true

    const started = Date.now()
    const fx = await loadFx(supabase)
    const results: Record<string, unknown> = {}

    const networks = network === 'all' ? ['awin', 'travelpayouts'] : [network]
    for (const n of networks) {
      if (Date.now() - started > RUN_BUDGET_MS) {
        results[n] = { skipped: 'budget_exhausted' }
        continue
      }
      try {
        const pulled = n === 'awin'
          ? await pullAwin(supabase, fx, daysBack)
          : n === 'travelpayouts'
            ? await pullTravelpayouts(supabase, daysBack)
            : null
        if (!pulled) { results[n] = { skipped: 'unknown_network' }; continue }
        if ('skipped' in pulled) { results[n] = pulled; continue }

        const matched = pulled.rows.filter(r => r.matched_click_id).length
        const withCode = pulled.rows.filter(r => r.click_code).length
        if (dryRun) {
          results[n] = {
            dry_run: true, fetched: pulled.rows.length, with_code: withCode, matched,
            sample: pulled.rows.slice(0, 5),
          }
          continue
        }
        if (pulled.rows.length > 0) {
          const { error: upErr } = await supabase
            .from('affiliate_conversions')
            .upsert(pulled.rows, { onConflict: 'network,network_txn_id' })
          if (upErr) throw new Error(`upsert: ${upErr.message}`)
        }
        results[n] = { fetched: pulled.rows.length, with_code: withCode, matched }
      } catch (err) {
        results[n] = err instanceof CircuitOpenError
          ? { skipped: 'circuit_open' }
          : { error: (err as Error).message.slice(0, 300) }
      }
    }

    return jsonResponse({ success: true, dry_run: dryRun, days_back: daysBack, results }, 200, req)
  } catch (error) {
    return errorResponse((error as Error).message, 500, req)
  }
}))
