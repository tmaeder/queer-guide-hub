// Shared types + invariants for the Search Visibility Score.
// The authoritative computation lives in compute_visibility_score (Postgres);
// this module describes the contract clients see and validates the response
// shape so UI code can fail fast on drift.

export const VISIBILITY_AXIS_WEIGHTS = {
  tags: 0.20,
  geo: 0.15,
  images: 0.15,
  dates: 0.10,
  text: 0.20,
  synonyms: 0.10,
  queries: 0.10,
} as const;

export type VisibilityAxis = keyof typeof VISIBILITY_AXIS_WEIGHTS;

export const VISIBILITY_AXES: VisibilityAxis[] = [
  'tags',
  'geo',
  'images',
  'dates',
  'text',
  'synonyms',
  'queries',
];

export interface VisibilityAxisResult {
  score: number;
  weight: number;
  notes: string[];
}

export interface VisibilityResult {
  entity_type: string;
  entity_id: string;
  score: number;
  breakdown: Record<VisibilityAxis, VisibilityAxisResult>;
  suggestions: string[];
  computed_at: string;
}

export class VisibilityShapeError extends Error {
  axis?: VisibilityAxis;
  constructor(message: string, axis?: VisibilityAxis) {
    super(message);
    this.axis = axis;
  }
}

/**
 * Confirm a JSON value matches the Visibility Score contract. Throws on
 * shape errors; returns the typed value on success. Defensive — protects
 * UI code from silent contract drift.
 */
export function assertVisibilityResult(value: unknown): VisibilityResult {
  if (!value || typeof value !== 'object') {
    throw new VisibilityShapeError('expected object');
  }
  const v = value as Record<string, unknown>;
  if (typeof v.entity_type !== 'string') {
    throw new VisibilityShapeError('entity_type must be string');
  }
  if (typeof v.entity_id !== 'string') {
    throw new VisibilityShapeError('entity_id must be string');
  }
  if (typeof v.score !== 'number' || v.score < 0 || v.score > 1) {
    throw new VisibilityShapeError(`score must be 0..1, got ${v.score}`);
  }
  if (!Array.isArray(v.suggestions) || v.suggestions.some((s) => typeof s !== 'string')) {
    throw new VisibilityShapeError('suggestions must be string[]');
  }
  const breakdown = v.breakdown;
  if (!breakdown || typeof breakdown !== 'object') {
    throw new VisibilityShapeError('breakdown must be object');
  }
  const b = breakdown as Record<string, unknown>;
  for (const axis of VISIBILITY_AXES) {
    const a = b[axis];
    if (!a || typeof a !== 'object') {
      throw new VisibilityShapeError(`breakdown.${axis} missing or not object`, axis);
    }
    const ax = a as Record<string, unknown>;
    if (typeof ax.score !== 'number' || ax.score < 0 || ax.score > 1) {
      throw new VisibilityShapeError(`breakdown.${axis}.score out of range`, axis);
    }
    if (typeof ax.weight !== 'number') {
      throw new VisibilityShapeError(`breakdown.${axis}.weight not number`, axis);
    }
    if (!Array.isArray(ax.notes)) {
      throw new VisibilityShapeError(`breakdown.${axis}.notes not array`, axis);
    }
  }
  return v as unknown as VisibilityResult;
}

/**
 * Verify that breakdown weights sum to ~1 and that the top-level score
 * matches sum(score_i * weight_i). Returns the recomputed score so the UI
 * can warn on drift.
 */
export function recomputeVisibilityScore(result: VisibilityResult): number {
  let total = 0;
  for (const axis of VISIBILITY_AXES) {
    const axisResult = result.breakdown[axis];
    total += axisResult.score * axisResult.weight;
  }
  return Math.round(total * 1000) / 1000;
}

export function visibilitySumOfWeights(): number {
  return VISIBILITY_AXES.reduce((acc, a) => acc + VISIBILITY_AXIS_WEIGHTS[a], 0);
}

export function scoreLabel(score: number): 'low' | 'medium' | 'high' {
  if (score < 0.4) return 'low';
  if (score < 0.7) return 'medium';
  return 'high';
}
