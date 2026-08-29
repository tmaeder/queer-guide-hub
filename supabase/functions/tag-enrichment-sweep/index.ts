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
// MODE 'prose' (body.mode='prose', own cron `tag_prose_pass`): the description
// truth + voice pass. Walks tags that HAVE prose (the complement of the fill
// work list) on the `prose_reviewed_at` cursor; retracts wrong-subject prose
// (>=0.9) + clears the wiki identity, rewrites right-subject prose into the
// house voice. REVIEW-ONLY since 2026-08-29 — it applies nothing. See
// prosePass() below and `_shared/tag-style.ts` for the voice.
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
import { mayAdoptWikiIdentity, titleAgrees } from '../_shared/tag-wiki-guard.ts'
import {
  TAG_STYLE_SYSTEM,
  buildDefinePrompt,
  buildProseReviewPrompt,
  isSenseCategory,
} from '../_shared/tag-style.ts'
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
  category: string | null
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

/**
 * Pure-LLM glossary description fallback when no Wikipedia grounding exists.
 * Sense-anchored: the category rides along so an ordinary-word tag ("Furniture"
 * under Gear) is defined in its community sense, not its dictionary sense —
 * name-only prompting is how the wrong-sense prose got written in the first
 * place. A model that does not know the community sense says UNKNOWN, which
 * beats a fluent guess (queue nothing over queueing fabrication).
 */
async function generateDescription(name: string, categoryName: string | null): Promise<string | null> {
  try {
    const r = await chatCompletion(supabase, {
      callerFn: 'tag-enrichment-sweep',
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: TAG_STYLE_SYSTEM },
        { role: 'user', content: buildDefinePrompt(name, categoryName) },
      ],
      temperature: 0.3,
      max_tokens: 220,
    })
    // Prose responses come back as strings; ignore non-string (object) content.
    const c = r.content as unknown
    const text = typeof c === 'string' ? c.trim() : ''
    if (!text || /^unknown\b/i.test(text)) return null
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
      // Demote any existing primary first. Without this the upsert adds a
      // SECOND primary to a tag that already had one — same hole as
      // categorize-tags had. The partial unique index (20261008130000) now
      // rejects that write outright, so this is what keeps the sweep working
      // rather than erroring on every re-file.
      await supabase
        .from('tag_category_assignments')
        .update({ is_primary: false })
        .eq('tag_id', tag.id)
        .eq('is_primary', true)
        .neq('category_id', categoryId)
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

interface ProseRow {
  id: string
  name: string
  category: string | null
  description: string | null
  short_description: string | null
  long_description: string | null
  wikidata_id: string | null
  wikipedia_url: string | null
  is_sensitive: boolean | null
  is_adult: boolean | null
}

interface ProseVerdict {
  verdict: 'wrong_subject' | 'ok'
  confidence: number
  reason?: string
  description?: string
  short_description?: string
}

/**
 * mode='prose' — the description truth + voice pass (2026-08-29 programme).
 *
 * Walks every active tag that HAS a description, oldest-unreviewed first
 * (`prose_reviewed_at` is the round-robin cursor and is stamped on every
 * visit, whatever the outcome — the city-fields lesson: an unstamped miss
 * becomes a permanent queue head). One LLM call per tag answers two questions:
 *
 *   WRONG SUBJECT — the prose describes a different specific subject or the
 *   generic sense of an ordinary word ("Vamp" = a Belgian DJ, "Bottom Bitch" =
 *   a Doja Cat song, "Vacuum Pump" = industrial physics). At >=0.9 confidence
 *   the prose is RETRACTED (all three fields) and the wiki identity cleared:
 *   the weekly medical-codes / hierarchy syncs regenerate from wikidata_id, so
 *   a wrong identifier rebuilds wrong data forever while a null one rebuilds
 *   nothing, and a blank page is deindexed by run_tag_thin_page_reindex until
 *   the fill path re-earns prose. Retraction only ever REMOVES a wrong claim;
 *   replacement prose always re-enters through the grounded/queued fill paths.
 *
 *   VOICE REWRITE — subject is right: the model rewrites description (house
 *   voice, facts preserved, boilerplate stripped) + derives short_description.
 *   Non-sensitive + confidence >=0.8 auto-applies; sensitive/adult or lower
 *   confidence queues to ai_suggestions (two suggestions, one per field — the
 *   apply path takes {field, value}). long_description is NEVER rewritten:
 *   the curated kinktionary/drgay HTML bodies must not be LLM-mangled.
 */
async function prosePass(
  batchLimit: number,
  stats: {
    prose_examined: number
    prose_flagged: number
    prose_queued_rewrite: number
    prose_uncertain: number
  },
): Promise<void> {
  const { data: rows } = await supabase
    .from('unified_tags')
    .select(
      'id,name,category,description,short_description,long_description,wikidata_id,wikipedia_url,is_sensitive,is_adult',
    )
    .eq('status', 'active')
    .not('description', 'is', null)
    .order('prose_reviewed_at', { ascending: true, nullsFirst: true })
    .limit(batchLimit)
  if (!rows || rows.length === 0) return

  for (const tag of rows as ProseRow[]) {
    stats.prose_examined++
    let out: ProseVerdict | null = null
    try {
      const r = await chatCompletion(supabase, {
        callerFn: 'tag-enrichment-sweep',
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: TAG_STYLE_SYSTEM },
          {
            role: 'user',
            content: buildProseReviewPrompt({
              name: tag.name,
              categoryName: tag.category,
              description: tag.description,
              shortDescription: tag.short_description,
            }),
          },
        ],
        temperature: 0.2,
        max_tokens: 500,
      })
      const c = r.content as unknown
      if (c && typeof c === 'object') {
        out = c as ProseVerdict
      } else {
        const raw = String(c ?? '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        const m = raw.match(/\{[\s\S]*\}/)
        out = m ? (JSON.parse(m[0]) as ProseVerdict) : null
      }
    } catch (e) {
      console.error(`prosePass "${tag.name}" LLM/parse failed:`, e instanceof Error ? e.message : e)
    }

    // Stamp the cursor FIRST, whatever happened — an unparseable answer or a
    // dead breaker must not pin this tag at the head of the queue forever.
    await supabase
      .from('unified_tags')
      .update({ prose_reviewed_at: new Date().toISOString() })
      .eq('id', tag.id)
    if (!out || (out.verdict !== 'wrong_subject' && out.verdict !== 'ok')) {
      stats.prose_uncertain++
      continue
    }

    const confidence = typeof out.confidence === 'number' ? out.confidence : 0

    if (out.verdict === 'wrong_subject') {
      if (confidence < 0.9) {
        stats.prose_uncertain++
        continue
      }
      // NEVER retracts, and deliberately does NOT queue either.
      //
      // This branch used to null the prose and the wiki identity at
      // confidence >= 0.9. Its FIRST live batch (2026-08-29, 18 tags) was
      // WRONG 13 times out of 16: it destroyed correct definitions of
      // soft-limits, safe-sane-and-consensual-ssc, outing, deadnaming,
      // anxiety, genital-warts, lgbtq-health, loneliness, heteronormativity,
      // pillow-princess, educator, genealogy and charite. Only `maler` and
      // `tanzer` — literal surname disambiguation lists — were genuinely
      // wrong-subject. The model answers "wrong_subject" with high confidence
      // for prose that is merely SHORT ("Passive sexual partner", "Teaching
      // role"), so the confidence gate protected nothing.
      //
      // At ~19% precision this is not worth a review queue either: five of
      // every six rows would be noise, which is how a queue teaches its
      // reviewers to rubber-stamp. So the verdict is COUNTED AND LOGGED and
      // the tag is not touched in any way. Re-earning the right to act means
      // showing a better precision number on a fresh sample, not tuning the
      // threshold that already failed.
      stats.prose_flagged++
      console.log(
        `prosePass: wrong-subject verdict (NOT acted on) "${tag.name}" (${tag.category ?? 'uncategorized'}): ${out.reason ?? 'wrong subject'}`,
      )
      continue
    }

    // verdict === 'ok' — voice rewrite.
    const desc = typeof out.description === 'string' ? out.description.trim() : ''
    const short = typeof out.short_description === 'string' ? out.short_description.trim().slice(0, 80) : ''
    if (desc.length < 30) continue
    // A rewrite that says nothing new is a no-op, not a write.
    if (desc === (tag.description ?? '').trim() && (!short || short === (tag.short_description ?? '').trim())) {
      continue
    }

    // Rewrites are QUEUED, never applied — `sensitive` and `confidence` no
    // longer gate a direct write. The auto-apply branch was measured on the
    // same first batch: of two rewrites it produced, one was a downgrade into
    // exactly the register TAG_STYLE_SYSTEM bans — `ghosting` went from
    // "Ending contact with someone by simply stopping — no reply, no
    // explanation, no block" to "Ghosting refers to the practice of suddenly
    // and without explanation ceasing all communication". A judge that cannot
    // be trusted to retract cannot be trusted to overwrite either.
    {
      let queued = false
      if (await queueDescription(tag as unknown as TagRow, desc, llmSource(), 'gpt-4o-mini', confidence)) {
        queued = true
      }
      if (short && short !== (tag.short_description ?? '').trim()) {
        const { data: existing } = await supabase
          .from('ai_suggestions')
          .select('id')
          .eq('entity_type', 'unified_tags')
          .eq('entity_id', tag.id)
          .eq('suggestion_type', 'description')
          .eq('status', 'pending')
          .contains('proposed_value', { field: 'short_description' })
          .maybeSingle()
        if (!existing) {
          const { error: e } = await supabase.from('ai_suggestions').insert({
            suggestion_type: 'description',
            entity_type: 'unified_tags',
            entity_id: tag.id,
            proposed_value: { field: 'short_description', value: short },
            current_value: { value: tag.short_description ?? null },
            source: llmSource(),
            source_model: 'gpt-4o-mini',
            confidence,
            status: 'pending',
          })
          if (!e) queued = true
        }
      }
      if (queued) stats.prose_queued_rewrite++
    }
  }
}

interface PairRow {
  id: string
  similarity_score: number
  a_id: string
  a_name: string
  a_category: string | null
  a_short: string | null
  b_id: string
  b_name: string
  b_category: string | null
  b_short: string | null
}

interface PairVerdict {
  relation: 'a_covers_b' | 'b_covers_a' | 'related' | 'none'
  confidence: number
  reason?: string
}

/**
 * mode='relations' — verified promotion of embedding pairs into the curated
 * ontology (2026-08-29 programme, phase 4).
 *
 * The similarity pool is an internal signal only (measured precision by hand:
 * ~70% at >=0.90, ~50% at 0.85-0.90, ~25% at 0.80-0.85 — "Sexting↔Stretching"
 * scores 0.93 on surface form). Pairs >=0.85 between active tags are put to an
 * LLM that must NAME the relationship or reject it; a named verdict becomes a
 * `tag_relations` row with review_status='pending' — never displayed until an
 * admin approves (get_tag_ontology filters). `verified_at`/`verdict` on
 * tag_relationships is the cursor, stamped whatever the outcome.
 */
async function relationsPass(
  batchLimit: number,
  stats: { rel_examined: number; rel_proposed: number; rel_none: number; rel_uncertain: number },
): Promise<void> {
  const { data: pairs } = await supabase.rpc('tag_relation_verify_worklist', { p_limit: batchLimit })
  if (!pairs || pairs.length === 0) return

  for (const p of pairs as PairRow[]) {
    stats.rel_examined++
    let out: PairVerdict | null = null
    try {
      const r = await chatCompletion(supabase, {
        callerFn: 'tag-enrichment-sweep',
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You maintain the ontology of an LGBTQ+ community glossary. You only assert a relationship you can name and justify; when unsure, answer none. Respond with valid JSON only, no fences.',
          },
          {
            role: 'user',
            content:
              `Two glossary terms:\n` +
              `A: "${p.a_name}" (category: ${p.a_category ?? '?'})${p.a_short ? ` — ${p.a_short}` : ''}\n` +
              `B: "${p.b_name}" (category: ${p.b_category ?? '?'})${p.b_short ? ` — ${p.b_short}` : ''}\n\n` +
              `Classify their relationship:\n` +
              `- "a_covers_b": A is the broader concept, B a kind/part/member of A\n` +
              `- "b_covers_a": B is the broader concept, A a kind/part/member of B\n` +
              `- "related": genuinely connected AND a reader following a link between them would immediately understand why (shared practice, community, or subject — surface word-similarity does not count)\n` +
              `- "none": no relationship a glossary should assert\n\n` +
              `JSON: {"relation":"a_covers_b"|"b_covers_a"|"related"|"none","confidence":0.0-1.0,"reason":"<one sentence>"}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 160,
      })
      const c = r.content as unknown
      if (c && typeof c === 'object') {
        out = c as PairVerdict
      } else {
        const raw = String(c ?? '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        const m = raw.match(/\{[\s\S]*\}/)
        out = m ? (JSON.parse(m[0]) as PairVerdict) : null
      }
    } catch (e) {
      console.error(`relationsPass ${p.a_name}↔${p.b_name} failed:`, e instanceof Error ? e.message : e)
    }

    const relation = out?.relation
    const confidence = typeof out?.confidence === 'number' ? out.confidence : 0
    const valid = relation === 'a_covers_b' || relation === 'b_covers_a' || relation === 'related' || relation === 'none'

    // Cursor first — an unparseable answer must not pin the queue head.
    await supabase
      .from('tag_relationships')
      .update({ verified_at: new Date().toISOString(), verdict: valid ? relation : 'unparseable' })
      .eq('id', p.id)

    if (!valid) {
      stats.rel_uncertain++
      continue
    }
    if (relation === 'none' || confidence < 0.7) {
      stats.rel_none++
      continue
    }

    // broader is stored child→parent (source = narrower, target = broader).
    const row =
      relation === 'related'
        ? { source_tag_id: p.a_id, target_tag_id: p.b_id, relation_type: 'related' }
        : relation === 'a_covers_b'
          ? { source_tag_id: p.b_id, target_tag_id: p.a_id, relation_type: 'broader' }
          : { source_tag_id: p.a_id, target_tag_id: p.b_id, relation_type: 'broader' }
    const { error: e } = await supabase.from('tag_relations').upsert(
      { ...row, confidence, review_status: 'pending' },
      { onConflict: 'source_tag_id,target_tag_id,relation_type', ignoreDuplicates: true },
    )
    if (!e) stats.rel_proposed++
    else console.error(`relationsPass upsert ${p.a_name}→${p.b_name}:`, e.message)
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
  // Scoped to the same field: the prose pass can also queue a
  // short_description suggestion for the same tag, and maybeSingle() over
  // two rows errors rather than answering.
  const { data: existing } = await supabase
    .from('ai_suggestions')
    .select('id')
    .eq('entity_type', 'unified_tags')
    .eq('entity_id', tag.id)
    .eq('suggestion_type', 'description')
    .eq('status', 'pending')
    .contains('proposed_value', { field: 'description' })
    .limit(1)
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
  let mode: 'fill' | 'prose' | 'relations' = 'fill'
  try {
    const body = await req.json()
    if (typeof body?.batch_limit === 'number') {
      batchLimit = Math.min(Math.max(1, body.batch_limit), 50)
    }
    if (typeof body?.cat_limit === 'number') {
      catLimit = Math.min(Math.max(0, body.cat_limit), 50)
    }
    if (typeof body?.triggered_by === 'string') triggeredBy = body.triggered_by
    if (body?.mode === 'prose' || body?.mode === 'relations') mode = body.mode
  } catch {
    // no body — defaults
  }

  // mode='relations' — verified promotion of embedding pairs (own cursor+cron).
  if (mode === 'relations') {
    const relStats = { rel_examined: 0, rel_proposed: 0, rel_none: 0, rel_uncertain: 0 }
    await relationsPass(batchLimit, relStats)
    return new Response(
      JSON.stringify({ success: true, triggered_by: triggeredBy, mode, ...relStats }),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
    )
  }

  // mode='prose' is its own pass with its own cursor and cron — it walks tags
  // that HAVE prose, which is the complement of the fill work list.
  if (mode === 'prose') {
    const proseStats = {
      prose_examined: 0,
      prose_flagged: 0,
      prose_queued_rewrite: 0,
      prose_uncertain: 0,
    }
    await prosePass(batchLimit, proseStats)
    return new Response(
      JSON.stringify({ success: true, triggered_by: triggeredBy, mode, ...proseStats }),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
    )
  }

  // Worst tags first, restricted to those missing a fillable content dimension.
  // Needs computed from live columns (not the possibly-stale quality_breakdown)
  // so reruns before the nightly recompute don't re-pick handled tags.
  const { data: tags, error } = await supabase
    .from('unified_tags')
    .select('id,name,category,description,wikidata_id,wikipedia_url,is_sensitive,is_adult')
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
        // Title gate first, as a cost filter: it needs no network call, and a
        // mismatch is refused whatever the class turns out to be. Only a candidate
        // that already survived it is worth two more round trips — this batch can be
        // 50 tags and the function has a gateway budget to stay inside.
        const p31Labels = raw.wikidata_id && titleAgrees(tag.name, raw.title)
          ? await fetchEntityClassLabels(raw.wikidata_id)
          : []
        const verdict = mayAdoptWikiIdentity(tag.name, {
          title: raw.title,
          p31Labels,
          // On a sense-category tag ("Vacuum Pump" under Fetishes) the generic
          // article passes both classic gates; the extract must corroborate
          // the queer/community sense or the whole summary is refused.
          senseCategory: isSenseCategory(tag.category),
          extract: raw.extract,
        })
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
          const guess = await generateDescription(tag.name, tag.category)
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
