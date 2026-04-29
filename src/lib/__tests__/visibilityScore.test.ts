import { describe, it, expect } from 'vitest';
import {
  VISIBILITY_AXIS_WEIGHTS,
  VISIBILITY_AXES,
  visibilitySumOfWeights,
  assertVisibilityResult,
  recomputeVisibilityScore,
  scoreLabel,
  VisibilityShapeError,
  VisibilityResult,
} from '../visibilityScore';

const makeResult = (overrides: Partial<VisibilityResult> = {}): VisibilityResult => ({
  entity_type: 'venue',
  entity_id: '00000000-0000-0000-0000-000000000001',
  score: 0.5,
  computed_at: new Date().toISOString(),
  suggestions: [],
  breakdown: {
    tags: { score: 0.5, weight: VISIBILITY_AXIS_WEIGHTS.tags, notes: [] },
    geo: { score: 0.5, weight: VISIBILITY_AXIS_WEIGHTS.geo, notes: [] },
    images: { score: 0.5, weight: VISIBILITY_AXIS_WEIGHTS.images, notes: [] },
    dates: { score: 0.5, weight: VISIBILITY_AXIS_WEIGHTS.dates, notes: [] },
    text: { score: 0.5, weight: VISIBILITY_AXIS_WEIGHTS.text, notes: [] },
    synonyms: { score: 0.5, weight: VISIBILITY_AXIS_WEIGHTS.synonyms, notes: [] },
    queries: { score: 0.5, weight: VISIBILITY_AXIS_WEIGHTS.queries, notes: [] },
  },
  ...overrides,
});

describe('VISIBILITY_AXIS_WEIGHTS', () => {
  it('weights sum to 1.0 (within float precision)', () => {
    const sum = visibilitySumOfWeights();
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it('lists all seven axes', () => {
    expect(VISIBILITY_AXES).toHaveLength(7);
    expect(VISIBILITY_AXES).toEqual([
      'tags',
      'geo',
      'images',
      'dates',
      'text',
      'synonyms',
      'queries',
    ]);
  });
});

describe('assertVisibilityResult', () => {
  it('accepts a valid result', () => {
    const r = assertVisibilityResult(makeResult());
    expect(r.entity_type).toBe('venue');
  });

  it('rejects null', () => {
    expect(() => assertVisibilityResult(null)).toThrow(VisibilityShapeError);
  });

  it('rejects missing entity_id', () => {
    const r = makeResult();
    delete (r as unknown as Record<string, unknown>).entity_id;
    expect(() => assertVisibilityResult(r)).toThrow(/entity_id/);
  });

  it('rejects out-of-range score', () => {
    expect(() => assertVisibilityResult(makeResult({ score: 1.5 }))).toThrow(/0\.\.1/);
    expect(() => assertVisibilityResult(makeResult({ score: -0.1 }))).toThrow();
  });

  it('rejects missing axis', () => {
    const r = makeResult();
    delete (r.breakdown as Record<string, unknown>).geo;
    expect(() => assertVisibilityResult(r)).toThrow(/geo/);
  });

  it('rejects axis score out of range', () => {
    const r = makeResult();
    r.breakdown.tags.score = 1.7;
    expect(() => assertVisibilityResult(r)).toThrow(/tags/);
  });

  it('rejects non-array notes', () => {
    const r = makeResult();
    (r.breakdown.tags as unknown as { notes: unknown }).notes = 'oops';
    expect(() => assertVisibilityResult(r)).toThrow(/notes/);
  });

  it('rejects suggestions containing non-strings', () => {
    const r = makeResult({ suggestions: ['ok', 42 as unknown as string] });
    expect(() => assertVisibilityResult(r)).toThrow(/suggestions/);
  });
});

describe('recomputeVisibilityScore', () => {
  it('reproduces the score when all axes match weights', () => {
    const r = makeResult();
    expect(recomputeVisibilityScore(r)).toBeCloseTo(0.5, 3);
  });

  it('matches the postgres formula on a richer example', () => {
    const r = makeResult({
      breakdown: {
        tags: { score: 1.0, weight: 0.20, notes: [] },
        geo: { score: 0.8, weight: 0.15, notes: [] },
        images: { score: 0.7, weight: 0.15, notes: [] },
        dates: { score: 1.0, weight: 0.10, notes: [] },
        text: { score: 0.4, weight: 0.20, notes: [] },
        synonyms: { score: 0.5, weight: 0.10, notes: [] },
        queries: { score: 0.5, weight: 0.10, notes: [] },
      },
    });
    // 0.2*1 + 0.15*0.8 + 0.15*0.7 + 0.10*1.0 + 0.20*0.4 + 0.10*0.5 + 0.10*0.5
    // = 0.20 + 0.12 + 0.105 + 0.10 + 0.08 + 0.05 + 0.05 = 0.705
    expect(recomputeVisibilityScore(r)).toBeCloseTo(0.705, 3);
  });

  it('rounds to 3 decimal places', () => {
    const r = makeResult({
      breakdown: {
        tags: { score: 0.333, weight: 0.20, notes: [] },
        geo: { score: 0.333, weight: 0.15, notes: [] },
        images: { score: 0.333, weight: 0.15, notes: [] },
        dates: { score: 0.333, weight: 0.10, notes: [] },
        text: { score: 0.333, weight: 0.20, notes: [] },
        synonyms: { score: 0.333, weight: 0.10, notes: [] },
        queries: { score: 0.333, weight: 0.10, notes: [] },
      },
    });
    const recomputed = recomputeVisibilityScore(r);
    // Should be exactly 0.333 (three decimal places, since 0.333 * 1.0 = 0.333)
    expect(Number.isFinite(recomputed)).toBe(true);
    expect(recomputed.toString().split('.')[1]?.length ?? 0).toBeLessThanOrEqual(3);
  });
});

describe('scoreLabel', () => {
  it('marks below 0.4 as low', () => {
    expect(scoreLabel(0)).toBe('low');
    expect(scoreLabel(0.39)).toBe('low');
  });
  it('marks 0.4..0.69 as medium', () => {
    expect(scoreLabel(0.4)).toBe('medium');
    expect(scoreLabel(0.69)).toBe('medium');
  });
  it('marks 0.7+ as high', () => {
    expect(scoreLabel(0.7)).toBe('high');
    expect(scoreLabel(1.0)).toBe('high');
  });
});

describe('axis weight constants align with migration', () => {
  // The Postgres function and the TS constants must agree to the same precision.
  // If anyone edits one, this test fails until they edit the other.
  it('weights match the values defined in compute_visibility_score', () => {
    expect(VISIBILITY_AXIS_WEIGHTS).toEqual({
      tags: 0.2,
      geo: 0.15,
      images: 0.15,
      dates: 0.1,
      text: 0.2,
      synonyms: 0.1,
      queries: 0.1,
    });
  });
});
