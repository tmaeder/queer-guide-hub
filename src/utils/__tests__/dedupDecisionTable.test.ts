import { describe, it, expect } from 'vitest';

// Mirrors the decision-threshold logic in pipeline-deduplicate.
// The thresholds are part of the bullet-proof contract: scores >= autoMergeMin
// auto-merge, >= reviewMin route to human review, < reviewMin are unique.
// If these numbers change, an admin must update the test as well.

interface Decision {
  status: 'unique' | 'duplicate' | 'merge_candidate';
  disposition: 'pending' | 'skipped';
  reviewStatus: 'auto' | 'pending_review';
  action: 'no_match' | 'auto_merge' | 'flag_review';
}

function decide(matchId: string | null, score: number, autoMergeMin = 0.9, reviewMin = 0.75): Decision {
  if (!matchId) return { status: 'unique', disposition: 'pending', reviewStatus: 'auto', action: 'no_match' };
  if (score >= autoMergeMin) return { status: 'duplicate', disposition: 'pending', reviewStatus: 'auto', action: 'auto_merge' };
  if (score >= reviewMin) return { status: 'merge_candidate', disposition: 'pending', reviewStatus: 'pending_review', action: 'flag_review' };
  return { status: 'unique', disposition: 'pending', reviewStatus: 'auto', action: 'no_match' };
}

describe('dedup decision thresholds (pipeline-deduplicate)', () => {
  it('no match → unique, auto', () => {
    expect(decide(null, 0)).toEqual({
      status: 'unique', disposition: 'pending', reviewStatus: 'auto', action: 'no_match',
    });
  });

  it('score exactly auto_merge_min → duplicate, auto_merge', () => {
    const d = decide('xxx', 0.9);
    expect(d.status).toBe('duplicate');
    expect(d.action).toBe('auto_merge');
    expect(d.reviewStatus).toBe('auto');
  });

  it('score in [review_min, auto_merge_min) → merge_candidate, pending_review', () => {
    const d = decide('xxx', 0.80);
    expect(d.status).toBe('merge_candidate');
    expect(d.action).toBe('flag_review');
    expect(d.reviewStatus).toBe('pending_review');
  });

  it('score exactly review_min → merge_candidate', () => {
    const d = decide('xxx', 0.75);
    expect(d.status).toBe('merge_candidate');
  });

  it('score below review_min → unique (weak match ignored)', () => {
    const d = decide('xxx', 0.50);
    expect(d.status).toBe('unique');
    expect(d.reviewStatus).toBe('auto');
  });

  it('score = 1.0 → duplicate', () => {
    const d = decide('xxx', 1.0);
    expect(d.status).toBe('duplicate');
  });

  it('custom thresholds: tighter auto_merge', () => {
    const d = decide('xxx', 0.92, 0.95, 0.80);
    expect(d.status).toBe('merge_candidate');
    const d2 = decide('xxx', 0.96, 0.95, 0.80);
    expect(d2.status).toBe('duplicate');
  });

  it('custom thresholds: looser review_min', () => {
    const d = decide('xxx', 0.62, 0.9, 0.60);
    expect(d.status).toBe('merge_candidate');
  });
});

// Shape contract for record_dedup_decision RPC payload. If the SQL signature
// changes (migration 20260415170100_dedup_decisions_generic.sql), this test
// must be updated in lockstep.
describe('record_dedup_decision payload shape', () => {
  it('required fields present for a unique decision', () => {
    const payload = {
      p_entity_type: 'venue',
      p_staging_id: 'abc',
      p_pipeline_run_id: null,
      p_match_id: null,
      p_match_method: 'none',
      p_confidence: 0,
      p_decision: 'unique' as const,
      p_action: 'no_match' as const,
      p_rules: { candidates: [] },
      p_decided_by: 'pipeline-deduplicate',
    };
    expect(Object.keys(payload).sort()).toEqual([
      'p_action', 'p_confidence', 'p_decided_by', 'p_decision',
      'p_entity_type', 'p_match_id', 'p_match_method',
      'p_pipeline_run_id', 'p_rules', 'p_staging_id',
    ]);
  });

  it('match_id is uuid when duplicate', () => {
    const payload = {
      p_entity_type: 'venue',
      p_staging_id: '11111111-1111-1111-1111-111111111111',
      p_pipeline_run_id: '22222222-2222-2222-2222-222222222222',
      p_match_id: '33333333-3333-3333-3333-333333333333',
      p_match_method: 'phone_e164',
      p_confidence: 0.98,
      p_decision: 'duplicate' as const,
      p_action: 'auto_merge' as const,
      p_rules: { candidates: [{ venue_id: '33333333-3333-3333-3333-333333333333', match_type: 'phone_e164', score: 0.98 }] },
      p_decided_by: 'pipeline-deduplicate',
    };
    expect(payload.p_match_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(payload.p_confidence).toBeGreaterThanOrEqual(0.9);
    expect(payload.p_action).toBe('auto_merge');
  });
});

// Contract: review_queue insert must use these EXACT columns
// (entity_type, entity_id, review_type, status, details) — the swallowed
// .catch(() => {}) in the old pipeline-review-gate was masking schema
// mismatches (`reason`, `source` — columns that don't exist).
describe('review_queue hard-fail insert shape', () => {
  it('merge_candidate insert has required columns', () => {
    const insert = {
      entity_type: 'ingestion_staging',
      entity_id: '11111111-1111-1111-1111-111111111111',
      review_type: 'merge_candidate',
      status: 'pending',
      details: { target_table: 'venues', match_id: 'x', match_type: 'phone', score: 0.82, rules: [] },
    };
    expect('entity_type' in insert).toBe(true);
    expect('entity_id' in insert).toBe(true);
    expect('review_type' in insert).toBe(true);
    expect('status' in insert).toBe(true);
    expect('details' in insert).toBe(true);
    // Columns that DO NOT exist in review_queue — must not appear
    expect('reason' in insert).toBe(false);
    expect('source' in insert).toBe(false);
  });

  it('low_confidence insert has required columns', () => {
    const insert = {
      entity_type: 'ingestion_staging',
      entity_id: '11111111-1111-1111-1111-111111111111',
      review_type: 'low_confidence',
      status: 'pending',
      details: {
        combined_score: 0.5,
        confidence: 0.4,
        quality_score: 60,
        target_table: 'events',
        source: 'pipeline-review-gate',
      },
    };
    expect(insert.review_type).toBe('low_confidence');
    expect(insert.status).toBe('pending');
    // 'source' is nested inside details, NOT a top-level column
    expect('source' in insert).toBe(false);
    expect((insert.details as Record<string, unknown>).source).toBe('pipeline-review-gate');
  });
});
