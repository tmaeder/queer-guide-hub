import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { fetchRealLogo, delay } from '../_shared/logo-enrichment.ts'
import { mirrorLogoToR2, logoMirrorConfigured } from '../_shared/logo-mirror.ts'

/**
 * enrich-logos — Batch logo enrichment, mirrored to our own R2/CDN.
 *
 * POST { table?: "venues"|"events"|"all", batch_size?: number, dry_run?: boolean }
 *
 * Finds records with a website but no logo_url. For each, fetches the REAL logo
 * from logo.dev (probed with `fallback=404`, so generic monograms are rejected),
 * mirrors the bytes into R2 via the image-cdn Worker, and stores the resulting
 * token-free img.queer.guide URL. Call repeatedly until
 * venues_remaining + events_remaining = 0.
 *
 * Domains with no real logo are marked attempted (logo_fetched_at) but keep
 * logo_url = null, so their own photos still show under the logo-first display
 * rule. If the R2 upload fails, logo_url is left null and the row is retried on a
 * later run — no logo.dev token is ever stored in a public URL.
 *
 * Requires IMAGE_CDN_ADMIN_SECRET (matching the image-cdn Worker's ADMIN_SECRET);
 * a non-dry-run without it fails fast rather than churning logo.dev for nothing.
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  const supabase = getServiceClient()

  const authResult = await requireInternalOrAdmin(req, supabase)
  if (authResult instanceof Response) return authResult

  try {
    const body = await req.json().catch(() => ({}))
    const table = (body.table as string) || 'all'
    const batchSize = Math.min(body.batch_size || 100, 500)
    const dryRun = body.dry_run || false

    if (!dryRun && !logoMirrorConfigured()) {
      return errorResponse(
        'IMAGE_CDN_ADMIN_SECRET is not configured — cannot mirror logos to R2. ' +
          'Set it (to the image-cdn Worker ADMIN_SECRET) or pass dry_run:true.',
        500,
        req,
      )
    }

    const results: Record<string, unknown> = { dry_run: dryRun }

    if (table === 'venues' || table === 'all') {
      results.venues = await enrichTable(supabase, 'venues', 'website', batchSize, dryRun)
    }

    if (table === 'events' || table === 'all') {
      results.events = await enrichTable(supabase, 'events', 'website', batchSize, dryRun)
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
) {
  // Find records that still need a logo AND haven't been attempted yet.
  // Filtering on logo_fetched_at is what lets the batch terminate: a no-logo
  // domain is stamped attempted and never re-probed, while a transient mirror
  // failure leaves logo_fetched_at null so the row retries on a later run.
  const { data: items, error } = await supabase
    .from(table)
    .select(`id, ${websiteColumn}`)
    .is('logo_url', null)
    .is('logo_fetched_at', null)
    .not(websiteColumn, 'is', null)
    .order('created_at', { ascending: true })
    .limit(batchSize)

  if (error) throw new Error(`Query ${table}: ${error.message}`)
  if (!items || items.length === 0) {
    // Count remaining unattempted
    const { count } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .is('logo_url', null)
      .is('logo_fetched_at', null)
      .not(websiteColumn, 'is', null)

    return { processed: 0, logos_found: 0, mirror_failed: 0, errors: 0, remaining: count || 0 }
  }

  let logosFound = 0
  let mirrorFailed = 0
  let errors = 0

  for (const item of items) {
    try {
      const website = item[websiteColumn] as string
      const logo = await fetchRealLogo(website)

      // Dry run: only measure how many have a real logo; no upload, no writes.
      if (dryRun) {
        if (logo) logosFound++
        await delay(100)
        continue
      }

      let logoUrl: string | null = null
      if (logo) {
        logoUrl = await mirrorLogoToR2(logo.bytes, logo.contentType)
        if (!logoUrl) mirrorFailed++ // real logo, but upload failed → retry later
      }

      if (logoUrl) {
        await supabase
          .from(table)
          .update({ logo_url: logoUrl, logo_fetched_at: new Date().toISOString() })
          .eq('id', item.id)
        logosFound++
      } else if (!logo) {
        // No real logo for this domain — mark attempted, keep photos.
        await supabase
          .from(table)
          .update({ logo_fetched_at: new Date().toISOString() })
          .eq('id', item.id)
      }

      // Rate limit: 100ms between logo.dev requests
      await delay(100)
    } catch (e) {
      console.error(`Logo enrichment error for ${table}/${item.id}:`, (e as Error).message)
      errors++
    }
  }

  // Count remaining unattempted. After a real run, rows we resolved (logo_url set)
  // and no-logo rows (logo_fetched_at set) are excluded; mirror-failures remain.
  // In a dry run nothing was written, so subtract this batch to avoid re-counting.
  const { count } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .is('logo_url', null)
    .is('logo_fetched_at', null)
    .not(websiteColumn, 'is', null)

  return {
    processed: items.length,
    logos_found: logosFound,
    mirror_failed: mirrorFailed,
    errors,
    remaining: (count || 0) - (dryRun ? items.length : 0),
  }
}
