import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { mirrorLogoToR2, logoMirrorConfigured } from '../_shared/logo-mirror.ts'
import { fetchLogoForMirror } from '../_shared/logo-fetch.ts'
import { needsInkPlate, pngInk } from '../_shared/png-luminance.ts'

/**
 * marketplace-brand-logo-mirror — copy third-party brand logos into R2.
 *
 * POST { batch_size?: number (1-200, default 40), dry_run?: boolean }
 *
 * marketplace_brands.logo_url must point at img.queer.guide. A hotlink fails in
 * browsers whenever the host sends Cross-Origin-Resource-Policy (Bad Dragon's
 * static.bad-dragon.com did), and polarity (`logo_on_ink`) can only be measured
 * from bytes we hold. `trg_marketplace_brands_logo_mirrored` diverts any other
 * value written to logo_url into `logo_origin_url`; rows written before that
 * trigger still hold the hotlink in logo_url. Both come from
 * `marketplace_brand_logos_to_mirror()`.
 *
 * Each source is fetched server-side, its type sniffed from the bytes (SVG is
 * refused), mirrored to R2 content-addressed, and stored together with
 * `logo_on_ink` measured from the same bytes.
 *
 * A permanent failure is stamped on `logo_mirror_error`, which removes the row
 * from the work list; a legacy hotlink is left in place, because the server
 * being refused does not prove a browser is and deleting a curated choice is a
 * human decision. A transient failure stamps nothing and is retried next run.
 *
 * Kept separate from enrich-logos: it fetches only URLs a human or an earlier
 * run chose, so it needs neither logo.dev nor the platform/denied-mark
 * vocabularies, and it shares no failure mode with the three enrich-logos crons.
 */

interface MirrorCandidate {
  id: string
  display_name: string
  source_url: string
  legacy_hotlink: boolean
}

interface Failure {
  id: string
  name: string
  url: string
  reason: string
  permanent: boolean
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  const auth = await requireInternalOrAdmin(req, supabase)
  if (auth instanceof Response) return auth

  try {
    const body = await req.json().catch(() => ({}))
    const batchSize = Math.min(Math.max(Math.trunc(Number(body.batch_size)) || 40, 1), 200)
    const dryRun = body.dry_run === true

    if (!dryRun && !logoMirrorConfigured()) {
      return errorResponse('IMAGE_CDN_ADMIN_SECRET is not configured — cannot mirror logos to R2', 500, req)
    }

    const { data, error } = await supabase.rpc('marketplace_brand_logos_to_mirror', { p_limit: batchSize })
    if (error) throw new Error(`marketplace_brand_logos_to_mirror: ${error.message}`)
    const items = (data ?? []) as MirrorCandidate[]

    let mirrored = 0
    let inkPlates = 0
    let transient = 0
    const permanent: Record<string, number> = {}
    const failures: Failure[] = []

    for (const item of items) {
      const got = await fetchLogoForMirror(item.source_url)
      if (!got.ok) {
        if (got.permanent) permanent[got.reason] = (permanent[got.reason] ?? 0) + 1
        else transient++
        failures.push({ id: item.id, name: item.display_name, url: item.source_url, reason: got.reason, permanent: got.permanent })
        if (got.permanent && !dryRun) {
          await supabase.from('marketplace_brands').update({ logo_mirror_error: got.reason }).eq('id', item.id)
        }
        await delay(100)
        continue
      }

      if (dryRun) {
        mirrored++
        continue
      }

      const logoUrl = await mirrorLogoToR2(got.bytes, got.contentType)
      if (!logoUrl) {
        transient++
        failures.push({ id: item.id, name: item.display_name, url: item.source_url, reason: 'upload_failed', permanent: false })
        continue
      }

      // Measured from the bytes just mirrored, and written in the same UPDATE as
      // the url it describes, so the two cannot drift.
      const onInk = got.contentType === 'image/png' ? needsInkPlate(await pngInk(got.bytes)) : false
      if (onInk) inkPlates++

      const { error: upErr } = await supabase
        .from('marketplace_brands')
        .update({ logo_url: logoUrl, logo_origin_url: item.source_url, logo_on_ink: onInk, logo_mirror_error: null })
        .eq('id', item.id)
      if (upErr) {
        transient++
        failures.push({ id: item.id, name: item.display_name, url: item.source_url, reason: `update_failed`, permanent: false })
        console.error(`[brand-logo-mirror] update ${item.id}: ${upErr.message}`)
        continue
      }
      mirrored++
      await delay(100)
    }

    return jsonResponse(
      {
        success: true,
        dry_run: dryRun,
        processed: items.length,
        mirrored,
        ink_plates: inkPlates,
        transient_failures: transient,
        permanent_failures: permanent,
        failures,
      },
      200,
      req,
    )
  } catch (e) {
    console.error('marketplace-brand-logo-mirror error:', e)
    return errorResponse((e as Error).message, 500, req)
  }
})
