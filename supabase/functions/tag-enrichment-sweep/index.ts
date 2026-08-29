// ============================================================================
// tag-enrichment-sweep — content-quality enrichment PRODUCER for unified_tags
// ----------------------------------------------------------------------------
// Batches ACTIVE tags ordered by quality_score ASC and fills the lowest missing
// content dimensions (wiki link → description) for each, free sources first.
// Hybrid-by-confidence routing:
//
//   AUTO-APPLY (direct write):
//     - wiki links (wikidata_id/wikipedia_url) — ONLY when the resolved article and
//       the linked entity both survive `mayAdoptWikiIdentity` (see below)
//     - description sourced from Wikipedia, under the same verdict, for
//       NON-sensitive/adult tags
//
// THE WIKI LOOKUP IS NAME-BASED AND THEREFORE UNTRUSTWORTHY BY DEFAULT. This header
// used to claim wiki links are "always source-grounded". They are grounded in a lookup
// of the RAW TAG NAME, which is a different thing: the REST summary endpoint follows
// redirects, so `Golden shower` resolves to `Cassia_fistula`, `Passing` to `Death`,
// `Amateur` to `Indianapolis` and `Anal` to `Analyst` (a journal). Measured 2026-08-29:
// 1,535 of 4,772 linked tags had adopted an entity of a class a glossary term can never
// be, and because `tag_medical_codes` / `tag_relations` are regenerated from that
// identifier weekly, a trans-passing glossary entry was publishing the ICPC-2 code for
// death. Every adoption now passes through `_shared/tag-wiki-guard.ts`; a refusal
// leaves the tag unlinked, which is the cheap and reversible outcome.
//
//   QUEUE to ai_suggestions (status='pending', entity_type='unified_tags'):
//     - pure-LLM description guesses (no Wikipedia grounding)
//     - ANY description for is_sensitive / is_adult tags
//     (suggestion_type 'description'; applied later via applySuggestion when an
//      admin approves in the /admin/tags review panel, which also flips
//      human_reviewed=true and releases the SEO sensitivity gate.)
//
// The IMAGE dimension is retired (2026-08-28): glossary photography is gone —
// tags render drawn TagPlates — so the sweep must never write image_url, and
// `image_url.is.null` must NOT be in the work-list filter (after the
// retirement migration it is null on EVERY tag, which would make the sweep
// re-select the whole corpus forever).
//
// Auth: dedicated webhook secret (parks the cron until set) OR internal-secret
// OR service-role OR admin. Mirrors the Phase 4 i18n cron parking pattern.
// ============================================================================
import { chatCompletion } from '../_shared/openai-client.ts'
import { mayAdoptWikiIdentity } from '../_shared/tag-wiki-guard.ts'
import { hasValidWebhookSecret } from '../_shared/webhook-auth.ts'
import {
  getCorsHeaders,
  getServiceClient,
  requireInternalOrAdmin,
} from '../_shared/supabase-client.ts'

const supabase = getServiceClient()

/** Provenance source label matching chatCompletion's actual backend. */
function llmSource(): 'workers-ai' | 'openai' {
  const cf = Deno.env.get('CF_ACCOUNT_ID') || Deno.env.get('CLOUDFLARE_ACCOUNT_ID')
  return cf && Deno.env.get('USE_OPENAI') !== '1' ? 'workers-ai' : 'openai'
}

interface TagRow {
  id: string
  name: string
  description: string | null
  wikidata_id: string | null
  wikipedia_url: string | null
  is_sensitive: boolean | null
  is_adult: boolean | null
}

interface WikiSummary {
  extract: string
  wikidata_id: string | null
  wikipedia_url: string | null
  /** Title Wikipedia actually served, AFTER following redirects. */
  title: string | null
}

const WIKI_UA = 'queer.guide tag-enrichment (admin@queer.guide)'

/**
 * English labels of an entity's P31 (instance-of) statements. Two batched calls: the
 * claims, then the labels of the classes they name. Failure returns [] — the caller
 * treats an unknown class as "no evidence", never as "plausible", so a Wikidata outage
 * degrades into refusing to link rather than into linking blind.
 */
async function fetchEntityClassLabels(qid: string): Promise<string[]> {
  try {
    const base = 'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json'
    const res = await fetch(`${base}&ids=${encodeURIComponent(qid)}&props=claims`, {
      headers: { 'User-Agent': WIKI_UA },
    })
    if (!res.ok) return []
    const j = await res.json()
    const entity = j?.entities?.[qid]
    if (!entity || entity.missing !== undefined) return []
    const classIds = [
      ...new Set(
        ((entity.claims?.P31 ?? []) as Array<Record<string, never>>)
          .filter((c: { rank?: string }) => c.rank !== 'deprecated')
          .map((c: { mainsnak?: { datavalue?: { value?: { id?: string } } } }) =>
            c.mainsnak?.datavalue?.value?.id
          )
          .filter((v: unknown): v is string => typeof v === 'string'),
      ),
    ]
    if (classIds.length === 0) return []
    const lr = await fetch(
      `${base}&ids=${classIds.join('|')}&props=labels&languages=en`,
      { headers: { 'User-Agent': WIKI_UA } },
    )
    if (!lr.ok) return []
    const lj = await lr.json()
    return classIds
      .map((id) => lj?.entities?.[id]?.labels?.en?.value)
      .filter((v: unknown): v is string => typeof v === 'string')
  } catch {
    return []
  }
}

/** Wikipedia REST summary — one call yields a grounded extract + wikidata QID + page URL. */
async function fetchWikipediaSummary(name: string): Promise<WikiSummary | null> {
  try {
    const title = encodeURIComponent(name.trim().replace(/\s+/g, '_'))
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`,
      { headers: { 'User-Agent': WIKI_UA } },
    )
    if (!res.ok) return null
    const j = await res.json()
    // Skip disambiguation / no-extract pages — not a usable grounded description.
    if (j.type === 'disambiguation' || !j.extract || String(j.extract).trim().length < 30) {
      return null
    }
    return {
      extract: String(j.extract).trim(),
      wikidata_id: j.wikibase_item ?? null,
      wikipedia_url: j.content_urls?.desktop?.page ?? null,
      // `titles.canonical` is the post-redirect article; `title` is its display form.
      title: j.titles?.canonical ?? j.title ?? null,
    }
  } catch {
    return null
  }
}

/** Pure-LLM glossary description fallback when no Wikipedia grounding exists. */
async function generateDescription(name: string): Promise<string | null> {
  try {
    const r = await chatCompletion(supabase, {
      callerFn: 'tag-enrichment-sweep',
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You write neutral, factual glossary definitions for an LGBTQ+ community and travel platform. No marketing language, no "discover/explore", no second person. 2-3 sentences.',
        },
        {
          role: 'user',
          content: `Define the term "${name}" as it is used in LGBTQ+ / queer community and culture. If it is a place, identity, practice, or community term, explain it plainly.`,
        },
      ],
      temperature: 0.3,
      max_tokens: 220,
    })
    // Prose responses come back as strings; ignore non-string (object) content.
    const c = r.content as unknown
    const text = typeof c === 'string' ? c.trim() : ''
    return text.length >= 30 ? text : null
  } catch {
    return null
  }
}

interface CategoryRow {
  id: string
  slug: string
  name: string
  level: number
  parent_id: string | null
  description: string | null
}

/** Compact category vocabulary prompt (subcategories grouped under parents). */
function buildCategoryPrompt(categories: CategoryRow[]): string {
  const childrenByParent = new Map<string, CategoryRow[]>()
  for (const c of categories) {
    if (c.parent_id) {
      if (!childrenByParent.has(c.parent_id)) childrenByParent.set(c.parent_id, [])
      childrenByParent.get(c.parent_id)!.push(c)
    }
  }
  const lines: string[] = []
  for (const parent of categories.filter((c) => c.level === 0 || !c.parent_id)) {
    const kids = childrenByParent.get(parent.id) ?? []
    lines.push(`\n${parent.name.toUpperCase()}:`)
    for (const c of kids.length ? kids : [parent]) {
      lines.push(`- ${c.slug}${c.description ? `: ${c.description}` : ''}`)
    }
  }
  return lines.join('\n')
}

/**
 * Categorize a batch of uncategorized tags against the fixed tag_categories
 * vocabulary. Non-sensitive tags auto-apply (category is a fixed-vocabulary
 * assignment, not public copy — matches the existing categorize-tags tool);
 * sensitive/adult tags route to the review queue as a 'category' suggestion.
 */
async function categorizePass(
  batchLimit: number,
  stats: { cat_applied: number; cat_queued: number },
): Promise<void> {
  const { data: uncat } = await supabase.rpc('tags_due_for_category', {
    p_limit: batchLimit,
    p_random: true,
  })
  if (!uncat || uncat.length === 0) return

  // The v2→v3 coexistence scope that used to filter this list is gone with
  // the old tree (20261006150000): one taxonomy again.
  const { data: cats } = await supabase
    .from('tag_categories')
    .select('id,slug,name,level,parent_id,description')
    .order('sort_order')
  if (!cats || cats.length === 0) return

  const slugToId = new Map(cats.map((c) => [c.slug, c.id]))
  const names: string[] = uncat.map((t: { name: string }) => t.name)
  const prompt =
    `Categorize each tag for an inclusive LGBTQ+ community platform into the MOST SPECIFIC applicable category slug.\n\n` +
    `Available categories (use slug values):\n${buildCategoryPrompt(cats as CategoryRow[])}\n\n` +
    `Valid slugs: ${cats.map((c) => c.slug).join(', ')}\n\n` +
    `Rules: most specific slug; consider LGBTQ+/kink nuance; identity > practice > community > general; only valid slugs.\n\n` +
    `Tags: ${names.join(', ')}\n\n` +
    `Return ONLY JSON — tag name keys, category slug values: {"example-tag":"category-slug"}`

  let mapping: Record<string, string>
  try {
    const r = await chatCompletion(supabase, {
      callerFn: 'tag-enrichment-sweep',
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Expert LGBTQ+ tag categorizer. Respond with valid JSON only, no markdown fences.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 1500,
    })
    // CF Workers AI returns `response` already parsed to an object for JSON
    // prompts; OpenAI returns a string. Handle both.
    const c = r.content as unknown
    if (c && typeof c === 'object') {
      mapping = c as Record<string, string>
    } else {
      const raw = String(c ?? '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const m = raw.match(/\{[\s\S]*\}/)
      mapping = JSON.parse(m ? m[0] : raw)
    }
  } catch (e) {
    console.error('categorizePass parse failed:', e instanceof Error ? e.message : e)
    return
  }

  // Case-insensitive name lookup (models may alter casing/whitespace of keys).
  const byNorm = new Map(
    Object.entries(mapping).map(([k, v]) => [k.trim().toLowerCase(), v]),
  )

  for (const tag of uncat as Array<{ id: string; name: string; is_sensitive: boolean | null; is_adult: boolean | null }>) {
    const slug = mapping[tag.name] ?? byNorm.get(tag.name.trim().toLowerCase())
    const categoryId = slug ? slugToId.get(slug) : undefined
    if (!categoryId) continue
    const sensitive = tag.is_sensitive === true || tag.is_adult === true

    if (sensitive) {
      const { data: existing } = await supabase
        .from('ai_suggestions')
        .select('id')
        .eq('entity_type', 'unified_tags')
        .eq('entity_id', tag.id)
        .eq('suggestion_type', 'category')
        .eq('status', 'pending')
        .maybeSingle()
      if (existing) continue
      const { error } = await supabase.from('ai_suggestions').insert({
        suggestion_type: 'category',
        entity_type: 'unified_tags',
        entity_id: tag.id,
        proposed_value: { category_id: categoryId, slug },
        source: llmSource(),
        source_model: 'gpt-4o-mini',
        confidence: 0.6,
        status: 'pending',
      })
      if (!error) stats.cat_queued++
    } else {
      const { error } = await supabase
        .from('tag_category_assignments')
        .upsert({ tag_id: tag.id, category_id: categoryId, is_primary: true }, { onConflict: 'tag_id,category_id' })
      if (!error) {
        await supabase.from('unified_tags').update({ category_id: categoryId }).eq('id', tag.id)
        stats.cat_applied++
      }
    }
  }
}

/** Insert a pending description suggestion, skipping if one already exists for this tag. */
async function queueDescription(
  tag: TagRow,
  value: string,
  source: string,
  model: string | null,
  confidence: number,
): Promise<boolean> {
  const { data: existing } = await supabase
    .from('ai_suggestions')
    .select('id')
    .eq('entity_type', 'unified_tags')
    .eq('entity_id', tag.id)
    .eq('suggestion_type', 'description')
    .eq('status', 'pending')
    .maybeSingle()
  if (existing) return false

  const { error } = await supabase.from('ai_suggestions').insert({
    suggestion_type: 'description',
    entity_type: 'unified_tags',
    entity_id: tag.id,
    proposed_value: { field: 'description', value },
    current_value: { value: tag.description ?? null },
    source,
    source_model: model,
    confidence,
    status: 'pending',
  })
  return !error
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) })
  }

  // Auth: dedicated webhook secret (parks cron until set) OR internal/admin.
  if (!hasValidWebhookSecret(req, 'TAG_ENRICHMENT_WEBHOOK_SECRET')) {
    const gate = await requireInternalOrAdmin(req, supabase)
    if (gate instanceof Response) return gate
  }

  let batchLimit = 15
  let catLimit = 0 // 0 → mirror batchLimit
  let triggeredBy = 'manual'
  try {
    const body = await req.json()
    if (typeof body?.batch_limit === 'number') {
      batchLimit = Math.min(Math.max(1, body.batch_limit), 50)
    }
    if (typeof body?.cat_limit === 'number') {
      catLimit = Math.min(Math.max(0, body.cat_limit), 50)
    }
    if (typeof body?.triggered_by === 'string') triggeredBy = body.triggered_by
  } catch {
    // no body — defaults
  }

  // Worst tags first, restricted to those missing a fillable content dimension.
  // Needs computed from live columns (not the possibly-stale quality_breakdown)
  // so reruns before the nightly recompute don't re-pick handled tags.
  const { data: tags, error } = await supabase
    .from('unified_tags')
    .select('id,name,description,wikidata_id,wikipedia_url,is_sensitive,is_adult')
    .eq('status', 'active')
    .or('description.is.null,and(wikidata_id.is.null,wikipedia_url.is.null)')
    .order('quality_score', { ascending: true, nullsFirst: true })
    .limit(batchLimit)

  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    })
  }

  const stats = {
    examined: tags?.length ?? 0,
    links_applied: 0,
    links_refused: 0,
    desc_applied: 0,
    desc_queued: 0,
    cat_applied: 0,
    cat_queued: 0,
    skipped: 0,
  }

  // Categorization pass: fills the largest gap (uncategorized tags) first.
  // Cheap (one LLM call per batch) so it can run a larger batch than content.
  await categorizePass(catLimit || batchLimit, stats)

  for (const tag of (tags ?? []) as TagRow[]) {
    const sensitive = tag.is_sensitive === true || tag.is_adult === true
    const needsDesc = !tag.description || tag.description.trim().length < 30
    const needsLinks = !tag.wikidata_id && !tag.wikipedia_url

    let didSomething = false

    // 1+2. One Wikipedia call grounds both links and description — but only if the
    // article it served is actually about this tag. A refused summary is discarded
    // wholesale: its extract describes the other subject just as wrongly as its QID
    // identifies it, so queueing it for review would only invite a wrong approval.
    if (needsDesc || needsLinks) {
      const raw = await fetchWikipediaSummary(tag.name)
      let wiki: WikiSummary | null = null
      if (raw) {
        const p31Labels = raw.wikidata_id ? await fetchEntityClassLabels(raw.wikidata_id) : []
        const verdict = mayAdoptWikiIdentity(tag.name, { title: raw.title, p31Labels })
        if (verdict.adopt) {
          wiki = raw
        } else {
          stats.links_refused++
          console.log(
            `tag-enrichment-sweep: refused "${tag.name}" → ${raw.title ?? '?'} (${raw.wikidata_id ?? 'no qid'}): ${verdict.reason}${verdict.detail ? ` [${verdict.detail}]` : ''}`,
          )
        }
      }

      if (wiki && needsLinks) {
        const { error: e } = await supabase
          .from('unified_tags')
          .update({
            wikidata_id: wiki.wikidata_id,
            wikipedia_url: wiki.wikipedia_url,
            updated_at: new Date().toISOString(),
          })
          .eq('id', tag.id)
        if (!e) {
          stats.links_applied++
          didSomething = true
        }
      }

      if (needsDesc) {
        if (wiki) {
          // Grounded description.
          if (sensitive) {
            if (await queueDescription(tag, wiki.extract, 'external', 'wikipedia', 0.9)) {
              stats.desc_queued++
              didSomething = true
            }
          } else {
            const { error: e } = await supabase
              .from('unified_tags')
              .update({ description: wiki.extract, updated_at: new Date().toISOString() })
              .eq('id', tag.id)
            if (!e) {
              stats.desc_applied++
              didSomething = true
            }
          }
        } else {
          // Pure-LLM guess → always queue for review (never auto-apply).
          const guess = await generateDescription(tag.name)
          if (guess) {
            // chatCompletion routes to CF Workers AI when configured, else OpenAI.
            const src = llmSource()
            if (await queueDescription(tag, guess, src, 'gpt-4o-mini', 0.5)) {
              stats.desc_queued++
              didSomething = true
            }
          }
        }
      }
    }

    if (!didSomething) stats.skipped++
  }

  return new Response(
    JSON.stringify({ success: true, triggered_by: triggeredBy, ...stats }),
    { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
  )
})
