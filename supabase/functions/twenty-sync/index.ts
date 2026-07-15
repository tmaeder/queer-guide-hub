/**
 * twenty-sync — one-way push of queer.guide company/people records into a
 * self-hosted Twenty CRM (twentyhq/twenty), run on a cron.
 *
 * Mapping (idempotent, keyed on Twenty custom field `externalId`):
 *   organizations         → Company   externalId `org:<id>`
 *   marketplace_merchants → Company   externalId `merchant:<id>`
 *   contact_submissions   → Person    externalId `contact:<id>`
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

interface RowResult { externalId: string; action?: string; error?: string }

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
  try {
    const body = await req.json().catch(() => ({})) as { limit?: number }
    if (typeof body.limit === 'number' && body.limit > 0) limit = Math.min(body.limit, 2000)
  } catch { /* no body */ }

  const results: RowResult[] = []
  let succeeded = 0
  let failed = 0

  const push = async (externalId: string, objectPath: string, fields: Record<string, unknown>) => {
    try {
      const r = await upsertByExternalId(objectPath, externalId, fields)
      results.push({ externalId, action: r.action })
      succeeded++
    } catch (e) {
      results.push({ externalId, error: (e as Error).message })
      failed++
    }
  }

  try {
    // ── organizations → Company ──────────────────────────────────────────────
    if (budgetLeft()) {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, legal_name, website, website_domain, email, phone')
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(limit)
      if (error) throw new Error(`organizations: ${error.message}`)
      for (const o of data ?? []) {
        if (!budgetLeft()) break
        await push(`org:${o.id}`, 'companies', {
          name: o.legal_name || o.name,
          domainName: o.website_domain || undefined,
        })
      }
    }

    // ── marketplace_merchants → Company ──────────────────────────────────────
    if (budgetLeft()) {
      const { data, error } = await supabase
        .from('marketplace_merchants')
        .select('id, display_name, shop_domain, provider')
        .eq('is_enabled', true)
        .order('updated_at', { ascending: false })
        .limit(limit)
      if (error) throw new Error(`marketplace_merchants: ${error.message}`)
      for (const m of data ?? []) {
        if (!budgetLeft()) break
        await push(`merchant:${m.id}`, 'companies', {
          name: m.display_name,
          domainName: m.shop_domain || undefined,
        })
      }
    }

    // ── contact_submissions → Person ─────────────────────────────────────────
    if (budgetLeft()) {
      const { data, error } = await supabase
        .from('contact_submissions')
        .select('id, name, email, created_at')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw new Error(`contact_submissions: ${error.message}`)
      for (const c of data ?? []) {
        if (!budgetLeft()) break
        await push(`contact:${c.id}`, 'people', {
          name: splitName(c.name),
          emails: c.email ? { primaryEmail: c.email } : undefined,
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
      results: results.slice(0, 50),
    }, 200, req)
  } catch (error) {
    return errorResponse((error as Error).message, 500, req)
  }
}))
