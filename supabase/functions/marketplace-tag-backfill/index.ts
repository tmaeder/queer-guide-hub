// marketplace-tag-backfill — per-product re-categorisation + attribute mining (P1b).
// Evidence ladder, run per product in trust order (design §2, revised 2026-06-10):
//   tier 1  merchant truth (free)  classifyMerchantType() over the merchant's own
//                                  product_type/category label from
//                                  marketplace_listing_sources.raw. Auto-applies (0.95),
//                                  including content-rating DOWNGRADES (ground truth +
//                                  the German+English keyword backstop in the rating fn).
//   tier 2  text extract (free)    classifyDepartment() over title/desc where tier 1 has
//                                  no signal — but a rating DOWNGRADE is review-gated.
//                                  Attribute mining (material/occasion/vibe) + per-item
//                                  relevance re-score run for every product.
//   tier 3  llm (gated)            extractMarketplaceTagsFromText, circuit-broken,
//                                  daily-capped, vocab-constrained. Attributes auto-apply
//                                  >=0.8; department DOWNGRADES always review-gated.
//
// Writing `subcategory` recomputes the generated subcategory_slug + content_rating +
// department columns. One UPDATE per product fires the search trigger — the batch cap
// (default 150) protects the disk-constrained search sync.
//
// Auth: X-Webhook-Secret (cron) or admin/service-role. Idempotent.
// Body: { sources?: ('extract'|'llm')[], batch_limit?, daily_cap?, dry_run?, listing_ids? }

import { getCorsHeaders, getServiceClient, requireInternalOrAdmin, jsonResponse } from '../_shared/supabase-client.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import {
  classifyMerchantType,
  loadAttributeVocabulary,
  normalizeMarketplaceProduct,
  contentTierRank,
  attributeSlug,
  type AttributeKind,
} from '../_shared/marketplace-normalize.ts'
import { extractMarketplaceTagsFromText } from '../_shared/ai-enrichment.ts'

const STEP = 'marketplace-tag-backfill'
const AUTO_APPLY_CONFIDENCE = 0.8
const TIER2_APPLY_CONFIDENCE = 0.7

const DEPARTMENT_SLUGS = [
  'sex_toys', 'anal_toys', 'cock_rings_and_stretchers', 'pumps_and_enlargement', 'chastity',
  'bdsm_and_bondage', 'pup_and_pet_play', 'fetish_wear', 'underwear_and_swimwear', 'swimwear',
  'hygiene_and_care', 'jewelry_and_pins', 'books_and_art', 'apparel_and_accessories',
]
// display strings for slugs the LLM proposes (subset of normalizer DEPARTMENTS)
const DISPLAY: Record<string, string> = {
  sex_toys: 'Sex Toys', anal_toys: 'Anal Toys', cock_rings_and_stretchers: 'Cock Rings and Stretchers',
  pumps_and_enlargement: 'Pumps and Enlargement', chastity: 'Chastity', bdsm_and_bondage: 'BDSM and Bondage',
  pup_and_pet_play: 'Pup and Pet Play', fetish_wear: 'Fetish Wear', underwear_and_swimwear: 'Underwear and Swimwear',
  swimwear: 'Swimwear', hygiene_and_care: 'Hygiene and Care', jewelry_and_pins: 'Jewelry and Pins',
  books_and_art: 'Books and Art', apparel_and_accessories: 'Apparel and Accessories',
}

interface ListingRow {
  id: string
  title: string
  description: string | null
  brand: string | null
  subcategory: string | null
  subcategory_slug: string | null
  content_rating: string | null
  community_owned_tags: string[] | null
  lgbti_relevance_score: number | null
  has_attributes: boolean
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })

  const supabase = getServiceClient()
  const secret = Deno.env.get('MARKETPLACE_TAG_WEBHOOK_SECRET')
  const provided = req.headers.get('X-Webhook-Secret')
  if (!(secret && provided && provided === secret)) {
    const auth = await requireInternalOrAdmin(req, supabase)
    if (auth instanceof Response) return auth
  }

  const body = await req.json().catch(() => ({}))
  const sources: string[] = Array.isArray(body.sources) && body.sources.length ? body.sources : ['extract']
  const wantLlm = sources.includes('llm')
  const batchLimit: number = body.batch_limit ?? (wantLlm ? 40 : 150)
  const dailyCap: number = body.daily_cap ?? (wantLlm ? 80 : 600)
  const dryRun: boolean = body.dry_run ?? false
  const listingIds: string[] | undefined = body.listing_ids

  // Daily cap (skipped for explicit listing_ids).
  const since = new Date(); since.setUTCHours(0, 0, 0, 0)
  const { count: doneToday } = await supabase
    .from('enrichment_log').select('id', { count: 'exact', head: true })
    .eq('step', STEP).eq('status', 'done').gte('created_at', since.toISOString())
  if (!listingIds?.length && (doneToday ?? 0) >= dailyCap) {
    return jsonResponse({ processed: 0, capped: true, done_today: doneToday, daily_cap: dailyCap }, 200, req)
  }
  const remaining = listingIds?.length ? batchLimit : Math.min(batchLimit, dailyCap - (doneToday ?? 0))

  // Work-list.
  let listings: ListingRow[]
  if (listingIds?.length) {
    const { data, error } = await supabase
      .from('marketplace_listings')
      .select('id, title, description, brand, subcategory, subcategory_slug, content_rating, community_owned_tags, lgbti_relevance_score')
      .in('id', listingIds)
    if (error) return jsonResponse({ error: error.message, success: false }, 500, req)
    listings = (data ?? []).map((r) => ({ ...r, has_attributes: false })) as ListingRow[]
  } else {
    const { data, error } = await supabase.rpc('marketplace_due_for_tagging', { p_limit: remaining })
    if (error) return jsonResponse({ error: error.message, success: false }, 500, req)
    listings = (data ?? []) as ListingRow[]
  }
  if (!listings.length) return jsonResponse({ processed: 0, message: 'no listings due' }, 200, req)

  // Controlled vocab (bare slugs) + namespaced tag ids for assignments.
  const vocab = await loadAttributeVocabulary(supabase, true)
  const { data: tagRows, error: tagErr } = await supabase
    .from('unified_tags').select('id, slug, category')
    .in('category', ['material', 'occasion', 'vibe']).eq('status', 'active')
  if (tagErr) return jsonResponse({ error: tagErr.message, success: false }, 500, req)
  const tagIdBySlug = new Map<string, string>((tagRows ?? []).map((t) => [t.slug, t.id]))

  // Tier-1 evidence: merchant type labels per listing (one batched query).
  const ids = listings.map((l) => l.id)
  const { data: srcRows } = await supabase
    .from('marketplace_listing_sources')
    .select('listing_id, raw')
    .in('listing_id', ids)
  // Only raw->product_type is per-product merchant truth. raw->category is source-level
  // boilerplate (misterb/forttroff: all 'fetish_gear'; supergayunderwear: all 'underwear')
  // and must NOT be trusted as tier 1 — those listings fall through to text extraction.
  const merchantTypeByListing = new Map<string, string>()
  for (const s of srcRows ?? []) {
    const raw = (s.raw ?? {}) as Record<string, unknown>
    const label = String(raw.product_type ?? '').trim()
    if (label && !merchantTypeByListing.has(s.listing_id)) merchantTypeByListing.set(s.listing_id, label)
  }

  let retyped = 0, attrsAdded = 0, gated = 0, relevanceUpdated = 0
  const results: Array<Record<string, unknown>> = []

  for (const l of listings) {
    const started = Date.now()
    let status: string
    try {
      const currentSlug = l.subcategory_slug ?? ''
      const currentRank = contentTierRank(currentSlug, l.title, l.description)

      // --- Tier 1: merchant truth ---
      const merchantLabel = merchantTypeByListing.get(l.id) ?? null
      const tier1 = classifyMerchantType(merchantLabel)

      // --- Tier 2: text extract (department fallback + attributes + relevance) ---
      const ex = normalizeMarketplaceProduct(
        { title: l.title, description: l.description, brand: l.brand, subcategory: l.subcategory, communityOwnedTags: l.community_owned_tags },
        vocab,
      )

      // Department decision.
      let nextSubcategory: string | null = null
      let deptSource = 'none'
      const gatedProposals: Array<{ value: Record<string, unknown>; cite: unknown[]; confidence: number; model: string }> = []
      const candidate = tier1 ?? (ex.departmentConfidence >= TIER2_APPLY_CONFIDENCE
        ? { slug: ex.departmentSlug, display: ex.department, confidence: ex.departmentConfidence }
        : null)
      if (candidate && candidate.slug !== currentSlug) {
        const candidateRank = contentTierRank(candidate.slug, l.title, l.description)
        if (candidateRank < currentRank) {
          // ANY rating downgrade is review-gated, even merchant-truth: a generic label
          // ("Kleid") on a fetish item (latex dress) would under-gate it to SFW —
          // wrong-SFW is the harmful direction. Upgrades/same-rank auto-apply.
          gatedProposals.push({
            value: { subcategory: candidate.display, from_rating: l.content_rating, to_rank: candidateRank, rationale: `${tier1 ? 'merchant-type' : 'text'} reclassification lowers content rating` },
            cite: [], confidence: candidate.confidence, model: tier1 ? 'merchant' : 'extract',
          })
        } else {
          nextSubcategory = candidate.display
          deptSource = tier1 ? 'merchant' : 'extract'
        }
      }

      // Attributes (always; bare slug -> namespaced unified_tags id).
      const assignments: string[] = []
      for (const kind of ['material', 'occasion', 'vibe'] as AttributeKind[]) {
        for (const bare of ex.attributes[kind]) {
          const id = tagIdBySlug.get(attributeSlug(kind, bare))
          if (id) assignments.push(id)
        }
      }

      // --- Tier 3: LLM gap-fill (only where the free tiers left it thin) ---
      let llmConfidence: number | null = null
      const thinDept = !tier1 && ex.departmentConfidence < TIER2_APPLY_CONFIDENCE
      const thinAttrs = assignments.length === 0 && (l.description ?? '').trim().length >= 80
      if (wantLlm && (thinDept || thinAttrs)) {
        let ai
        try {
          ai = await withCircuitBreaker(supabase, 'llm.marketplace-tag', () =>
            extractMarketplaceTagsFromText(supabase, {
              title: l.title, description: l.description, brand: l.brand,
              allowedDepartments: DEPARTMENT_SLUGS,
              allowedMaterial: [...vocab.material], allowedOccasion: [...vocab.occasion], allowedVibe: [...vocab.vibe],
            }))
        } catch (e) {
          if (e instanceof CircuitOpenError) {
            return jsonResponse({ processed: results.length, retyped, attrs_added: attrsAdded, gated, circuit_open: true, results }, 200, req)
          }
          throw e
        }
        if (ai) {
          llmConfidence = ai.confidence ?? 0.5
          if ((ai.confidence ?? 0) >= AUTO_APPLY_CONFIDENCE) {
            for (const kind of ['material', 'occasion', 'vibe'] as AttributeKind[]) {
              for (const bare of (ai[kind] ?? [])) {
                const id = tagIdBySlug.get(attributeSlug(kind, bare))
                if (id && !assignments.includes(id)) assignments.push(id)
              }
            }
          }
          if (thinDept && !nextSubcategory && ai.department && ai.department !== currentSlug) {
            const aiRank = contentTierRank(ai.department, l.title, l.description)
            if (aiRank < currentRank) {
              gatedProposals.push({
                value: { subcategory: DISPLAY[ai.department], from_rating: l.content_rating, to_rank: aiRank, rationale: 'llm reclassification lowers content rating' },
                cite: ai.citations ?? [], confidence: ai.confidence ?? 0.5, model: 'llm',
              })
            } else if ((ai.confidence ?? 0) >= AUTO_APPLY_CONFIDENCE) {
              nextSubcategory = DISPLAY[ai.department]
              deptSource = 'llm'
            }
          }
        }
      }

      // Per-item relevance (replaces flat per-source defaults).
      const newRelevance = ex.relevance
      const relevanceChanged = Math.abs((l.lgbti_relevance_score ?? 0) - newRelevance) >= 0.05

      if (!dryRun) {
        // tagged_at is the tag engine's own resume marker — classified_at belongs to
        // classify-relevance-backfill (it selects WHERE classified_at IS NULL).
        const update: Record<string, unknown> = { tagged_at: new Date().toISOString() }
        if (nextSubcategory) update.subcategory = nextSubcategory
        if (relevanceChanged) update.lgbti_relevance_score = newRelevance
        await supabase.from('marketplace_listings').update(update).eq('id', l.id)

        if (assignments.length) {
          const { error: aErr } = await supabase.from('unified_tag_assignments').upsert(
            assignments.map((tag_id) => ({ tag_id, entity_id: l.id, entity_type: 'marketplace_listing' })),
            { onConflict: 'tag_id,entity_id,entity_type', ignoreDuplicates: true },
          )
          if (!aErr) attrsAdded += assignments.length
        }

        // Review-gate rating downgrades (one open row per listing — replace).
        for (const g of gatedProposals) {
          await supabase.from('marketplace_review_queue').delete().eq('listing_id', l.id).eq('status', 'open')
          await supabase.from('marketplace_review_queue').insert({
            listing_id: l.id, field: 'subcategory', proposed_value: g.value,
            citations: g.cite, confidence: g.confidence, model: g.model, status: 'open',
          }).then(() => {}, () => {})
        }
      } else if (assignments.length) {
        attrsAdded += assignments.length
      }

      status = 'done'
      if (nextSubcategory) retyped++
      if (gatedProposals.length) gated++
      if (relevanceChanged) relevanceUpdated++
      results.push({
        id: l.id, title: l.title.slice(0, 60), merchant_label: merchantLabel,
        dept: nextSubcategory ?? '(kept)', dept_source: deptSource,
        attrs: assignments.length, gated: gatedProposals.length > 0, llm_confidence: llmConfidence,
      })
    } catch (e) {
      status = 'failed'
      results.push({ id: l.id, status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
    if (!dryRun) {
      await supabase.from('enrichment_log').insert({
        entity_type: 'marketplace_listing', entity_id: l.id, step: STEP, status, duration_ms: Date.now() - started,
      }).then(() => {}, () => {})
    }
  }

  return jsonResponse({
    processed: listings.length, retyped, attrs_added: attrsAdded, gated,
    relevance_updated: relevanceUpdated, dry_run: dryRun, sources, results,
  }, 200, req)
})
