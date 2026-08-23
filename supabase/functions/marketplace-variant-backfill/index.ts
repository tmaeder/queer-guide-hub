// marketplace-variant-backfill — variants + structured attributes + tag mirror.
// Free extraction only (NO LLM anywhere in this runner). Per listing:
//   1. Read every marketplace_listing_sources.raw payload.
//   2. Extract per source shape: Shopify-style (options[]/variants[]),
//      Etsy inventory (inventory.products[]), feed-style (colour/condition/
//      dimensions scalars — AWIN CSV rows).
//   3. Replace the listing's marketplace_listing_variants rows (delete+insert —
//      variants are wholly derived from raw, so replacement IS the GC).
//   4. Roll up listing attributes (variant union + feed + genre/fit mining)
//      and UPDATE marketplace_listings.attributes ONLY when changed; always
//      stamp attributes_extracted_at (the work-list resume marker) — the
//      GENERATED sizes/colors arrays recompute on that UPDATE.
//   5. Mirror attributes into unified_tag_assignments as namespaced tags
//      (color-*/size-*/genre-*/fit-*; size = alpha ladder only) and remove
//      stale assignments in those four namespaces.
//   6. Concept auto-tagging: merchant tag strings (Shopify raw.tags) matched
//      EXACTLY against active unified_tags names/slugs + APPROVED aliases —
//      never fuzzy, never from title substrings (alias-collision discipline),
//      never onto sensitive tags.
//
// Batch cap 300 (search-trigger discipline — the listings UPDATE enqueues a
// search reindex per row). Auth: X-Webhook-Secret (cron) or admin/service.
// Body: { batch_limit?, dry_run?, listing_ids? }

import { getCorsHeaders, getServiceClient, requireInternalOrAdmin, jsonResponse } from '../_shared/supabase-client.ts'
import { hasValidWebhookSecret } from '../_shared/webhook-auth.ts'
import {
  attributesEqual,
  extractEtsyVariants,
  extractFeedAttributes,
  extractFit,
  extractGenre,
  extractShopifyVariants,
  mergeAttributes,
  SIZE_LADDER,
  type ExtractedAttributes,
  type ExtractedVariant,
} from '../_shared/marketplace-attributes.ts'

const STEP = 'marketplace-variant-extract'
const MAX_BATCH = 300

interface ListingRow {
  id: string
  title: string
  description: string | null
  currency: string | null
  subcategory_group: string | null
  attributes: Record<string, unknown> | null
}

const ATTR_TAG_PREFIXES: Array<{ kind: 'size' | 'color' | 'genre' | 'fit'; prefix: string }> = [
  { kind: 'size', prefix: 'size-' },
  { kind: 'color', prefix: 'color-' },
  { kind: 'genre', prefix: 'genre-' },
  { kind: 'fit', prefix: 'fit-' },
]
const ALPHA_SIZES = new Set<string>(SIZE_LADDER)

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })

  const supabase = getServiceClient()
  if (!hasValidWebhookSecret(req, 'MARKETPLACE_TAG_WEBHOOK_SECRET')) {
    const auth = await requireInternalOrAdmin(req, supabase)
    if (auth instanceof Response) return auth
  }

  const body = await req.json().catch(() => ({}))
  const batchLimit = Math.min(Number(body.batch_limit ?? MAX_BATCH), MAX_BATCH)
  const dryRun: boolean = body.dry_run ?? false
  const listingIds: string[] | undefined = body.listing_ids

  // Work-list.
  let ids: string[]
  if (listingIds?.length) {
    ids = listingIds.slice(0, batchLimit)
  } else {
    const { data, error } = await supabase.rpc('marketplace_due_for_variant_extract', { p_limit: batchLimit })
    if (error) return jsonResponse({ error: error.message, success: false }, 500, req)
    ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id)
  }
  if (!ids.length) return jsonResponse({ processed: 0, message: 'no listings due' }, 200, req)

  const { data: listingData, error: lErr } = await supabase
    .from('marketplace_listings')
    .select('id, title, description, currency, subcategory_group, attributes')
    .in('id', ids)
  if (lErr) return jsonResponse({ error: lErr.message, success: false }, 500, req)
  const listings = (listingData ?? []) as ListingRow[]

  const { data: srcRows, error: sErr } = await supabase
    .from('marketplace_listing_sources')
    .select('listing_id, source_slug, raw')
    .in('listing_id', ids)
  if (sErr) return jsonResponse({ error: sErr.message, success: false }, 500, req)
  const sourcesByListing = new Map<string, Array<{ source_slug: string; raw: Record<string, unknown> }>>()
  for (const s of srcRows ?? []) {
    const arr = sourcesByListing.get(s.listing_id) ?? []
    arr.push({ source_slug: s.source_slug, raw: (s.raw ?? {}) as Record<string, unknown> })
    sourcesByListing.set(s.listing_id, arr)
  }

  // Attribute tag ids (namespaced) — keyed by slug PREFIX, never by the
  // trigger-derived category text (destroyed by the tag-category consolidation).
  const { data: attrTags, error: tErr } = await supabase
    .from('unified_tags')
    .select('id, slug')
    .or('slug.like.size-%,slug.like.color-%,slug.like.genre-%,slug.like.fit-%')
    .eq('status', 'active')
  if (tErr) return jsonResponse({ error: tErr.message, success: false }, 500, req)
  const attrTagIdBySlug = new Map<string, string>((attrTags ?? []).map((t) => [t.slug, t.id]))
  const attrTagIds = new Set<string>(attrTagIdBySlug.values())

  // Concept vocabulary: active, non-namespaced, non-sensitive tags by exact
  // name/slug + APPROVED aliases (tag_aliases.review_status gate).
  const conceptBy = new Map<string, string>() // lowercased term -> tag_id
  {
    // Paged: 2,821 active tags on prod vs PostgREST's 1,000-row cap.
    const cTags: Array<{ id: string; name: string; slug: string; is_sensitive: boolean | null }> = []
    for (let from = 0; ; from += 1000) {
      const { data: page } = await supabase
        .from('unified_tags')
        .select('id, name, slug, is_sensitive')
        .eq('status', 'active')
        .not('slug', 'like', 'mat-%').not('slug', 'like', 'occ-%').not('slug', 'like', 'vibe-%')
        .not('slug', 'like', 'size-%').not('slug', 'like', 'color-%').not('slug', 'like', 'genre-%')
        .not('slug', 'like', 'fit-%').not('slug', 'like', 'dept-%').not('slug', 'like', 'attr-%')
        .not('slug', 'like', 'own-%').not('slug', 'like', 'rating-%')
        .order('id')
        .range(from, from + 999)
      cTags.push(...((page ?? []) as typeof cTags))
      if (!page || page.length < 1000) break
    }
    const conceptIds = new Set<string>()
    for (const t of cTags) {
      if (t.is_sensitive) continue
      conceptIds.add(t.id)
      const name = String(t.name ?? '').trim().toLowerCase()
      const slug = String(t.slug ?? '').trim().toLowerCase()
      if (name.length >= 3) conceptBy.set(name, t.id)
      if (slug.length >= 3) conceptBy.set(slug, t.id)
    }
    const { data: aliases } = await supabase
      .from('tag_aliases')
      .select('canonical_tag_id, alias_name')
      .eq('review_status', 'approved')
      .limit(1000) // 286 approved on prod; cap matches PostgREST's max-rows anyway
    for (const a of aliases ?? []) {
      const term = String(a.alias_name ?? '').trim().toLowerCase()
      if (term.length >= 3 && conceptIds.has(a.canonical_tag_id) && !conceptBy.has(term)) {
        conceptBy.set(term, a.canonical_tag_id)
      }
    }
  }

  let variantsWritten = 0, listingsUpdated = 0, attrTagsMirrored = 0, conceptTagged = 0, failed = 0

  for (const l of listings) {
    const started = Date.now()
    let status = 'done'
    try {
      const sources = sourcesByListing.get(l.id) ?? []
      const variantRows: Array<Record<string, unknown>> = []
      const attrParts: ExtractedAttributes[] = []
      const merchantTags = new Set<string>()

      for (const s of sources) {
        const raw = s.raw
        let extracted: { variants: ExtractedVariant[]; attributes: ExtractedAttributes } | null = null
        if (Array.isArray(raw.variants)) {
          extracted = extractShopifyVariants(raw, l.currency)
        } else if (raw.inventory && typeof raw.inventory === 'object') {
          extracted = extractEtsyVariants(raw)
        } else {
          attrParts.push(extractFeedAttributes(raw))
        }
        if (extracted) {
          attrParts.push(extracted.attributes)
          for (const v of extracted.variants) {
            variantRows.push({
              listing_id: l.id,
              source_slug: s.source_slug,
              ...v,
              last_seen_at: new Date().toISOString(),
            })
          }
        }
        // Merchant tag strings for concept matching (array on public
        // products.json, comma-string on Admin REST payloads).
        const rawTags = raw.tags
        if (Array.isArray(rawTags)) rawTags.forEach((t) => merchantTags.add(String(t).trim().toLowerCase()))
        else if (typeof rawTags === 'string') rawTags.split(',').forEach((t) => merchantTags.add(t.trim().toLowerCase()))
      }

      const mined: ExtractedAttributes = {}
      const genre = extractGenre(l.title, l.description, l.subcategory_group)
      if (genre.length) mined.genre = genre
      const fit = extractFit(l.title, l.description)
      if (fit.length) mined.fit = fit
      const attributes = mergeAttributes(...attrParts, mined)

      if (!dryRun) {
        // 3. Replace variant rows (replacement IS the stale-variant GC).
        const { error: dErr } = await supabase.from('marketplace_listing_variants').delete().eq('listing_id', l.id)
        if (dErr) throw new Error(`variant delete: ${dErr.message}`)
        for (let i = 0; i < variantRows.length; i += 200) {
          const { error: iErr } = await supabase.from('marketplace_listing_variants').insert(variantRows.slice(i, i + 200))
          if (iErr) throw new Error(`variant insert: ${iErr.message}`)
        }
        variantsWritten += variantRows.length

        // 4. Listing roll-up: write only on change; always stamp the marker.
        const changed = !attributesEqual(l.attributes ?? {}, attributes)
        const update: Record<string, unknown> = { attributes_extracted_at: new Date().toISOString() }
        if (changed) update.attributes = attributes
        const { error: uErr } = await supabase.from('marketplace_listings').update(update).eq('id', l.id)
        if (uErr) throw new Error(`listing update: ${uErr.message}`)
        if (changed) listingsUpdated++

        // 5. Attribute tag mirror (alpha sizes only; all colors/genres/fits).
        const wantedSlugs = new Set<string>()
        for (const { kind, prefix } of ATTR_TAG_PREFIXES) {
          for (const bare of attributes[kind] ?? []) {
            if (kind === 'size' && !ALPHA_SIZES.has(bare)) continue
            const slug = `${prefix}${bare}`
            if (attrTagIdBySlug.has(slug)) wantedSlugs.add(slug)
          }
        }
        const wantedIds = new Set<string>([...wantedSlugs].map((s) => attrTagIdBySlug.get(s) as string))

        const { data: existing } = await supabase
          .from('unified_tag_assignments')
          .select('id, tag_id')
          .eq('entity_id', l.id).eq('entity_type', 'marketplace_listing')
        const existingAttrIds = new Set<string>()
        const staleAssignmentIds: string[] = []
        for (const a of existing ?? []) {
          if (!attrTagIds.has(a.tag_id)) continue // not one of the four namespaces
          existingAttrIds.add(a.tag_id)
          if (!wantedIds.has(a.tag_id)) staleAssignmentIds.push(a.id)
        }
        const toInsert = [...wantedIds].filter((id) => !existingAttrIds.has(id))
        if (toInsert.length) {
          const { error: aErr } = await supabase.from('unified_tag_assignments').upsert(
            toInsert.map((tag_id) => ({ tag_id, entity_id: l.id, entity_type: 'marketplace_listing' })),
            { onConflict: 'tag_id,entity_id,entity_type', ignoreDuplicates: true },
          )
          if (!aErr) attrTagsMirrored += toInsert.length
        }
        if (staleAssignmentIds.length) {
          await supabase.from('unified_tag_assignments').delete().in('id', staleAssignmentIds)
        }

        // 6. Concept tags from merchant tag strings (exact-match only, additive —
        //    merchant tags vary between syncs, so no stale-removal here).
        const conceptIdsWanted = new Set<string>()
        for (const term of merchantTags) {
          const id = conceptBy.get(term)
          if (id) conceptIdsWanted.add(id)
        }
        const conceptToInsert = [...conceptIdsWanted].filter(
          (id) => !(existing ?? []).some((a) => a.tag_id === id),
        )
        if (conceptToInsert.length) {
          const { error: cErr } = await supabase.from('unified_tag_assignments').upsert(
            conceptToInsert.map((tag_id) => ({ tag_id, entity_id: l.id, entity_type: 'marketplace_listing' })),
            { onConflict: 'tag_id,entity_id,entity_type', ignoreDuplicates: true },
          )
          if (!cErr) conceptTagged += conceptToInsert.length
        }
      } else {
        variantsWritten += variantRows.length
      }
    } catch (e) {
      status = 'failed'
      failed++
      console.error(`[${STEP}] ${l.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
    if (!dryRun) {
      await supabase.from('enrichment_log').insert({
        entity_type: 'marketplace_listing', entity_id: l.id, step: STEP, status, duration_ms: Date.now() - started,
      }).then(() => {}, () => {})
    }
  }

  return jsonResponse({
    processed: listings.length,
    variants_written: variantsWritten,
    listings_updated: listingsUpdated,
    attr_tags_mirrored: attrTagsMirrored,
    concept_tagged: conceptTagged,
    failed,
    dry_run: dryRun,
  }, 200, req)
})
