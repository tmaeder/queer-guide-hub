import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import {
  getServiceClient,
  jsonResponse,
  errorResponse,
  corsResponse,
  requireInternalOrAdmin,
} from '../_shared/supabase-client.ts'
import { hasValidWebhookSecret } from '../_shared/webhook-auth.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import {
  scoreImage,
  scoreQueerPlaceImage,
  QUEER_PLACE_MIN,
} from '../_shared/scoreImage.ts'
import { upsertImageAsset, deriveImageFormat } from '../_shared/image-assets.ts'
import {
  type ImageResult,
  WP_UA,
  fetchFromPexels,
  fetchFromUnsplash,
  fetchFromWikimedia,
  storeImageToStorage,
} from '../_shared/image-search.ts'

// Queer-first re-imaging pass for cities + countries (+ gap-fill for events,
// + archival Commons photos for history milestones — Wikimedia-only, scored by
// title/place/year overlap, persecution content excluded by the selector).
//
// Unlike fetch-images (which fills generic skyline/landmark stock), this only
// accepts an image whose alt text proves BOTH a queer signal AND a place name
// (scoreQueerPlaceImage's dual gate). A hit overwrites the entity's image; a
// miss leaves the existing image untouched — we never null an image. Every
// processed entity (hit or miss) writes an enrichment_log row, which is the
// resumable cursor: the selector RPC excludes anything already logged, so hits
// and misses both advance without any stamp-write to the entity table (avoids
// storming trg_search_documents_* on the disk-constrained DB).
//
// Auth: X-Webhook-Secret (cron) or admin/service-role, mirroring the other
// *-quality functions so pg_cron can drive it with the Vault secret.

const STEP = 'queer_image_backfill'
const PACE_MS = 1200

type EntityType = 'city' | 'country' | 'event' | 'milestone'
const VALID: EntityType[] = ['city', 'country', 'event', 'milestone']

interface DueRow {
  id: string
  name: string
  country_name: string | null
  capital: string | null
  current_image_url: string | null
  /** Milestones: event-specific Wikipedia source article — grounded lead-image lookup. */
  wiki_url: string | null
}

/** Build place-connected queer queries per entity type. */
function buildQueries(t: EntityType, row: DueRow): string[] {
  const name = row.name?.trim() ?? ''
  const country = row.country_name?.trim() ?? ''
  const capital = row.capital?.trim() ?? ''
  if (t === 'country') {
    return [
      capital ? `${capital} ${name} pride parade rainbow` : `${name} pride parade rainbow`,
      `${name} LGBTQ pride march rainbow`,
      `${name} gay pride`,
    ].filter(Boolean)
  }
  if (t === 'event') {
    // capital carries event_type, country_name carries city for events.
    const type = capital || 'pride'
    return [
      `${type} LGBT pride event ${country}`.trim(),
      `${name} ${country}`.trim(),
    ].filter(Boolean)
  }
  if (t === 'milestone') {
    // capital carries the year, country_name the most-specific place label.
    // Archival Commons search: title verbatim first, then place/year-anchored.
    const year = capital
    return [
      name,
      country ? `${name} ${country}` : '',
      year ? `${stripTitleDecoration(name)} ${country} ${year}`.trim() : '',
    ].filter(Boolean)
  }
  // city
  return [
    country ? `${name} ${country} pride parade rainbow` : `${name} pride parade rainbow`,
    `${name} CSD gay pride`,
    `${name} gay village LGBTQ`,
  ].filter(Boolean)
}

const TITLE_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'over', 'first', 'world',
  'worlds', "world's", 'act', 'law', 'legal', 'between', 'across',
])

/** Significant title tokens (>3 chars, not stopwords, punctuation stripped). */
function significantTokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !TITLE_STOPWORDS.has(w))
}

/** Trailing "— Place" / "(Place)" decoration stripped for looser queries. */
function stripTitleDecoration(title: string): string {
  return title.replace(/\s*[—-]\s*[^—-]+$/, '').replace(/\s*\([^)]*\)\s*$/, '').trim()
}

/**
 * Commons Artist values are HTML. Strip tags to a fixpoint (single-pass regex
 * removal is bypassable — "<scr<script>ipt>"), then drop stray angle brackets.
 */
function stripHtml(value: string | undefined): string {
  let s = value ?? ''
  let prev: string
  do {
    prev = s
    s = s.replace(/<[^>]*>/g, '')
  } while (s !== prev)
  return s.replace(/[<>]/g, '').trim()
}

/** Non-photographic lead images (legal-status maps, flags, seals, coins) never display. */
const WIKI_IMAGE_REJECT = /\.svg|\.gif|\bmap\b|_map|locator|flag_of|coat_of_arms|logo|seal_of|\bcoin\b|banknote/i

/**
 * Grounded lookup: the lead image of the milestone's OWN Wikipedia source
 * article (e.g. "Stonewall riots" → the Stonewall Inn photograph). Far more
 * accurate than Commons keyword search, whose results are SVG maps and terse
 * filenames. Returns null when the article has no photographic lead image —
 * the typographic card is the intended fallback. Attribution is read from the
 * Commons file's extmetadata so CC BY-SA credit can render on the detail page.
 */
async function wikiLeadImage(wikiUrl: string): Promise<ImageResult | null> {
  const m = wikiUrl.match(/^https?:\/\/([a-z-]+)\.(?:m\.)?wikipedia\.org\/wiki\/([^?#]+)/i)
  if (!m) return null
  const [, lang, title] = m
  // Wikimedia APIs reject UA-less requests — always send the project UA.
  const summaryRes = await fetch(
    `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${title}`,
    { headers: { 'User-Agent': WP_UA, Accept: 'application/json' } },
  )
  if (!summaryRes.ok) return null
  const summary = await summaryRes.json()
  const img = summary.originalimage ?? summary.thumbnail
  if (!img?.source || WIKI_IMAGE_REJECT.test(img.source)) return null
  if ((img.width ?? 0) < 400) return null

  // Commons extmetadata for artist/license (best-effort — image still usable without).
  let photographer: string | null = null
  let license: string | null = null
  const fileMatch = img.source.match(/\/([^/]+\.(?:jpe?g|png|webp))(?:\/|$)/i)
  const fileName = fileMatch ? decodeURIComponent(fileMatch[1]) : null
  if (fileName) {
    try {
      const metaRes = await fetch(
        `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(fileName)}&prop=imageinfo&iiprop=extmetadata&format=json`,
        { headers: { 'User-Agent': WP_UA, Accept: 'application/json' } },
      )
      if (metaRes.ok) {
        const meta = await metaRes.json()
        const pages = meta?.query?.pages ?? {}
        const info = (Object.values(pages)[0] as { imageinfo?: Array<{ extmetadata?: Record<string, { value?: string }> }> })
          ?.imageinfo?.[0]?.extmetadata
        photographer = stripHtml(info?.Artist?.value) || null
        license = info?.LicenseShortName?.value || null
      }
    } catch { /* attribution is best-effort */ }
  }

  return {
    url: img.source,
    thumbnail: summary.thumbnail?.source ?? img.source,
    alt: summary.title ?? '',
    photographer: photographer ?? '',
    photographer_url: '',
    source: 'wikipedia',
    source_id: fileName ?? title,
    license: license ?? undefined,
    width: img.width,
    height: img.height,
    score: 100,
  }
}

/**
 * Historical-event scorer: generic quality/reject scoring plus a required
 * overlap between the milestone title and the image's description — a photo
 * that names neither the event nor its place/year is never accepted, no matter
 * how pretty. Wikimedia (archival) preferred over stock.
 */
function scoreMilestoneImage(img: ImageResult, row: DueRow): number {
  const base = scoreImage({
    alt: img.alt,
    width: img.width,
    height: img.height,
    source: img.source,
    subject: { name: row.name, country: row.country_name ?? undefined },
    subjectType: 'event',
  })
  if (!Number.isFinite(base)) return base
  const alt = (img.alt || '').toLowerCase()
  const matches = significantTokens(row.name).filter((t) => alt.includes(t)).length
  const placeHit = row.country_name ? alt.includes(row.country_name.toLowerCase()) : false
  const yearHit = row.capital ? alt.includes(row.capital) : false
  if (matches < 2 && !(matches >= 1 && (placeHit || yearHit))) return Number.NEGATIVE_INFINITY
  return base + matches * 10 + (yearHit ? 10 : 0) + (img.source === 'wikimedia' ? 15 : 0)
}

/** Highest finite-scoring candidate that clears the queer-place bar, or null. */
function pickBestQueer(candidates: ImageResult[]): ImageResult | null {
  let best: ImageResult | null = null
  for (const c of candidates) {
    if (!Number.isFinite(c.score)) continue
    if (!best || c.score > best.score) best = c
  }
  return best && best.score >= QUEER_PLACE_MIN ? best : null
}

async function findQueerImage(
  t: EntityType,
  row: DueRow,
  pK?: string,
  uK?: string,
): Promise<ImageResult | null> {
  // Milestones: grounded article lead image first; keyword search is fallback.
  if (t === 'milestone' && row.wiki_url) {
    try {
      const lead = await wikiLeadImage(row.wiki_url)
      if (lead) return lead
    } catch { /* fall through to keyword search */ }
  }

  const scoreOf = (img: ImageResult) =>
    t === 'milestone'
      ? scoreMilestoneImage(img, row)
      : scoreQueerPlaceImage({
          alt: img.alt,
          width: img.width,
          height: img.height,
          source: img.source,
          name: row.name,
          country: row.country_name ?? undefined,
          capital: t === 'event' ? undefined : row.capital ?? undefined,
        })

  for (const query of buildQueries(t, row)) {
    const fetches: Promise<ImageResult[]>[] = [fetchFromWikimedia(query)]
    // Milestones are historical events: archival Commons only — stock-photo
    // libraries have nothing genuine to offer and mislead the scorer.
    if (t !== 'milestone' && pK) fetches.push(fetchFromPexels(pK, query))
    if (t !== 'milestone' && uK) fetches.push(fetchFromUnsplash(uK, query))
    const results = (await Promise.all(fetches)).flat()
    if (!results.length) continue
    for (const img of results) img.score = scoreOf(img)
    const best = pickBestQueer(results)
    if (best) return best
  }
  return null
}

async function logProcessed(
  supabase: SupabaseClient,
  t: EntityType,
  id: string,
  outcome: 'done' | 'skipped',
  ms: number,
) {
  await supabase.from('enrichment_log').insert({
    entity_type: t,
    entity_id: id,
    step: STEP,
    status: outcome,
    duration_ms: ms,
  })
}

async function applyHit(
  supabase: SupabaseClient,
  t: EntityType,
  row: DueRow,
  best: ImageResult,
) {
  const prefix =
    t === 'country' ? 'country-images'
    : t === 'event' ? 'event-images'
    : t === 'milestone' ? 'milestone-images'
    : 'city-images'
  const storedUrl = await storeImageToStorage(supabase, best.url, prefix, `${t}s`, row.id)

  if (t === 'event') {
    await supabase.from('events').update({ images: [storedUrl], updated_at: new Date().toISOString() }).eq('id', row.id)
  } else if (t === 'milestone') {
    const { data: cur } = await supabase.from('milestones').select('image_metadata').eq('id', row.id).single()
    const prevMeta = (cur?.image_metadata && typeof cur.image_metadata === 'object') ? cur.image_metadata as Record<string, unknown> : {}
    await supabase.from('milestones').update({
      image_url: storedUrl,
      image_metadata: {
        ...prevMeta,
        thumbnail: best.thumbnail,
        alt: best.alt,
        photographer: best.photographer,
        photographer_url: best.photographer_url,
        source: best.source,
        source_id: best.source_id,
        license: best.license,
        score: best.score,
        previous_image_url: row.current_image_url ?? null,
        stored_locally: storedUrl !== best.url,
        updated_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    }).eq('id', row.id)
  } else {
    const table = t === 'country' ? 'countries' : 'cities'
    // Read the row's current metadata so we merge rather than clobber it, and
    // record previous_image_url for reversible rollback.
    const { data: cur } = await supabase.from(table).select('image_metadata').eq('id', row.id).single()
    const prevMeta = (cur?.image_metadata && typeof cur.image_metadata === 'object') ? cur.image_metadata as Record<string, unknown> : {}
    const metadata = {
      ...prevMeta,
      thumbnail: best.thumbnail,
      alt: best.alt,
      photographer: best.photographer,
      photographer_url: best.photographer_url,
      source: best.source,
      source_id: best.source_id,
      license: best.license,
      score: best.score,
      has_queer_content: true,
      queer_backfill: true,
      previous_image_url: row.current_image_url ?? null,
      stored_locally: storedUrl !== best.url,
      updated_at: new Date().toISOString(),
    }
    await supabase.from(table).update({
      image_url: storedUrl,
      image_metadata: metadata,
      image_flagged: false,
      updated_at: new Date().toISOString(),
    }).eq('id', row.id)
  }

  await upsertImageAsset(supabase, {
    url: storedUrl,
    source: 'scraper',
    source_ref: `${best.source}:${best.source_id}`,
    license: best.license ?? null,
    attribution: best.photographer ?? null,
    alt_text: best.alt ?? null,
    alt_provenance: 'imported',
    width: best.width ?? null,
    height: best.height ?? null,
    format: deriveImageFormat(storedUrl) ?? deriveImageFormat(best.url),
    entity_type: t === 'event' ? 'event' : t,
    entity_id: row.id,
    role: 'cover',
  })
  return storedUrl
}

Deno.serve(withErrorReporting('queer-imagery-backfill', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  const supabase = getServiceClient()
  if (!hasValidWebhookSecret(req, 'IMAGE_QUALITY_WEBHOOK_SECRET')) {
    const auth = await requireInternalOrAdmin(req, supabase)
    if (auth instanceof Response) return auth
  }

  try {
    const body = await req.json().catch(() => ({}))
    const entityType = (body.entity_type ?? body.entityType) as EntityType
    if (!VALID.includes(entityType)) {
      return errorResponse(`entity_type required, one of: ${VALID.join(', ')}`, 400, req)
    }
    const batchLimit = Math.max(1, Math.min(100, body.batch_size ?? body.batch_limit ?? 40))
    const dryRun = body.dry_run === true

    const pK = Deno.env.get('PEXELS_API_KEY') || undefined
    const uK = Deno.env.get('UNSPLASH_ACCESS_KEY') || undefined

    const { data: rows, error } = await supabase.rpc('entities_due_for_queer_image', {
      p_entity_type: entityType,
      p_limit: batchLimit,
    })
    if (error) return errorResponse(`select: ${error.message}`, 500, req)
    const due = (rows ?? []) as DueRow[]
    if (due.length === 0) {
      return jsonResponse({ success: true, processed: 0, message: 'nothing due' }, 200, req)
    }

    let hits = 0, misses = 0
    for (const row of due) {
      const started = Date.now()
      try {
        const best = await findQueerImage(entityType, row, pK, uK)
        if (best && !dryRun) {
          await applyHit(supabase, entityType, row, best)
        }
        if (best) hits++; else misses++
        if (!dryRun) await logProcessed(supabase, entityType, row.id, best ? 'done' : 'skipped', Date.now() - started)
      } catch (e) {
        misses++
        console.error(`queer-image ${entityType} ${row.name}:`, (e as Error).message)
        if (!dryRun) await logProcessed(supabase, entityType, row.id, 'skipped', Date.now() - started)
      }
      await new Promise((r) => setTimeout(r, PACE_MS))
    }

    return jsonResponse({
      success: true,
      entity_type: entityType,
      processed: due.length,
      hits,
      misses,
      dry_run: dryRun,
    }, 200, req)
  } catch (error) {
    console.error('queer-imagery-backfill:', error)
    return errorResponse((error as Error).message, 500, req)
  }
}))
