/**
 * tag-imagery — acquires photographs for glossary entries.
 *
 * Glossary photography was retired on 2026-08-28 and re-introduced on
 * 2026-10-10 under a write-time contract (99991791616269). This is the producer
 * for that contract, and it is deliberately NOT a re-run of what was retired.
 * The retirement's own header describes the old mechanism: "taking the TOP-1
 * Pexels/Unsplash hit for a keyword-mapped tag name -- no scoring, no
 * content-match check -- and 1,262 of them with no recoverable license".
 *
 * THREE TIERS, and only one of them may publish unattended:
 *
 *   1. `wikidata:p18` -- the image a Wikidata editor curated on the tag's OWN
 *      entity. The match is structural rather than guessed, so this is the only
 *      tier that writes without a human. QIDs listed in
 *      `tag_wikidata_repair_audit` are skipped: that table is the register of
 *      identifiers this repo has already disowned for pointing at the wrong
 *      thing, and it is exactly what would otherwise reproduce `cum` ->
 *      Sca_fell_massif.
 *   2. `wikimedia` -- Commons keyword search, corroborated against the tag's
 *      name and approved aliases, then REVIEW-GATED. Corroboration bounds the
 *      candidate set and cannot settle a namesake (`unicorn` really does appear
 *      in "Unicorn_spider_outline.jpg"), so a human decides.
 *   3. `pexels` / `unsplash` -- stock, REVIEW-GATED, and refused outright on any
 *      `is_adult` or `is_sensitive` tag. Both licences bar implying an
 *      identifiable model's association with sensitive subject matter, and 70%
 *      of the indexable glossary is adult.
 *
 * Every verdict comes from `_shared/tag-image-guard.ts`, which is pure and
 * unit-tested against the real strings the retired corpus published.
 *
 * THE REPORT CARRIES PER-ROW `results`, NOT ONLY TALLIES. `class_refused: 6`
 * reads the same whether the six were right or half wrong -- the lesson from
 * `city_qid_gap_link`, where aggregate counters hid three false refusals that
 * would have written most of China off permanently. It also states the tier it
 * worked, because an engine that silently works a different list than the one
 * it was asked for is the defect that hid for months in `cities_due_for_refresh`.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import {
  corsResponse,
  errorResponse,
  getServiceClient,
  jsonResponse,
  requireInternalOrAdmin,
} from '../_shared/supabase-client.ts'
import {
  fetchFromPexels,
  fetchFromUnsplash,
  fetchFromWikimedia,
  WP_UA,
} from '../_shared/image-search.ts'
import { canonicaliseUrl, sha256Hex } from '../_shared/image-assets.ts'
import { logoMirrorConfigured, mirrorImageToR2 } from '../_shared/logo-mirror.ts'
import {
  tagImageVerdict,
  type TagImageCandidate,
  type TagImageSource,
} from '../_shared/tag-image-guard.ts'

type Tier = 'p18' | 'commons' | 'stock'
const TIERS: Tier[] = ['p18', 'commons', 'stock']

const MAX_BYTES = 6_000_000
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

interface TagRow {
  id: string
  slug: string
  name: string
  category: string | null
  is_adult: boolean | null
  is_sensitive: boolean | null
  wikidata_id: string | null
  enrichment_status: Record<string, unknown> | null
}

interface RowResult {
  slug: string
  tier: Tier | null
  decision: 'published' | 'queued' | 'refused' | 'skipped' | 'error'
  why: string
  url?: string
}

/**
 * Commons Artist / ImageDescription values are HTML. Strip tags to a FIXPOINT:
 * one pass is bypassable, because removing the inner tag of `<scr<script>ipt>`
 * splices the outer one back into a live tag (CodeQL
 * js/incomplete-multi-character-sanitization). Then drop stray angle brackets.
 *
 * Byte-identical to `queer-imagery-backfill`'s stripHtml, which already carried
 * this fix — same input (Commons `extmetadata` HTML), so same shape rather than
 * a second one.
 */
function stripHtml(value: string | undefined | null): string {
  let s = value ?? ''
  let prev: string
  do {
    prev = s
    s = s.replace(/<[^>]*>/g, '')
  } while (s !== prev)
  return s.replace(/[<>]/g, '').trim()
}

/** One Commons imageinfo call: canonical URL, dimensions, artist, licence. */
async function commonsFileInfo(fileTitle: string): Promise<{
  url: string
  width: number
  height: number
  attribution: string | null
  license: string | null
  description: string
} | null> {
  const res = await fetch(
    `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(fileTitle)}` +
      `&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1600&format=json`,
    { headers: { 'User-Agent': WP_UA, Accept: 'application/json' } },
  )
  if (!res.ok) return null
  const data = await res.json()
  const page = Object.values(data?.query?.pages ?? {})[0] as {
    imageinfo?: Array<{
      url?: string
      thumburl?: string
      width?: number
      height?: number
      extmetadata?: Record<string, { value?: string }>
    }>
  }
  const info = page?.imageinfo?.[0]
  if (!info?.url) return null
  const meta = info.extmetadata ?? {}
  return {
    // The thumb is a 1600px render of the original; the original can be a
    // 40 MB TIFF-sized JPEG that blows MAX_BYTES for no visual gain.
    url: info.thumburl ?? info.url,
    width: info.width ?? 0,
    height: info.height ?? 0,
    attribution: stripHtml(meta.Artist?.value) || null,
    license: meta.LicenseShortName?.value ?? null,
    description: stripHtml(meta.ImageDescription?.value),
  }
}

/**
 * The tag's own Wikidata entity -> P18.
 *
 * `wbgetclaims` rather than a SPARQL query: one request, no breaker, and it
 * returns the claim for exactly the entity asked for. A null means the entity
 * carries no image, which is a NEGATIVE FINDING about the entity and not an
 * error -- the two must stay distinguishable or an outage gets recorded as
 * "this tag has no picture" and the tag is written off.
 */
async function p18File(qid: string): Promise<string | null> {
  const res = await fetch(
    `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${encodeURIComponent(qid)}` +
      `&property=P18&format=json`,
    { headers: { 'User-Agent': WP_UA, Accept: 'application/json' } },
  )
  if (!res.ok) throw new Error(`wikidata ${res.status}`)
  const data = await res.json()
  const file = data?.claims?.P18?.[0]?.mainsnak?.datavalue?.value
  return typeof file === 'string' && file.length > 0 ? `File:${file}` : null
}

/** Register the asset, returning its id. Links only when asked. */
async function registerAsset(
  supabase: SupabaseClient,
  input: {
    url: string
    source: TagImageSource
    sourceRef: string
    license: string | null
    attribution: string | null
    alt: string
    width?: number
    height?: number
    bytes?: number
  },
  link: { tagId: string } | null,
): Promise<string | null> {
  const canonical = canonicaliseUrl(input.url)
  if (!canonical) return null
  const urlHash = await sha256Hex(canonical)

  const row: Record<string, unknown> = {
    url_hash: urlHash,
    url: canonical,
    source: input.source,
    source_ref: input.sourceRef,
    license: input.license,
    attribution: input.attribution,
    alt_text: input.alt,
    alt_provenance: 'imported',
    last_seen_at: new Date().toISOString(),
  }
  if (input.width) row.width = input.width
  if (input.height) row.height = input.height
  if (input.bytes) row.bytes = input.bytes

  const { data, error } = await supabase
    .from('image_assets')
    .upsert(row, { onConflict: 'url_hash' })
    .select('id')
    .single()
  if (error || !data) {
    console.warn('[tag-imagery] asset upsert failed', error?.message)
    return null
  }

  if (link) {
    // Only the publish path claims the link here. A review proposal must not:
    // `tag_cover_one_tag_uniq` would then let a candidate nobody approved hold
    // the picture against every other tag indefinitely. The apply arm in
    // 99991791617122 claims it at approval instead.
    const { error: linkErr } = await supabase
      .from('image_asset_links')
      .insert({ asset_id: data.id, entity_type: 'tag', entity_id: link.tagId, role: 'cover' })
    if (linkErr) {
      console.warn('[tag-imagery] link insert failed', linkErr.message)
      return null
    }
  }
  return data.id as string
}

/**
 * Fetch the bytes and mirror them to R2.
 *
 * Mirroring rather than hotlinking, for two reasons that are not about speed:
 * Commons asks callers not to hotlink at volume, and `img.queer.guide` keys are
 * content-addressed (`<sha256>.<ext>`), so two tags that find the same picture
 * collapse to ONE object -- which is the storage-layer half of the
 * no-duplicates rule, underneath the unique index.
 */
async function mirror(url: string): Promise<{ url: string; bytes: number } | null> {
  const res = await fetch(url, { headers: { 'User-Agent': WP_UA } })
  if (!res.ok) return null
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (!ALLOWED_TYPES.has(type)) return null
  const buf = new Uint8Array(await res.arrayBuffer())
  if (buf.byteLength < 1000 || buf.byteLength > MAX_BYTES) return null
  const mirrored = await mirrorImageToR2(buf, type, 'tag-images')
  return mirrored ? { url: mirrored, bytes: buf.byteLength } : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  const supabase = getServiceClient()
  const gate = await requireInternalOrAdmin(req, supabase)
  if (gate instanceof Response) return gate

  const body = await req.json().catch(() => ({}))
  const batchSize = Math.min(Math.max(Number(body.batch_size ?? 20), 1), 100)
  const dryRun = body.dry_run === true
  const requestedTier: Tier = TIERS.includes(body.tier) ? body.tier : 'p18'
  const onlySlug: string | null = typeof body.slug === 'string' ? body.slug : null

  if (!dryRun && !logoMirrorConfigured()) {
    return errorResponse(
      'IMAGE_CDN_BASE_URL / IMAGE_CDN_ADMIN_SECRET is not configured — cannot mirror to R2. '
        + 'Set it (to the image-cdn Worker ADMIN_SECRET) or pass dry_run:true.',
      500,
      req,
    )
  }

  // ── Work list ─────────────────────────────────────────────────────────────
  // Indexable, active, no image yet, highest usage first -- the pages a reader
  // actually meets. A tag whose enrichment_status records a terminal
  // `data_unavailable` is excluded so an unresolvable entry leaves the pool
  // instead of being re-probed nightly forever.
  let q = supabase
    .from('unified_tags')
    .select('id, slug, name, category, is_adult, is_sensitive, wikidata_id, enrichment_status')
    .eq('status', 'active')
    .eq('seo_indexable', true)
    .is('image_url', null)
    .order('usage_count', { ascending: false, nullsFirst: false })
    .limit(batchSize)
  if (onlySlug) q = q.eq('slug', onlySlug)
  if (requestedTier === 'p18') q = q.not('wikidata_id', 'is', null)

  const { data: rows, error: rowsErr } = await q
  if (rowsErr) {
    return errorResponse(rowsErr.message, 500, req)
  }

  const candidates = (rows ?? []) as TagRow[]
  const eligible = candidates.filter(
    (t) =>
      (t.enrichment_status as Record<string, { state?: string }> | null)?.tag_image?.state !==
      'data_unavailable',
  )

  // Disowned Wikidata identifiers, read once. A QID in here has already been
  // established to point at the wrong entity, so its P18 is not evidence.
  const disowned = new Set<string>()
  if (requestedTier === 'p18' && eligible.length > 0) {
    const { data: audit } = await supabase
      .from('tag_wikidata_repair_audit')
      .select('tag_id')
      .in(
        'tag_id',
        eligible.map((t) => t.id),
      )
    for (const a of audit ?? []) disowned.add((a as { tag_id: string }).tag_id)
  }

  // Approved aliases, for tier-2 corroboration. Unapproved aliases are not
  // trusted for auto-tagging on this platform, so they are not trusted here.
  const aliasesByTag = new Map<string, string[]>()
  if (requestedTier !== 'p18' && eligible.length > 0) {
    const { data: aliases } = await supabase
      .from('tag_aliases')
      .select('canonical_tag_id, alias')
      .eq('review_status', 'approved')
      .in(
        'canonical_tag_id',
        eligible.map((t) => t.id),
      )
    for (const a of aliases ?? []) {
      const row = a as { canonical_tag_id: string; alias: string }
      const list = aliasesByTag.get(row.canonical_tag_id) ?? []
      list.push(row.alias)
      aliasesByTag.set(row.canonical_tag_id, list)
    }
  }

  const results: RowResult[] = []
  let published = 0
  let queued = 0
  let refused = 0
  let errors = 0

  for (const tag of eligible) {
    try {
      let candidate: TagImageCandidate | null = null

      if (requestedTier === 'p18') {
        if (!tag.wikidata_id) {
          results.push({ slug: tag.slug, tier: 'p18', decision: 'skipped', why: 'no_qid' })
          continue
        }
        if (disowned.has(tag.id)) {
          results.push({ slug: tag.slug, tier: 'p18', decision: 'skipped', why: 'qid_disowned' })
          continue
        }
        const file = await p18File(tag.wikidata_id)
        if (!file) {
          results.push({ slug: tag.slug, tier: 'p18', decision: 'refused', why: 'no_p18' })
          refused++
          await bumpMiss(supabase, tag, 'no_p18', dryRun)
          continue
        }
        const info = await commonsFileInfo(file)
        if (!info) {
          results.push({ slug: tag.slug, tier: 'p18', decision: 'error', why: 'commons_unreadable' })
          errors++
          continue
        }
        candidate = {
          url: info.url,
          source: 'wikidata:p18',
          sourceRef: file,
          text: info.description,
          license: info.license,
          attribution: info.attribution,
          width: info.width,
          height: info.height,
        }
      } else if (requestedTier === 'commons') {
        const hits = await fetchFromWikimedia(tag.name, 600, 400)
        const first = hits[0]
        if (!first) {
          results.push({ slug: tag.slug, tier: 'commons', decision: 'refused', why: 'no_hits' })
          refused++
          await bumpMiss(supabase, tag, 'no_hits', dryRun)
          continue
        }
        candidate = {
          url: first.url,
          source: 'wikimedia',
          sourceRef: first.source_id || first.alt,
          text: `${first.alt} ${first.source_id}`,
          license: first.license ?? null,
          attribution: first.photographer || null,
          width: first.width,
          height: first.height,
        }
      } else {
        const pexelsKey = Deno.env.get('PEXELS_API_KEY')
        const unsplashKey = Deno.env.get('UNSPLASH_ACCESS_KEY')
        const hits = [
          ...(pexelsKey ? await fetchFromPexels(pexelsKey, tag.name, 3) : []),
          ...(unsplashKey ? await fetchFromUnsplash(unsplashKey, tag.name, 3) : []),
        ]
        const first = hits[0]
        if (!first) {
          results.push({ slug: tag.slug, tier: 'stock', decision: 'refused', why: 'no_hits' })
          refused++
          continue
        }
        candidate = {
          url: first.url,
          source: first.source === 'unsplash' ? 'unsplash' : 'pexels',
          sourceRef: `${first.source}:${first.source_id}`,
          text: first.alt,
          license: first.license ?? (first.source === 'unsplash' ? 'Unsplash License' : 'Pexels License'),
          attribution: first.photographer || null,
          width: first.width,
          height: first.height,
        }
      }

      const verdict = tagImageVerdict(tag, candidate, aliasesByTag.get(tag.id) ?? [])

      if (verdict.decision === 'refuse') {
        results.push({
          slug: tag.slug,
          tier: requestedTier,
          decision: 'refused',
          why: verdict.why,
          url: candidate.url,
        })
        refused++
        await bumpMiss(supabase, tag, verdict.why, dryRun)
        continue
      }

      if (dryRun) {
        results.push({
          slug: tag.slug,
          tier: requestedTier,
          decision: verdict.decision === 'publish' ? 'published' : 'queued',
          why: `dry_run:${verdict.decision === 'publish' ? 'would_publish' : verdict.why}`,
          url: candidate.url,
        })
        if (verdict.decision === 'publish') published++
        else queued++
        continue
      }

      const mirrored = await mirror(candidate.url)
      if (!mirrored) {
        // Deliberately NOT a miss. A mirror failure is about transport, not
        // about whether the tag has a picture, and stamping it would write the
        // tag off for a reason that has nothing to do with it -- the mistake
        // that stamped 6,498 venues `logo_fetched_at` while the token was dead.
        results.push({
          slug: tag.slug,
          tier: requestedTier,
          decision: 'error',
          why: 'mirror_failed',
          url: candidate.url,
        })
        errors++
        continue
      }

      const alt = candidate.text.slice(0, 300) || `${tag.name}.`
      const assetId = await registerAsset(
        supabase,
        {
          url: mirrored.url,
          source: candidate.source,
          sourceRef: candidate.sourceRef,
          license: candidate.license,
          attribution: candidate.attribution,
          alt,
          width: candidate.width,
          height: candidate.height,
          bytes: mirrored.bytes,
        },
        verdict.decision === 'publish' ? { tagId: tag.id } : null,
      )
      if (!assetId) {
        results.push({
          slug: tag.slug,
          tier: requestedTier,
          decision: 'error',
          why: 'asset_register_failed',
          url: mirrored.url,
        })
        errors++
        continue
      }

      if (verdict.decision === 'publish') {
        const { error: upErr } = await supabase
          .from('unified_tags')
          .update({
            image_url: mirrored.url,
            image_alt: alt,
            image_source: candidate.source,
            image_license: candidate.license,
            image_attribution: candidate.attribution,
            image_explicit: verdict.explicit,
          })
          .eq('id', tag.id)
        if (upErr) {
          // A check_violation here is the contract refusing something the guard
          // let through, which is a BUG in the guard and must be loud.
          results.push({
            slug: tag.slug,
            tier: requestedTier,
            decision: 'error',
            why: `publish_rejected:${upErr.message.slice(0, 120)}`,
            url: mirrored.url,
          })
          errors++
          continue
        }
        results.push({
          slug: tag.slug,
          tier: requestedTier,
          decision: 'published',
          why: 'auto',
          url: mirrored.url,
        })
        published++
      } else {
        const { error: qErr } = await supabase.from('entity_review_queue').insert({
          entity_type: 'tag',
          entity_id: tag.id,
          field: 'image_url',
          proposed_value: {
            url: mirrored.url,
            alt,
            source: candidate.source,
            license: candidate.license,
            attribution: candidate.attribution,
            explicit: verdict.explicit,
            asset_id: assetId,
            upstream: candidate.url,
            source_ref: candidate.sourceRef,
          },
          confidence: verdict.decision === 'review' ? 0.6 : 0.9,
          model: `tag-imagery:${requestedTier}`,
          status: 'open',
        })
        if (qErr) {
          // 23505 against uq_erq_open means a proposal is already open for this
          // tag -- a skip, not a failure. The database enforcing the invariant
          // the pre-check could not see.
          const skip = qErr.message.includes('duplicate key')
          results.push({
            slug: tag.slug,
            tier: requestedTier,
            decision: skip ? 'skipped' : 'error',
            why: skip ? 'already_queued' : `queue_failed:${qErr.message.slice(0, 120)}`,
            url: mirrored.url,
          })
          if (!skip) errors++
          continue
        }
        results.push({
          slug: tag.slug,
          tier: requestedTier,
          decision: 'queued',
          why: verdict.why,
          url: mirrored.url,
        })
        queued++
      }
    } catch (err) {
      results.push({
        slug: tag.slug,
        tier: requestedTier,
        decision: 'error',
        why: String(err).slice(0, 160),
      })
      errors++
    }
  }

  return jsonResponse({
      // The tier is reported because an engine that works a different list than
      // the one it was asked for is indistinguishable from a healthy one.
      tier: requestedTier,
      dry_run: dryRun,
      considered: candidates.length,
      eligible: eligible.length,
      published,
      queued,
      refused,
      errors,
    results,
  }, 200, req)
})

/**
 * Record a decision ABOUT THE TAG, and only that.
 *
 * Three strikes stamp a terminal `data_unavailable` so the selector stops
 * offering the row. Transport failures never reach here: counting an outage as
 * evidence about the entity is how 6,498 venues were stamped `logo_fetched_at`
 * while the logo.dev token was dead and written off permanently.
 */
async function bumpMiss(
  supabase: SupabaseClient,
  tag: TagRow,
  why: string,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) return
  const status = (tag.enrichment_status ?? {}) as Record<string, unknown>
  const prev = (status.tag_image ?? {}) as { attempts?: number }
  const attempts = Number(prev.attempts ?? 0) + 1
  await supabase
    .from('unified_tags')
    .update({
      enrichment_status: {
        ...status,
        tag_image: {
          attempts,
          last_why: why,
          last_at: new Date().toISOString(),
          state: attempts >= 3 ? 'data_unavailable' : 'searching',
        },
      },
    })
    .eq('id', tag.id)
}
