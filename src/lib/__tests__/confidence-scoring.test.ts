import { describe, it, expect } from 'vitest';
import {
  determineAction,
  computeConfidence,
  computeDedupConfidence,
  computeValidationConfidence,
  computeGeoConfidence,
  type ConfidenceFactor,
} from '../confidence-scoring';

// ── determineAction ─────────────────────────────────────────────────────────

describe('determineAction', () => {
  it('returns auto_correct for high scores', () => {
    expect(determineAction(0.95)).toBe('auto_correct');
    expect(determineAction(0.92)).toBe('auto_correct');
  });

  it('returns needs_review for medium scores', () => {
    expect(determineAction(0.80)).toBe('needs_review');
    expect(determineAction(0.55)).toBe('needs_review');
  });

  it('returns info_only for low scores', () => {
    expect(determineAction(0.50)).toBe('info_only');
    expect(determineAction(0.10)).toBe('info_only');
  });

  it('respects custom thresholds', () => {
    expect(determineAction(0.80, { auto_correct: 0.80, needs_review: 0.50 })).toBe('auto_correct');
    expect(determineAction(0.79, { auto_correct: 0.80, needs_review: 0.50 })).toBe('needs_review');
  });
});

// ── computeConfidence ───────────────────────────────────────────────────────

describe('computeConfidence', () => {
  it('returns 0 for empty factors', () => {
    const result = computeConfidence([]);
    expect(result.score).toBe(0);
    expect(result.action).toBe('info_only');
  });

  it('computes weighted average correctly', () => {
    const factors: ConfidenceFactor[] = [
      { name: 'a', score: 1.0, weight: 0.5, label: 'A' },
      { name: 'b', score: 0.0, weight: 0.5, label: 'B' },
    ];
    const result = computeConfidence(factors);
    expect(result.score).toBe(0.5);
  });

  it('handles unequal weights', () => {
    const factors: ConfidenceFactor[] = [
      { name: 'a', score: 1.0, weight: 0.8, label: 'A' },
      { name: 'b', score: 0.0, weight: 0.2, label: 'B' },
    ];
    const result = computeConfidence(factors);
    expect(result.score).toBe(0.8);
  });

  it('includes reasoning with top factors', () => {
    const factors: ConfidenceFactor[] = [
      { name: 'a', score: 0.9, weight: 0.6, label: 'Title match' },
      { name: 'b', score: 0.8, weight: 0.4, label: 'Location' },
    ];
    const result = computeConfidence(factors);
    expect(result.reasoning).toContain('Title match');
    expect(result.reasoning).toContain('Location');
  });
});

// ── computeDedupConfidence ──────────────────────────────────────────────────

describe('computeDedupConfidence', () => {
  it('returns high confidence for perfect match', () => {
    const result = computeDedupConfidence({
      titleSimilarity: 1.0,
      locationMatch: true,
      geoDistanceM: 0,
      timeDiffMin: 0,
      categoryMatch: true,
      sourceMatch: true,
      yearMatch: null,
    });
    expect(result.score).toBeGreaterThan(0.9);
    expect(result.action).toBe('auto_correct');
  });

  it('returns medium confidence for fuzzy title + same location', () => {
    const result = computeDedupConfidence({
      titleSimilarity: 0.75,
      locationMatch: true,
      geoDistanceM: 30,
      timeDiffMin: 5,
      categoryMatch: true,
      sourceMatch: false,
      yearMatch: null,
    });
    expect(result.score).toBeGreaterThan(0.6);
    expect(result.score).toBeLessThan(0.9);
    expect(result.action).toBe('needs_review');
  });

  it('penalizes year mismatch heavily', () => {
    const withMatch = computeDedupConfidence({
      titleSimilarity: 0.9,
      locationMatch: true,
      geoDistanceM: 0,
      timeDiffMin: 0,
      categoryMatch: true,
      sourceMatch: false,
      yearMatch: true,
    });
    const withMismatch = computeDedupConfidence({
      titleSimilarity: 0.9,
      locationMatch: true,
      geoDistanceM: 0,
      timeDiffMin: 0,
      categoryMatch: true,
      sourceMatch: false,
      yearMatch: false,
    });
    expect(withMismatch.score).toBeLessThan(withMatch.score - 0.1);
  });

  it('uses geo distance scoring tiers', () => {
    const close = computeDedupConfidence({
      titleSimilarity: 0.9,
      locationMatch: true,
      geoDistanceM: 5,
      timeDiffMin: null,
      categoryMatch: true,
      sourceMatch: false,
      yearMatch: null,
    });
    const far = computeDedupConfidence({
      titleSimilarity: 0.9,
      locationMatch: true,
      geoDistanceM: 400,
      timeDiffMin: null,
      categoryMatch: true,
      sourceMatch: false,
      yearMatch: null,
    });
    expect(close.score).toBeGreaterThan(far.score);
  });

  it('uses time diff scoring tiers', () => {
    const sameTime = computeDedupConfidence({
      titleSimilarity: 0.9,
      locationMatch: true,
      geoDistanceM: null,
      timeDiffMin: 0,
      categoryMatch: true,
      sourceMatch: false,
      yearMatch: null,
    });
    const thirtyMin = computeDedupConfidence({
      titleSimilarity: 0.9,
      locationMatch: true,
      geoDistanceM: null,
      timeDiffMin: 30,
      categoryMatch: true,
      sourceMatch: false,
      yearMatch: null,
    });
    expect(sameTime.score).toBeGreaterThan(thirtyMin.score);
  });
});

// ── computeValidationConfidence ─────────────────────────────────────────────

describe('computeValidationConfidence', () => {
  it('returns high confidence for certain detection + safe fix', () => {
    const result = computeValidationConfidence({
      detectionCertainty: 1.0,
      fixSafety: 1.0,
      hasFix: true,
    });
    expect(result.score).toBeGreaterThan(0.9);
  });

  it('returns lower confidence when no fix available', () => {
    const withFix = computeValidationConfidence({
      detectionCertainty: 0.9,
      fixSafety: 0.9,
      hasFix: true,
    });
    const noFix = computeValidationConfidence({
      detectionCertainty: 0.9,
      fixSafety: 0.9,
      hasFix: false,
    });
    expect(noFix.score).toBeLessThan(withFix.score);
  });
});

// ── computeGeoConfidence ────────────────────────────────────────────────────

describe('computeGeoConfidence', () => {
  it('returns high confidence for direct unambiguous match', () => {
    const result = computeGeoConfidence({
      nameMatchQuality: 1.0,
      resolvedViaAlias: false,
      ambiguous: false,
      countryContextAvailable: true,
    });
    expect(result.score).toBeGreaterThan(0.9);
  });

  it('returns lower confidence for ambiguous match without country', () => {
    const result = computeGeoConfidence({
      nameMatchQuality: 1.0,
      resolvedViaAlias: false,
      ambiguous: true,
      countryContextAvailable: false,
    });
    expect(result.score).toBeLessThan(0.8);
  });

  it('slightly penalizes alias-based resolution', () => {
    const direct = computeGeoConfidence({
      nameMatchQuality: 1.0,
      resolvedViaAlias: false,
      ambiguous: false,
      countryContextAvailable: true,
    });
    const alias = computeGeoConfidence({
      nameMatchQuality: 1.0,
      resolvedViaAlias: true,
      ambiguous: false,
      countryContextAvailable: true,
    });
    expect(alias.score).toBeLessThan(direct.score);
  });
});
