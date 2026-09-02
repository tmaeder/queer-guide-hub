import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { MissingCredentialsError, skippedResponse } from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { tagSlug } from './slug.ts'

// Source: Tags Extract — scans tags[] on venues/events/personalities and files
// each unseen string as a PROPOSAL in public.ai_suggestions.
//
// It does NOT write public.unified_tags. See the comment on the proposal block
// below for why that direction is one-way.

// Row cap per source table. Raising it is a real decision (see TABLE_SCAN_CAP
// note below), so the cap is named rather than inline.
const TABLE_SCAN_CAP = 5000
// PostgREST puts the filter in the URL; ~600 ids is where that starts to break.
const LOOKUP_CHUNK = 500
const INSERT_CHUNK = 200
const PAGE = 1000

// Statuses that make a slug already-decided. `superseded` and `expired` are
// deliberately absent: both mean the proposal lapsed without a human verdict,
// so re-filing it is the point.
const DECIDED_STATUSES = ['pending', 'approved', 'applied', 'rejected']

Deno.serve(withErrorReporting('source-tags-extract', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const dryRun = body.dry_run || false

    const tagSet = new Map<string, { name: string; slug: string; seen_in: string[] }>()

    const tables = [
      { table: 'venues', col: 'tags' },
      { table: 'events', col: 'tags' },
      { table: 'personalities', col: 'tags' },
    ]

    // A table that returns exactly TABLE_SCAN_CAP rows was almost certainly
    // truncated, and there is no ORDER BY, so WHICH rows came back is arbitrary
    // — this function has never seen the whole corpus. That is reported rather
    // than silently widened: raising the cap changes how many strings land in
    // the review queue in one go, which is a decision for whoever drains it.
    const truncatedTables: string[] = []

    for (const { table, col } of tables) {
      const { data, error } = await supabase
        .from(table)
        .select(col)
        .not(col, 'is', null)
        .limit(TABLE_SCAN_CAP)

      if (error) throw new Error(`scan ${table}: ${error.message}`)
      if (!data) continue
      if (data.length >= TABLE_SCAN_CAP) {
        truncatedTables.push(table)
        console.warn(
          `source-tags-extract: ${table} hit the ${TABLE_SCAN_CAP}-row scan cap with no ORDER BY — this is a partial, arbitrary sample of the corpus`,
        )
      }

      for (const row of data) {
        const tags = row[col as keyof typeof row]
        if (!Array.isArray(tags)) continue
        for (const tag of tags) {
          const name = String(tag).trim()
          if (!name) continue
          const slug = tagSlug(name)
          if (!slug) continue
          const seen = tagSet.get(slug)
          if (seen) {
            if (!seen.seen_in.includes(table)) seen.seen_in.push(table)
          } else {
            tagSet.set(slug, { name, slug, seen_in: [table] })
          }
        }
      }
    }

    if (tagSet.size === 0) {
      return jsonResponse({
        success: true,
        items: 0,
        items_total: 0,
        items_processed: 0,
        items_succeeded: 0,
        items_failed: 0,
        skipped_existing: 0,
        truncated_tables: truncatedTables,
        message: 'no tags found',
      }, 200, req)
    }

    const allSlugs = Array.from(tagSet.keys())

    // ---------------------------------------------------------------------
    // Re-proposal guard. This is a WEEKLY cron over a corpus that barely
    // changes, so without it every string is re-filed every Sunday and the
    // review queue becomes noise a reviewer learns to bulk-dismiss.
    //
    // Both lookups fail LOUD. A swallowed error here does not mean "nothing
    // matched", it means "we could not tell" — and proceeding on that would
    // re-file the entire corpus, which is exactly the failure the guard exists
    // to prevent.
    // ---------------------------------------------------------------------
    const known = new Set<string>()

    // (a) already vocabulary, in ANY status. A deprecated tag must not be
    // re-proposed: reviving one is restore_deprecated_tag()'s job, which clears
    // deprecated_at and the reason together. A proposal that re-mints it would
    // rebuild the split-brain state 20261007100000 made unrepresentable.
    for (let i = 0; i < allSlugs.length; i += LOOKUP_CHUNK) {
      const chunk = allSlugs.slice(i, i + LOOKUP_CHUNK)
      const { data, error } = await supabase
        .from('unified_tags')
        .select('slug')
        .in('slug', chunk)
      if (error) throw new Error(`unified_tags lookup: ${error.message}`)
      for (const r of data ?? []) known.add(r.slug as string)
    }

    // (b) already proposed. A `rejected` row is a TOMBSTONE — without honouring
    // it the cron re-files every string a human already refused. Same shape as
    // the rejected rows tag_relations keeps so the verifier cannot re-propose.
    // Read as one paginated pass over whole `proposed_value` rather than a
    // chunked .in() over a jsonb path: `entity_id IS NULL` is exactly this
    // node's row shape (the other suggestion_type='tag' shape is "attach
    // existing tag X to entity Y", which carries an entity_id and a tag_id),
    // so the set stays small — and it keeps a query whose failure mode is
    // "re-file everything" off unproven PostgREST jsonb-path syntax.
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('ai_suggestions')
        .select('proposed_value')
        .eq('suggestion_type', 'tag')
        .is('entity_id', null)
        .in('status', DECIDED_STATUSES)
        .range(from, from + PAGE - 1)
      if (error) throw new Error(`ai_suggestions lookup: ${error.message}`)
      for (const r of data ?? []) {
        const s = (r as { proposed_value?: { slug?: unknown } }).proposed_value?.slug
        if (typeof s === 'string' && s) known.add(s)
      }
      if (!data || data.length < PAGE) break
    }

    const proposals = allSlugs.filter(s => !known.has(s)).map(s => tagSet.get(s)!)
    const skippedExisting = tagSet.size - proposals.length

    if (dryRun) {
      return jsonResponse({
        success: true,
        dry_run: true,
        items: 0,
        items_total: tagSet.size,
        items_processed: proposals.length,
        items_succeeded: 0,
        items_failed: 0,
        skipped_existing: skippedExisting,
        truncated_tables: truncatedTables,
      }, 200, req)
    }

    // ---------------------------------------------------------------------
    // PROPOSE, NEVER CREATE.
    //
    // This node used to insert straight into unified_tags. Two faults came out
    // of that and only one of them was the missing language gate:
    //
    //  * It carried an explicit status:'active' through ON CONFLICT DO UPDATE,
    //    so every re-derived row had its status written back to 'active' while
    //    deprecated_at stayed set. 297 tags the 2026-06-05 audit had deprecated
    //    came back as pages that rendered (fetchTagWithCategories reads status)
    //    but that search refused to index (search_documents_index_tags reads
    //    deprecated_at) — `lgbtiq`, `sauna` and `kink` were unreachable by site
    //    search for three months.
    //  * With no language gate, German section headings scraped off a Zurich
    //    site (Bühne, Beratung, Bildung, Vernetzung, Gesundheit) became live
    //    glossary entries.
    //
    // The insert-only fix addressed the first and could not address the second:
    // a scraped free-text string was still vocabulary the moment it was seen.
    // Filing a proposal is the only shape where neither can recur, because
    // there is now NO statement in this function that touches unified_tags —
    // not an insert, not an upsert, not an update. A human decides.
    // ---------------------------------------------------------------------
    const runId = crypto.randomUUID()
    const rows = proposals.map(t => ({
      suggestion_type: 'tag',
      entity_type: 'tag',
      entity_id: null,
      source: 'rule',
      source_run_id: runId,
      status: 'pending',
      proposed_value: { name: t.name, slug: t.slug, seen_in: t.seen_in },
    }))

    let inserted = 0
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const chunk = rows.slice(i, i + INSERT_CHUNK)
      const { error, count } = await supabase
        .from('ai_suggestions')
        .insert(chunk, { count: 'exact' })
      if (error) {
        console.error(`tag proposal chunk ${i}: ${error.message}`)
      } else {
        inserted += count ?? chunk.length
      }
    }

    return jsonResponse({
      success: true,
      items: inserted,
      items_total: tagSet.size,
      items_processed: proposals.length,
      items_succeeded: inserted,
      items_failed: proposals.length - inserted,
      skipped_existing: skippedExisting,
      truncated_tables: truncatedTables,
      source_run_id: runId,
    }, 200, req)
  } catch (error) {
    if (error instanceof MissingCredentialsError) {
      return jsonResponse(skippedResponse('missing_credentials', error.missing), 200, req)
    }
    return errorResponse((error as Error).message, 500, req)
  }
}))
