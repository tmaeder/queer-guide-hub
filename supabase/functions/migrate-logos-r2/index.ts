import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { mirrorLogoToR2, logoMirrorConfigured } from '../_shared/logo-mirror.ts'
import { delay } from '../_shared/logo-enrichment.ts'

/**
 * migrate-logos-r2 — Move EXISTING logos onto our own R2/CDN.
 *
 * POST { table?: "venues"|"events"|"all", batch_size?: number, dry_run?: boolean }
 *
 * Some logos already live elsewhere: ~1.3k in Supabase Storage (token-free but a
 * different store) and a handful of legacy logo.dev URLs that still embed the API
 * token. This re-hosts any logo_url that isn't already on img.queer.guide:
 * download the bytes → mirror to R2 (content-addressed, deduped) → repoint
 * logo_url at the token-free CDN URL. Idempotent — once a row is on the CDN it's
 * excluded. Call repeatedly until venues_remaining + events_remaining = 0.
 *
 * Failures (dead source URL, upload error) leave the row unchanged and are
 * reported as `errors`; rerun and watch `migrated` fall to 0. Requires
 * IMAGE_CDN_ADMIN_SECRET (matching the image-cdn Worker's ADMIN_SECRET).
 */

const CDN_BASE = (Deno.env.get('IMAGE_CDN_BASE_URL') || 'https://img.queer.guide').replace(/\/+$/, '')
const CDN_HOST = (() => {
  try { return new URL(CDN_BASE).host } catch { return 'img.queer.guide' }
})()

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
      results.venues = await migrateTable(supabase, 'venues', batchSize, dryRun)
    }
    if (table === 'events' || table === 'all') {
      results.events = await migrateTable(supabase, 'events', batchSize, dryRun)
    }

    return jsonResponse({ success: true, ...results }, 200, req)
  } catch (error) {
    console.error('migrate-logos-r2 error:', error)
    return errorResponse((error as Error).message, 500, req)
  }
})

async function countRemaining(
  supabase: ReturnType<typeof getServiceClient>,
  table: string,
): Promise<number> {
  const { count } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .not('logo_url', 'is', null)
    .not('logo_url', 'ilike', `%${CDN_HOST}%`)
  return count || 0
}

async function migrateTable(
  supabase: ReturnType<typeof getServiceClient>,
  table: string,
  batchSize: number,
  dryRun: boolean,
) {
  // Logos not yet on our CDN.
  const { data: items, error } = await supabase
    .from(table)
    .select('id, logo_url')
    .not('logo_url', 'is', null)
    .not('logo_url', 'ilike', `%${CDN_HOST}%`)
    .order('created_at', { ascending: true })
    .limit(batchSize)

  if (error) throw new Error(`Query ${table}: ${error.message}`)

  if (dryRun || !items || items.length === 0) {
    return { processed: 0, migrated: 0, errors: 0, remaining: await countRemaining(supabase, table) }
  }

  let migrated = 0
  let errors = 0

  for (const item of items) {
    const sourceUrl = item.logo_url as string
    try {
      const res = await fetch(sourceUrl, { method: 'GET' })
      if (!res.ok) {
        // Leave dead/unreachable sources in place; surface as errors.
        errors++
        await delay(100)
        continue
      }
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (bytes.byteLength < 100) {
        errors++
        await delay(100)
        continue
      }
      const contentType = res.headers.get('content-type') || 'image/png'
      const cdnUrl = await mirrorLogoToR2(bytes, contentType)
      if (!cdnUrl) {
        errors++ // upload failed → retry on a later run
        await delay(100)
        continue
      }
      await supabase.from(table).update({ logo_url: cdnUrl }).eq('id', item.id)
      migrated++
      await delay(100)
    } catch (e) {
      console.error(`Logo migration error for ${table}/${item.id}:`, (e as Error).message)
      errors++
    }
  }

  return {
    processed: items.length,
    migrated,
    errors,
    remaining: (await countRemaining(supabase, table)),
  }
}
