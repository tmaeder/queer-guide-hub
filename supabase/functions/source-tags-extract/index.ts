import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { MissingCredentialsError, skippedResponse } from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import {
  DECIDED_STATUSES,
  type AliasRef,
  type ExtractedTag,
  type TagRef,
  type VocabularyIndex,
  buildProposalRow,
  collisionFor,
  foldTags,
  nameKey,
  selectProposals,
} from './extract.ts'

// Source: Tags Extract — scans tags[] on venues/events/personalities and files
// each unseen string as a PROPOSAL in public.ai_suggestions.
//
// It does NOT write public.unified_tags. See the comment on the proposal block
// below for why that direction is one-way.

// Row cap per source table. Raising it is a real decision (see the truncation
// note below), so the cap is named rather than inline.
const TABLE_SCAN_CAP = 5000
// PostgREST's own default ceiling per response; every paginated read below
// walks in pages of this size, ordered by id.
const PAGE = 1000
const INSERT_CHUNK = 200

Deno.serve(withErrorReporting('source-tags-extract', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const dryRun = body.dry_run || false

    const tagSet = new Map<string, ExtractedTag>()

    const tables = [
      { table: 'venues', col: 'tags' },
      { table: 'events', col: 'tags' },
      { table: 'personalities', col: 'tags' },
    ]

    // A table that returns exactly TABLE_SCAN_CAP rows was truncated, and there
    // is no ORDER BY, so WHICH rows came back is arbitrary — this function has
    // never seen the whole corpus and a different arbitrary slice is sampled
    // every Sunday. All three tables are far past the cap today (~18% coverage
    // overall), so the flag alone would be permanently on and therefore unread:
    // the ratio is what carries information, which is why the planner's row
    // estimate is fetched (count:'planned' is free — no seq scan) rather than
    // just recording the fact.
    const truncatedTables: { table: string; scanned: number; approx_total: number | null; approx_coverage: number | null }[] = []

    for (const { table, col } of tables) {
      const { data, error } = await supabase
        .from(table)
        .select(col)
        .not(col, 'is', null)
        .limit(TABLE_SCAN_CAP)

      if (error) throw new Error(`scan ${table}: ${error.message}`)
      if (!data) continue

      if (data.length >= TABLE_SCAN_CAP) {
        const { count } = await supabase
          .from(table)
          .select(col, { count: 'planned', head: true })
          .not(col, 'is', null)
        truncatedTables.push({
          table,
          scanned: data.length,
          approx_total: count ?? null,
          approx_coverage: count ? Math.round((data.length / count) * 1000) / 1000 : null,
        })
      }

      for (const row of data) foldTags(tagSet, table, row[col as keyof typeof row])
    }

    if (truncatedTables.length > 0) {
      console.warn(
        `source-tags-extract: scan cap ${TABLE_SCAN_CAP} hit on ${truncatedTables.map(t => `${t.table} (~${t.approx_coverage !== null ? Math.round(t.approx_coverage * 100) : '?'}% of ${t.approx_total ?? '?'})`).join(', ')} — no ORDER BY, so this is an arbitrary slice and a DIFFERENT one next run. "Already proposed" therefore only covers slugs an earlier run happened to see.`,
      )
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
        distinct_tags_seen: 0,
        truncated_tables: truncatedTables,
        message: 'no tags found',
      }, 200, req)
    }

    // ---------------------------------------------------------------------
    // Re-proposal guard. This is a WEEKLY cron over a corpus that barely
    // changes, so without it every string is re-filed every Sunday and the
    // review queue becomes noise a reviewer learns to bulk-dismiss.
    //
    // Every read below is `.order('id')` + `.range()`. WITHOUT the order, this
    // is not pagination — the live plan for the ai_suggestions read is a Gather
    // over a Parallel Seq Scan, whose row order is genuinely nondeterministic
    // across executions, so a row can be in page n on one call and page n+1 on
    // the next and never be returned at all. That silently drops a tombstone
    // and re-files its slug, which is the precise failure this guard exists to
    // prevent. There is NO database backstop: ai_suggestions_tag_idempotency_idx
    // keys on (entity_type, entity_id, proposed_value->>'tag_id') and these rows
    // are NULL in both trailing columns, so under NULLS DISTINCT the duplicates
    // insert cleanly and silently.
    //
    // Every read also fails LOUD. A swallowed error here does not mean "nothing
    // matched", it means "we could not tell" — and proceeding on that would
    // re-file the whole corpus.
    // ---------------------------------------------------------------------

    // (a) unified_tags, read ONCE and used for two different jobs: the slug
    // guard and the collision map below. Two chunked `.in()` passes over the
    // same ~10k-row table would cost more than one ordered walk of it, and the
    // name half cannot use `.in()` safely anyway — supabase-js quotes values
    // containing , ( ) but does not escape an embedded double quote, and tag
    // names are arbitrary user text. Matching in JS has no such trap.
    //
    // Slug membership is checked in ANY status. A deprecated tag must not be
    // re-proposed: reviving one is restore_deprecated_tag()'s job, which clears
    // deprecated_at and the reason together. A proposal that re-mints it would
    // rebuild the split-brain state 20261007100000 made unrepresentable.
    const knownSlugs = new Set<string>()
    const byName = new Map<string, TagRef>()
    const byId = new Map<string, TagRef>()
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('unified_tags')
        .select('id, slug, name, status')
        .order('id')
        .range(from, from + PAGE - 1)
      if (error) throw new Error(`unified_tags lookup: ${error.message}`)
      for (const r of data ?? []) {
        const row = r as { id: string; slug: string; name: string | null; status: string | null }
        knownSlugs.add(row.slug)
        const ref: TagRef = { slug: row.slug, name: row.name ?? '', status: row.status }
        byId.set(row.id, ref)
        if (row.name) {
          // First row wins; unified_tags names are NOT unique (see the
          // namespace-prefix cohort — occ-pride and news-pride share "Pride").
          const k = nameKey(row.name)
          if (!byName.has(k)) byName.set(k, ref)
        }
      }
      if (!data || data.length < PAGE) break
    }

    // (b) tag_aliases. A proposal whose name equals an existing ALIAS is the
    // alias-collapses-an-identity class: approving it mints a second vocabulary
    // row for a string that already routes somewhere. 46 of today's proposals
    // are in this set — more than ten times the name-collision count — and
    // nothing else in the pipeline looks at aliases at all.
    const byAlias = new Map<string, AliasRef>()
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('tag_aliases')
        .select('alias_name, review_status, canonical_tag_id')
        .order('id')
        .range(from, from + PAGE - 1)
      if (error) throw new Error(`tag_aliases lookup: ${error.message}`)
      for (const r of data ?? []) {
        const row = r as { alias_name: string | null; review_status: string | null; canonical_tag_id: string }
        if (!row.alias_name) continue
        const k = nameKey(row.alias_name)
        if (!byAlias.has(k)) byAlias.set(k, { alias_name: row.alias_name, review_status: row.review_status, tag_id: row.canonical_tag_id })
      }
      if (!data || data.length < PAGE) break
    }

    // (c) already proposed. A `rejected` row is a TOMBSTONE — without honouring
    // it the cron re-files every string a human already refused. Same shape as
    // the rejected rows tag_relations keeps so its verifier cannot re-propose.
    // `entity_id IS NULL` is exactly this node's row shape; the other
    // suggestion_type='tag' shape is "attach existing tag X to entity Y", which
    // carries an entity_id and a tag_id.
    const alreadyProposed = new Set<string>()
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('ai_suggestions')
        .select('id, proposed_value')
        .eq('suggestion_type', 'tag')
        .is('entity_id', null)
        .in('status', DECIDED_STATUSES)
        .order('id')
        .range(from, from + PAGE - 1)
      if (error) throw new Error(`ai_suggestions lookup: ${error.message}`)
      for (const r of data ?? []) {
        const s = (r as { proposed_value?: { slug?: unknown } }).proposed_value?.slug
        if (typeof s === 'string' && s) alreadyProposed.add(s)
      }
      if (!data || data.length < PAGE) break
    }

    const proposals = selectProposals(tagSet.values(), knownSlugs, alreadyProposed)
    const skippedExisting = tagSet.size - proposals.length

    // ---------------------------------------------------------------------
    // Collisions are STAMPED, never filtered.
    //
    // The guard keys on slug, so a proposal can carry the same NAME as a live
    // tag reachable under a different slug — the namespace-prefix cohort
    // (genre-erotica "Erotica", vibe-minimal "Minimal", occ-wedding "Wedding")
    // carries the prefix in the slug and not in the name by design. Approving
    // one of those blind grows tag_hygiene_stats().duplicate_active_name, a HARD
    // gate that reds every subsequent PR.
    //
    // It is not auto-skipped because the marketplace facet "Silicone" and a
    // glossary "Silicone" are arguably different vocabularies, and that is a
    // human's call, not a cron's. The reviewer gets the collision on the row.
    // ---------------------------------------------------------------------
    const vocabulary: VocabularyIndex = { byName, byAlias, byId }
    const stamped = proposals.map(t => ({ ...t, collides_with: collisionFor(t.name, vocabulary) }))
    const collisionCount = stamped.filter(t => t.collides_with).length

    // `items_total` is the PROPOSAL count, not the 3,952 distinct strings the
    // scan saw. pipeline-executor:315 books items_out as
    //   (items) || (items_processed) || (items_total) || 0
    // — falsy-coalescing, so a correct steady-state run (nothing new to file)
    // returns 0, 0 and would fall through to the scan size and book thousands
    // of items "processed" for a run that wrote nothing. The scan size is still
    // reported, under `distinct_tags_seen`, where no consumer mistakes it for
    // work done. pipeline-executor is a shared consumer and is not changed here.
    const baseCounts = {
      items_total: proposals.length,
      items_processed: proposals.length,
      skipped_existing: skippedExisting,
      distinct_tags_seen: tagSet.size,
      name_collisions: stamped.filter(t => t.collides_with?.kind === 'name').length,
      alias_collisions: stamped.filter(t => t.collides_with?.kind === 'alias').length,
      collisions_flagged: collisionCount,
      truncated_tables: truncatedTables,
    }

    if (dryRun) {
      return jsonResponse({
        success: true,
        dry_run: true,
        items: 0,
        items_succeeded: 0,
        items_failed: 0,
        ...baseCounts,
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
    const rows = stamped.map(t => buildProposalRow(t, t.collides_with, runId))

    let inserted = 0
    let insertErrors = 0
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const chunk = rows.slice(i, i + INSERT_CHUNK)
      const { error, count } = await supabase
        .from('ai_suggestions')
        .insert(chunk, { count: 'exact' })
      if (error) {
        insertErrors++
        console.error(`tag proposal chunk ${i}: ${error.message}`)
      } else {
        inserted += count ?? chunk.length
      }
    }

    // A run that swallowed every insert error and still answered success:true
    // books exactly like a clean one. It does not any more.
    return jsonResponse({
      success: insertErrors === 0,
      items: inserted,
      items_succeeded: inserted,
      items_failed: proposals.length - inserted,
      insert_errors: insertErrors,
      source_run_id: runId,
      ...baseCounts,
    }, 200, req)
  } catch (error) {
    if (error instanceof MissingCredentialsError) {
      return jsonResponse(skippedResponse('missing_credentials', error.missing), 200, req)
    }
    return errorResponse((error as Error).message, 500, req)
  }
}))
