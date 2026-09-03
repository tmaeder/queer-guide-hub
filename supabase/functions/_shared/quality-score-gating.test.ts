import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { QUALITY_SCORE_ROW_FILTER, mayAdvanceEnrichmentStatus } from './quality-score-gating.ts'

// ── The one-way door ────────────────────────────────────────────────────────
//
// pipeline-quality-score used to stamp enrichment_status='completed' on every
// row it scored. pipeline-enrich-* selects 'pending' and pipeline-quality-
// enhance selects 'enriched', so a row stamped before it was enriched is
// invisible to both forever — and for a run-less row quality-enhance is the
// only path to news_commit_staging_batch. Prod 2026-09-02: 2,616 news + 929
// personality rows unreachable, all carrying quality_score without
// quality_status.

Deno.test('a not-yet-enriched row must NOT have its enrichment_status advanced', () => {
  // The regression. Scoring a 'pending' row must leave it claimable by
  // pipeline-enrich-*, which selects enrichment_status='pending' exactly.
  assertEquals(mayAdvanceEnrichmentStatus('pending'), false)
})

Deno.test('only a row already enriched may be advanced to completed', () => {
  assertEquals(mayAdvanceEnrichmentStatus('enriched'), true)
})

Deno.test('every other enrichment_status is default-deny', () => {
  // Cost asymmetry: wrongly advancing strands a row permanently, wrongly
  // holding costs one extra tick. Unknown values must take the cheap side.
  for (const s of ['completed', 'failed', 'skipped', '', 'ENRICHED', 'Enriched']) {
    assertEquals(mayAdvanceEnrichmentStatus(s), false, `expected default-deny for ${JSON.stringify(s)}`)
  }
  assertEquals(mayAdvanceEnrichmentStatus(null), false)
  assertEquals(mayAdvanceEnrichmentStatus(undefined), false)
})

// ── Filter/gate agreement ───────────────────────────────────────────────────
//
// The correctness property is that the row filter and the write gate agree.
// If the filter admits an arm the gate does not know about, rows on that arm
// get scored and then either stranded or re-selected forever.

Deno.test('the row filter admits exactly the two arms the gate knows about', () => {
  const arms = QUALITY_SCORE_ROW_FILTER.match(/enrichment_status\.eq\.(\w+)/g) ?? []
  assertEquals(
    arms.map((a) => a.split('.').pop()).sort(),
    ['enriched', 'pending'],
    'filter arms drifted from the two the write gate handles',
  )
})

Deno.test('the pending arm is guarded against re-selecting rows it already scored', () => {
  // Pending rows now KEEP enrichment_status='pending' after scoring, so without
  // this guard the oldest-first sweep would re-select the same rows every tick
  // and never advance — starving everything behind them.
  assert(
    QUALITY_SCORE_ROW_FILTER.includes(
      'and(enrichment_status.eq.pending,enriched_data->>quality_score.is.null)',
    ),
    'pending arm must require quality_score IS NULL',
  )
})

Deno.test('the enriched arm still waits for the LLM quality verdict', () => {
  // Original behaviour, preserved: do not call a row complete before
  // quality-enhance has stamped quality_status.
  assert(
    QUALITY_SCORE_ROW_FILTER.includes(
      'and(enrichment_status.eq.enriched,enriched_data->>quality_status.not.is.null)',
    ),
    'enriched arm must require quality_status IS NOT NULL',
  )
})

Deno.test('the filter never admits a row on enrichment_status=completed', () => {
  // 'completed' is this node's own output. Admitting it would re-score rows
  // forever and re-open the exact door this module closes.
  assert(
    !/enrichment_status\.eq\.completed/.test(QUALITY_SCORE_ROW_FILTER),
    'completed rows must never be re-selected',
  )
})
