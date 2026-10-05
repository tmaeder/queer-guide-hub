import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import {
  probeRealLogo,
  extractDomain,
  delay,
  type LogoProbeOutcome,
} from '../_shared/logo-enrichment.ts'
import { mirrorLogoToR2, logoMirrorConfigured } from '../_shared/logo-mirror.ts'
import { pickSiteIcons, isAcceptableLogoType, imageSize } from '../_shared/site-icon.ts'
import { needsInkPlate, pngInk } from '../_shared/png-luminance.ts'
import {
  loadPlatformRules,
  loadDeniedMarks,
  logoMarkSha256,
  platformWebsiteClass,
  websiteHost,
  type PlatformRule,
} from '../_shared/platform-domain.ts'

/**
 * enrich-logos — Batch logo enrichment, mirrored to our own R2/CDN.
 *
 * POST { table?: "venues"|"events"|"organizations"|"marketplace_brands"|"all", batch_size?: number, dry_run?: boolean }
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

    // Loaded once per request, not per row or per table. Throws if the table is
    // unreadable or empty: an absent vocabulary disables the guard silently, and
    // this guard exists because an unchecked logo reaches thousands of rows.
    const platformRules = await loadPlatformRules(supabase)
    // The second layer's vocabulary. Empty is a legitimate state here — unlike
    // the platform list, this one is discovered incrementally from the
    // sentinel's advisory arm rather than seeded up front.
    const deniedMarks = await loadDeniedMarks(supabase)

    if (table === 'venues' || table === 'all') {
      results.venues = await enrichTable(supabase, 'venues', 'website', batchSize, dryRun, platformRules, deniedMarks)
    }

    if (table === 'events' || table === 'all') {
      results.events = await enrichTable(supabase, 'events', 'website', batchSize, dryRun, platformRules, deniedMarks)
    }

    if (table === 'organizations' || table === 'all') {
      results.organizations = await reprobeLegacyOrgLogos(supabase, batchSize, dryRun, platformRules, deniedMarks)
    }

    if (table === 'marketplace_brands' || table === 'all') {
      results.marketplace_brands = await enrichBrands(supabase, batchSize, dryRun)
    }

    // One dead token writes off every row it touches, so it is reported at the
    // top level rather than buried in a per-table count.
    const authFailed = Object.values(results).some(
      (r) => typeof r === 'object' && r !== null && (r as { logodev?: LogoDevTally }).logodev?.unauthorized,
    )
    if (authFailed) console.error('[enrich-logos] logo.dev rejected the token — logos were NOT written off legitimately')

    return jsonResponse({ success: true, logodev_unauthorized: authFailed, ...results }, 200, req)
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
  platformRules: readonly PlatformRule[],
  deniedMarks: ReadonlySet<string>,
) {
  // Find records that still need a logo AND haven't been attempted yet.
  // Filtering on logo_fetched_at is what lets the batch terminate: a no-logo
  // domain is stamped attempted and never re-probed, while a transient mirror
  // failure leaves logo_fetched_at null so the row retries on a later run.
  const { data: items, error } = await supabase
    .from(table)
    // A literal list, not an interpolated one: supabase-js parses the select at
    // the type level and a `${}` segment makes the whole row type a ParserError.
    // Both callers pass `website`, so the literal costs nothing and the dynamic
    // column name is still honoured when the row is read below.
    .select('id, enrichment_status, website')
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
  let inkPlates = 0
  let platformSkipped = 0
  let deniedMarkSkipped = 0
  const logodev = newTally()
  let aborted: 'unauthorized' | 'rate_limited' | null = null

  for (const item of items) {
    try {
      const website = (item as { website: string | null }).website as string

      // The website is a PLATFORM, not this entity's own site — a Facebook page,
      // a shortened link, a free site-builder subdomain, a directory listing. The
      // domain resolves perfectly and logo.dev answers with the PLATFORM's mark,
      // which is how one Facebook "f" ended up on 558 venues and GayCities' logo
      // on 4,169 events. Skip BEFORE the probe: there is no logo to find here, so
      // the request would only spend quota to fetch the wrong answer.
      //
      // `logo_fetched_at` is stamped so the row leaves the work list. That is a
      // deliberate difference from the `unauthorized`/`rate_limited` abort below:
      // there the probe failed and told us nothing ABOUT THE ROW, so writing it
      // off would record absence of evidence as evidence of absence. Here the
      // verdict IS about the row, and re-deciding it nightly is a treadmill.
      const platformClass = platformWebsiteClass(website, platformRules)
      if (platformClass) {
        platformSkipped++
        if (!dryRun) {
          await supabase
            .from(table)
            .update({
              logo_fetched_at: new Date().toISOString(),
              enrichment_status: {
                ...((item as { enrichment_status?: Record<string, unknown> }).enrichment_status ?? {}),
                logo: { skipped: 'platform_website', class: platformClass, host: websiteHost(website) },
              },
            })
            .eq('id', item.id)
        }
        continue
      }

      const probe = await probeRealLogo(website)
      logodev[probe.outcome]++

      // logo.dev is the ONLY source for venues and events, so a rejected token
      // or a rate limit is not information about this row — it is the absence
      // of information. Stamping logo_fetched_at here would write the row off
      // permanently for a reason that has nothing to do with it, and that is
      // precisely what the old code did silently: it collapsed 401 into null
      // and every venue it touched while the token was dead is now recorded as
      // "probed, no logo". Abort the batch instead.
      if (probe.outcome === 'unauthorized' || probe.outcome === 'rate_limited') {
        aborted = probe.outcome
        break
      }

      const logo = probe.logo

      // Dry run: only measure how many have a real logo; no upload, no writes.
      if (dryRun) {
        if (logo) logosFound++
        await delay(100)
        continue
      }

      let logoUrl: string | null = null
      let deniedMark = false
      if (logo) {
        logoUrl = await mirrorLogoToR2(logo.bytes, logo.contentType)
        if (!logoUrl) mirrorFailed++ // real logo, but upload failed → retry later

        // SECOND LAYER. The domain passed the platform check — it IS this
        // venue's own site — and the image that came back is still junk:
        // WordPress's "W" from a self-hosted site, GoDaddy's heart from a parked
        // one, a blank square. No domain rule can express that, so the key is
        // the image, and R2 is content-addressed, which means the mirrored url
        // already carries the identity of the bytes.
        //
        // Checked AFTER mirroring, necessarily — the hash does not exist until
        // the bytes do. The upload is therefore spent either way; what this
        // saves is the row, not the request.
        const mark = logoUrl ? logoMarkSha256(logoUrl) : null
        if (mark && deniedMarks.has(mark)) {
          deniedMarkSkipped++
          deniedMark = true
          logoUrl = null
        }
      }

      if (logoUrl) {
        // Polarity, measured from the bytes we just mirrored. The venue tile is
        // `bg-muted`, a THEME token, so a dark wordmark dies in dark mode and a
        // white one dies in light — both directions, unlike the marketplace
        // plate. `logo_on_ink` lets the tile pin itself to a fixed ground.
        // Venues only: `events` has no such column and no logo-first surface.
        const patch: Record<string, unknown> = {
          logo_url: logoUrl,
          logo_fetched_at: new Date().toISOString(),
        }
        if (table === 'venues') {
          const onInk =
            logo && logo.contentType.split(';')[0].trim().toLowerCase() === 'image/png'
              ? needsInkPlate(await pngInk(logo.bytes))
              : false
          patch.logo_on_ink = onInk
          if (onInk) inkPlates++
        }
        await supabase.from(table).update(patch).eq('id', item.id)
        logosFound++
      } else if (!logo || deniedMark) {
        // No real logo for this domain — mark attempted, keep photos.
        //
        // `deniedMark` joins this branch deliberately and must NOT fall through
        // to the retry path above it: a mirror failure leaves `logo_fetched_at`
        // null so the row is tried again, which is right for a transient upload
        // error and wrong here. The image is junk every time it is fetched, so
        // re-probing it nightly is the treadmill this repo has removed from
        // three other queues.
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
    // Reported, not silent: a batch that is mostly platform skips means the
    // corpus is largely social-profile "websites", which is a data finding the
    // run should surface rather than absorb into `processed`.
    platform_skipped: platformSkipped,
    denied_mark_skipped: deniedMarkSkipped,
    ink_plates: inkPlates,
    mirror_failed: mirrorFailed,
    errors,
    logodev,
    aborted,
    remaining: (count || 0) - (dryRun ? items.length : 0),
  }
}


/**
 * organizations — re-probe the 2026-04-07 batch, which stored logo.dev's
 * MONOGRAM as if it were a brand mark.
 *
 * Every organization logo was written in one batch to Supabase storage at
 * `logos/venues/<uuid>.png`, one file per entity rather than content-addressed.
 * Fetched and looked at, the biggest shared groups are a single dark letter on
 * white — "T" on 28 unrelated organizations, "B" on 21, "C" on 18. That is
 * logo.dev's first-letter fallback, which `probeRealLogo` already refuses for
 * venues and events via `fallback=404`, because under the logo-first display
 * rule a monogram MASKS the entity's own photographs.
 *
 * This is a separate function from `enrichTable` rather than a flag on it,
 * because the work list is the inverse: `enrichTable` looks for rows with NO
 * logo, and every row here HAS one. Folding the two together would mean a
 * selector that means opposite things depending on a parameter.
 *
 * Neither the share count nor the byte size can tell a monogram from a real
 * logo here — measured, 547 of 783 marks are singletons, and the shared ones
 * span 834 B to 103 kB with a genuine chain logo among them. So the source is
 * asked instead, which is the same evidence the venue path already trusts.
 *
 * A `found` row is MIRRORED TO R2 and its url replaced. That is the half that
 * closes the gap rather than papering over it: organizations only become
 * reachable by `logo_denied_marks` once their images are content-addressed.
 */
async function reprobeLegacyOrgLogos(
  supabase: ReturnType<typeof getServiceClient>,
  batchSize: number,
  dryRun: boolean,
  platformRules: readonly PlatformRule[],
  deniedMarks: ReadonlySet<string>,
) {
  const { data: items, error } = await supabase
    .from('organizations')
    .select('id, enrichment_status, website, logo_url')
    .is('logo_fetched_at', null)
    .like('logo_url', '%/storage/v1/object/public/logos/%')
    .order('created_at', { ascending: true })
    .limit(batchSize)

  if (error) throw new Error(`Query organizations: ${error.message}`)
  if (!items || items.length === 0) return { processed: 0, cleared: 0, migrated: 0, remaining: 0 }

  let cleared = 0
  let migrated = 0
  let platformSkipped = 0
  let deniedMarkSkipped = 0
  let mirrorFailed = 0
  let errors = 0
  const logodev = newTally()
  let aborted: 'unauthorized' | 'rate_limited' | null = null

  for (const item of items) {
    try {
      const row = item as {
        id: string
        website: string | null
        logo_url: string | null
        enrichment_status?: Record<string, unknown>
      }
      const priorUrl = row.logo_url
      const stamp = (patch: Record<string, unknown>, logo: Record<string, unknown>) =>
        supabase
          .from('organizations')
          .update({
            ...patch,
            logo_fetched_at: new Date().toISOString(),
            enrichment_status: {
              ...(row.enrichment_status ?? {}),
              logo: { ...logo, prior_url: priorUrl, at: new Date().toISOString() },
            },
          })
          .eq('id', row.id)

      // Defensive: measured zero today, because the domain layer already cleared
      // every organization whose website is a platform. Kept so this path cannot
      // become the one place that forgets.
      const platformClass = platformWebsiteClass(row.website, platformRules)
      if (platformClass) {
        platformSkipped++
        cleared++
        if (!dryRun) await stamp({ logo_url: null }, { skipped: 'platform_website', class: platformClass })
        continue
      }

      const probe = await probeRealLogo(row.website)
      logodev[probe.outcome]++

      // The probe failed and told us NOTHING about this row. Stamping here would
      // write it off for a reason that has nothing to do with it — the exact
      // mistake that recorded 6,498 venues as having no logo while the token was
      // dead. Abort and leave every remaining row untouched.
      if (probe.outcome === 'unauthorized' || probe.outcome === 'rate_limited') {
        aborted = probe.outcome
        break
      }

      if (probe.outcome === 'not_indexed') {
        // logo.dev has no real mark for this domain, so the stored image is the
        // monogram it served before `fallback=404` was used. Clear it; the
        // organization keeps its own photographs.
        cleared++
        if (!dryRun) await stamp({ logo_url: null }, { cleared: 'logodev_monogram', reason: 'not_indexed' })
        await delay(100)
        continue
      }

      if (probe.outcome !== 'found' || !probe.logo) {
        // A transient error: no stamp, so the row is retried on a later run.
        errors++
        await delay(100)
        continue
      }

      // A real logo. Move it onto the content-addressed path so the denied-mark
      // layer can see it — that is what makes organizations reachable at all.
      if (!dryRun) {
        const mirrored = await mirrorLogoToR2(probe.logo.bytes, probe.logo.contentType)
        if (!mirrored) {
          mirrorFailed++ // left unstamped on purpose: retried on a later run
        } else {
          const mark = logoMarkSha256(mirrored)
          if (mark && deniedMarks.has(mark)) {
            // Real to logo.dev, junk to us — WordPress, a parking badge, a blank
            // square. Same disposition as a monogram.
            deniedMarkSkipped++
            cleared++
            await stamp({ logo_url: null }, { cleared: 'denied_mark', mark })
          } else {
            migrated++
            await stamp({ logo_url: mirrored }, { migrated_to_r2: true, mark })
          }
        }
      } else {
        migrated++
      }
      await delay(100)
    } catch (e) {
      console.error(`Org logo re-probe error for ${(item as { id: string }).id}:`, (e as Error).message)
      errors++
    }
  }

  const { count } = await supabase
    .from('organizations')
    .select('id', { count: 'exact', head: true })
    .is('logo_fetched_at', null)
    .like('logo_url', '%/storage/v1/object/public/logos/%')

  return {
    processed: items.length,
    cleared,
    migrated,
    platform_skipped: platformSkipped,
    denied_mark_skipped: deniedMarkSkipped,
    mirror_failed: mirrorFailed,
    errors,
    logodev,
    aborted,
    remaining: (count || 0) - (dryRun ? items.length : 0),
  }
}

/**
 * Why logo.dev said no, counted per run.
 *
 * Not diagnostics-for-their-own-sake: for as long as this function has existed a
 * dead token and an unindexed domain were the same null, so an upstream that
 * stopped answering would have looked exactly like a corpus it does not cover —
 * a green run, rows stamped attempted, and nothing to notice. The counts are
 * returned so the caller can tell those apart, and `unauthorized` is surfaced
 * as a top-level flag because it means EVERY row in the batch was written off
 * for a reason that has nothing to do with the row.
 */
type LogoDevTally = Record<LogoProbeOutcome, number>

function newTally(): LogoDevTally {
  return { found: 0, not_indexed: 0, unauthorized: 0, rate_limited: 0, unconfigured: 0, error: 0 }
}

// ─────────────────────────────────────────────────────────────────────────────
// marketplace_brands
//
// Brands do not have a `website` to key on — 23 of 885 live ones do — so the
// domain comes from `marketplace_brand_logo_candidates`, which corroborates a
// listing's merchant_domain against the brand's own name and returns NULL
// rather than a retailer's domain when nothing corroborates (see that
// function's migration for why "Custom" must never inherit automicgold.com).
//
// Two sources, in order. logo.dev first: it is one request and its
// `fallback=404` probe guarantees a real mark. Then the shop's own declared
// logo, because logo.dev knows household brands and this catalogue is mostly
// independent makers running Shopify. A brand that yields neither is stamped
// attempted and keeps its monogram.

const BRAND_UA =
  'Mozilla/5.0 (compatible; QueerGuideBot/1.0; +https://queer.guide/about) logo-enrichment'
const MIN_LOGO_BYTES = 1000 // a 16x16 favicon; the monogram beats it in the plate
const MAX_LOGO_BYTES = 2 * 1024 * 1024

async function fetchWithTimeout(url: string, ms: number, accept: string): Promise<Response | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': BRAND_UA, Accept: accept },
    })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The shop's own declared brand mark, or null.
 *
 * Walks the ranked candidates rather than trusting the top one: the best-ranked
 * mark can still fail the pixel check — a Shopify `rel=icon` whose asset really
 * is 32×32 — and the next candidate down is often the wordmark. Measured over
 * 25 of this catalogue's shops, walking recovers 20; taking only the head
 * recovered 3.
 */
async function fetchSiteLogo(
  domain: string,
): Promise<{ bytes: Uint8Array; contentType: string; kind: string } | null> {
  const site = `https://${domain}/`
  const page = await fetchWithTimeout(site, 12000, 'text/html')
  if (!page || !page.ok) return null
  if (!(page.headers.get('content-type') || '').toLowerCase().includes('text/html')) return null

  const html = (await page.text()).slice(0, 400_000)
  for (const pick of pickSiteIcons(html, page.url || site, site).slice(0, 4)) {
    const img = await fetchWithTimeout(pick.url, 12000, 'image/*')
    if (!img || !img.ok) continue
    const contentType = (img.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (!isAcceptableLogoType(contentType)) continue

    const bytes = new Uint8Array(await img.arrayBuffer())
    if (bytes.byteLength < MIN_LOGO_BYTES || bytes.byteLength > MAX_LOGO_BYTES) continue

    // SVG is scalable, so it has nothing to measure and nothing to fail.
    if (contentType !== 'image/svg+xml') {
      const size = imageSize(bytes)
      if (!size) continue
      if (Math.max(size.width, size.height) < 96) continue
      if (Math.min(size.width, size.height) < 24) continue // a sprite strip, not a mark
    }
    return { bytes, contentType, kind: pick.kind }
  }
  return null
}

interface BrandCandidate {
  id: string
  brand_key: string
  display_name: string
  domain: string | null
  evidence: string | null
}

async function enrichBrands(
  supabase: ReturnType<typeof getServiceClient>,
  batchSize: number,
  dryRun: boolean,
) {
  const { data, error } = await supabase.rpc('marketplace_brand_logo_candidates', {
    p_limit: batchSize,
  })
  if (error) throw new Error(`marketplace_brand_logo_candidates: ${error.message}`)
  const items = (data ?? []) as BrandCandidate[]

  const stamp = async (id: string, patch: Record<string, unknown>) => {
    if (dryRun) return
    await supabase
      .from('marketplace_brands')
      .update({ ...patch, logo_fetched_at: new Date().toISOString() })
      .eq('id', id)
  }

  let logosFound = 0
  let fromLogoDev = 0
  let fromSite = 0
  let noDomain = 0
  let notFound = 0
  let mirrorFailed = 0
  let errors = 0
  let inkPlates = 0
  const logodev = newTally()

  for (const item of items) {
    try {
      const domain = extractDomain(item.domain)
      if (!domain) {
        noDomain++
        await stamp(item.id, { logo_source: 'no_domain' })
        continue
      }

      const probe = await probeRealLogo(domain)
      logodev[probe.outcome]++
      let bytes = probe.logo?.bytes ?? null
      let contentType = probe.logo?.contentType ?? ''
      let source = probe.logo ? `logodev:${domain}` : ''

      if (!bytes) {
        const site = await fetchSiteLogo(domain)
        if (site) {
          bytes = site.bytes
          contentType = site.contentType
          source = `site:${site.kind}:${domain}`
        }
      }

      if (!bytes) {
        notFound++
        await stamp(item.id, { logo_source: 'not_found' })
        await delay(150)
        continue
      }

      if (dryRun) {
        logosFound++
        if (source.startsWith('logodev')) fromLogoDev++
        else fromSite++
        await delay(150)
        continue
      }

      const logoUrl = await mirrorLogoToR2(bytes, contentType)
      if (!logoUrl) {
        // Real logo, upload failed: leave logo_fetched_at null so it retries.
        mirrorFailed++
        await delay(150)
        continue
      }

      // Measure the bytes we just mirrored, not the ones we might fetch back:
      // this is the only moment the image is in hand, and the answer belongs in
      // the same UPDATE as the url it describes so the two cannot drift.
      const onInk = contentType === 'image/png' ? needsInkPlate(await pngInk(bytes)) : false
      if (onInk) inkPlates++

      await supabase
        .from('marketplace_brands')
        .update({
          logo_url: logoUrl,
          logo_source: source,
          logo_on_ink: onInk,
          logo_fetched_at: new Date().toISOString(),
        })
        .eq('id', item.id)

      logosFound++
      if (source.startsWith('logodev')) fromLogoDev++
      else fromSite++
      await delay(150)
    } catch (e) {
      console.error(`Brand logo error for ${item.display_name}:`, (e as Error).message)
      errors++
    }
  }

  const { count } = await supabase
    .from('marketplace_brands')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'approved')
    .gt('product_count', 0)
    .is('logo_url', null)
    .is('logo_fetched_at', null)

  return {
    processed: items.length,
    logos_found: logosFound,
    from_logodev: fromLogoDev,
    from_site: fromSite,
    ink_plates: inkPlates,
    no_domain: noDomain,
    not_found: notFound,
    mirror_failed: mirrorFailed,
    errors,
    logodev,
    remaining: (count || 0) - (dryRun ? items.length : 0),
  }
}
