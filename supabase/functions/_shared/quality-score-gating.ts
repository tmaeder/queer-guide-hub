/**
 * Row-selection and enrichment_status gating for pipeline-quality-score.
 *
 * Lives here rather than inline in the node so it can actually be tested:
 * `index.ts` calls `Deno.serve` at module scope, so importing it from a test
 * starts a server.
 *
 * WHY THIS EXISTS AT ALL — `ingestion_staging.enrichment_status` is overloaded.
 * It is the enrichment state machine (`pending` -> `enriched` | `failed`,
 * written by `apply_enrichment`) and it was ALSO used as a progress marker by
 * pipeline-quality-score, which stamped `'completed'` on every row it scored.
 *
 * That is a one-way door. The consumers select on exact values:
 *   - pipeline-enrich-*        selects enrichment_status = 'pending'
 *   - pipeline-quality-enhance selects enrichment_status = 'enriched'
 * so a row stamped `'completed'` before it was ever enriched is invisible to
 * BOTH forever — and for a row with no pipeline_run_id, quality-enhance is the
 * only path to `news_commit_staging_batch`. The row is then unreachable by
 * every live consumer while still looking like an ordinary "stale pending" row.
 *
 * It is not a rare race. pipeline-quality-score is the one stage function that
 * applies NO `pipeline_run_id` filter (pipeline-validate and
 * pipeline-deduplicate both do), so it sweeps the whole table oldest-first and
 * routinely overtakes the enrich stages. Measured on prod 2026-09-02:
 * 2,616 news + 929 personality rows stranded at disposition='pending', every
 * one carrying `quality_score` with no `quality_status` — scored, never
 * enriched. The oldest was 2026-05-12.
 */

/**
 * PostgREST `.or()` filter selecting rows this node may score.
 *
 * Two arms, and the arm a row arrives on decides whether its
 * `enrichment_status` may be advanced — see `mayAdvanceEnrichmentStatus`.
 *
 *   pending  — not yet enriched. Score it, but leave the status alone so an
 *              enrich stage can still claim it. `quality_score is null` stops
 *              this arm re-selecting the same oldest rows every tick, which it
 *              otherwise would now that these rows stay `pending`.
 *   enriched — quality-enhance has stamped `quality_status`, so enrichment is
 *              genuinely finished and `'completed'` is the honest state. The
 *              `quality_status` guard is original behaviour: it stops a row
 *              flipping to `'completed'` before the LLM pass.
 */
export const QUALITY_SCORE_ROW_FILTER =
  'and(enrichment_status.eq.pending,enriched_data->>quality_score.is.null),' +
  'and(enrichment_status.eq.enriched,enriched_data->>quality_status.not.is.null)'

/**
 * True only when scoring this row may also advance `enrichment_status` to
 * `'completed'`. Exactly the `enriched` arm above.
 *
 * Anything else — `pending`, `failed`, `completed`, null, an unknown value —
 * returns false. Default-deny is deliberate: the cost of wrongly advancing is
 * a permanently unreachable row, the cost of wrongly not advancing is a row
 * that gets picked up again on a later tick.
 */
export function mayAdvanceEnrichmentStatus(enrichmentStatus: string | null | undefined): boolean {
  return enrichmentStatus === 'enriched'
}
