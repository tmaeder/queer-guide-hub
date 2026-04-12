import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireAdmin } from '../_shared/supabase-client.ts'
import { resolveLogoUrl, delay } from '../_shared/logo-enrichment.ts'

/**
 * enrich-logos — Batch logo enrichment via logo.dev
 *
 * POST { table?: "venues"|"events"|"all", batch_size?: number, dry_run?: boolean, verify?: boolean }
 *
 * Finds records with a website but no logo_url, resolves via logo.dev, updates DB.
 * Call repeatedly until venues_remaining + events_remaining = 0.
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  const supabase = getServiceClient()

  const authResult = await requireAdmin(req, supabase)
  if (authResult instanceof Response) return authResult

  try {
    const body = await req.json().catch(() => ({}))
    const table = (body.table as string) || 'all'
    const batchSize = Math.min(body.batch_size || 100, 500)
    const dryRun = body.dry_run || false
    const verify = body.verify || false // HEAD-check each URL (slower but more accurate)

    const results: Record<string, unknown> = { dry_run: dryRun }

    if (table === 'venues' || table === 'all') {
      results.venues = await enrichTable(supabase, 'venues', 'website', batchSize, dryRun, verify)
    }

    if (table === 'events' || table === 'all') {
      results.events = await enrichTable(supabase, 'events', 'website', batchSize, dryRun, verify)
    }

    return jsonResponse({ success: true, ...results }, 200, req)
  } catch (error) {
    console.error('enrich-logos error:', error)
    return errorResponse((error as Error).message, 500, req)
  }
})

async function enrichTable(
  supabase: ReturnType<typeof getServiceClient>,
  table: string,
  websiteColumn: string,
  batchSize: number,
  dryRun: boolean,
  verify: boolean,
) {
  // Find records missing a logo
  const { data: items, error } = await supabase
    .from(table)
    .select(`id, ${websiteColumn}`)
    .is('logo_url', null)
    .not(websiteColumn, 'is', null)
    .order('created_at', { ascending: true })
    .limit(batchSize)

  if (error) throw new Error(`Query ${table}: ${error.message}`)
  if (!items || items.length === 0) {
    // Count remaining
    const { count } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .is('logo_url', null)
      .not(websiteColumn, 'is', null)

    return { processed: 0, logos_found: 0, errors: 0, remaining: count || 0 }
  }

  let logosFound = 0
  let errors = 0

  for (const item of items) {
    try {
      const website = item[websiteColumn] as string
      const logoUrl = await resolveLogoUrl(website, verify)

      if (!dryRun) {
        if (logoUrl) {
          await supabase
            .from(table)
            .update({ logo_url: logoUrl, logo_fetched_at: new Date().toISOString() })
            .eq('id', item.id)
          logosFound++
        } else {
          // Mark as attempted so we don't retry endlessly
          await supabase
            .from(table)
            .update({ logo_fetched_at: new Date().toISOString() })
            .eq('id', item.id)
        }
      } else if (logoUrl) {
        logosFound++
      }

      // Rate limit: 100ms between requests
      if (verify) await delay(100)
    } catch (e) {
      console.error(`Logo enrichment error for ${table}/${item.id}:`, (e as Error).message)
      errors++
    }
  }

  // Count remaining
  const { count } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .is('logo_url', null)
    .not(websiteColumn, 'is', null)

  return {
    processed: items.length,
    logos_found: logosFound,
    errors,
    remaining: (count || 0) - (dryRun ? 0 : items.length),
  }
}
