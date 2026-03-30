/**
 * Confidence scoring engine for automated content checks.
 *
 * This is the Node/Vitest-compatible copy. The canonical source is at:
 *   supabase/functions/_shared/confidence-scoring.ts
 * Both files are identical (no platform-specific imports).
 */

export type ReviewAction = 'auto_correct' | 'needs_review' | 'clearly_wrong' | 'info_only';

export interface ConfidenceResult {
  score: number;
  action: ReviewAction;
  reasoning: string;
  factors: ConfidenceFactor[];
}

export interface ConfidenceFactor {
  name: string;
  score: number;
  weight: number;
  label: string;
}

const DEFAULT_THRESHOLDS = {
  auto_correct: 0.92,
  needs_review: 0.55,
};

export interface ActionThresholds {
  auto_correct: number;
  needs_review: number;
}

export function determineAction(
  score: number,
  thresholds: ActionThresholds = DEFAULT_THRESHOLDS,
): ReviewAction {
  if (score >= thresholds.auto_correct) return 'auto_correct';
  if (score >= thresholds.needs_review) return 'needs_review';
  return 'info_only';
}

export function computeConfidence(
  factors: ConfidenceFactor[],
  thresholds?: ActionThresholds,
): ConfidenceResult {
  if (factors.length === 0) {
    return { score: 0, action: 'info_only', reasoning: 'No scoring factors', factors: [] };
  }

  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const score =
    totalWeight > 0
      ? factors.reduce((sum, f) => sum + f.score * f.weight, 0) / totalWeight
      : 0;

  const action = determineAction(score, thresholds);

  const sorted = [...factors].sort((a, b) => b.weight - a.weight);
  const topFactors = sorted
    .slice(0, 3)
    .map((f) => `${f.label}: ${(f.score * 100).toFixed(0)}%`)
    .join(', ');
  const reasoning = `Score ${(score * 100).toFixed(0)}% (${topFactors})`;

  return { score: Math.round(score * 1000) / 1000, action, reasoning, factors };
}

export function computeDedupConfidence(signals: {
  titleSimilarity: number;
  locationMatch: boolean;
  geoDistanceM: number | null;
  timeDiffMin: number | null;
  categoryMatch: boolean;
  sourceMatch: boolean;
  yearMatch: boolean | null;
}): ConfidenceResult {
  const factors: ConfidenceFactor[] = [];

  factors.push({
    name: 'title_similarity',
    score: signals.titleSimilarity,
    weight: 0.35,
    label: 'Title match',
  });

  factors.push({
    name: 'location_match',
    score: signals.locationMatch ? 1.0 : 0.0,
    weight: 0.2,
    label: 'Location match',
  });

  if (signals.geoDistanceM != null) {
    const geoScore =
      signals.geoDistanceM <= 10
        ? 1.0
        : signals.geoDistanceM <= 50
          ? 0.9
          : signals.geoDistanceM <= 100
            ? 0.7
            : signals.geoDistanceM <= 500
              ? 0.4
              : 0.1;
    factors.push({
      name: 'geo_proximity',
      score: geoScore,
      weight: 0.15,
      label: `${signals.geoDistanceM}m apart`,
    });
  }

  if (signals.timeDiffMin != null) {
    const timeScore =
      signals.timeDiffMin === 0
        ? 1.0
        : signals.timeDiffMin <= 5
          ? 0.95
          : signals.timeDiffMin <= 10
            ? 0.85
            : signals.timeDiffMin <= 30
              ? 0.6
              : signals.timeDiffMin <= 60
                ? 0.3
                : 0.1;
    factors.push({
      name: 'time_proximity',
      score: timeScore,
      weight: 0.15,
      label: `${signals.timeDiffMin}min diff`,
    });
  }

  factors.push({
    name: 'category_match',
    score: signals.categoryMatch ? 1.0 : 0.3,
    weight: 0.1,
    label: signals.categoryMatch ? 'Same category' : 'Different category',
  });

  if (signals.sourceMatch) {
    factors.push({
      name: 'source_match',
      score: 1.0,
      weight: 0.05,
      label: 'Same source',
    });
  }

  if (signals.yearMatch === false) {
    factors.push({
      name: 'year_mismatch',
      score: 0.0,
      weight: 0.2,
      label: 'Different year',
    });
  }

  return computeConfidence(factors, {
    auto_correct: 0.9,
    needs_review: 0.6,
  });
}

export function computeValidationConfidence(signals: {
  detectionCertainty: number;
  fixSafety: number;
  hasFix: boolean;
}): ConfidenceResult {
  const factors: ConfidenceFactor[] = [
    {
      name: 'detection_certainty',
      score: signals.detectionCertainty,
      weight: 0.5,
      label: 'Detection certainty',
    },
    {
      name: 'fix_safety',
      score: signals.fixSafety,
      weight: signals.hasFix ? 0.4 : 0.1,
      label: signals.hasFix ? 'Fix safety' : 'No fix available',
    },
  ];

  if (!signals.hasFix) {
    factors.push({
      name: 'no_fix',
      score: 0.5,
      weight: 0.4,
      label: 'Manual review needed (no auto-fix)',
    });
  }

  return computeConfidence(factors);
}

export function computeGeoConfidence(signals: {
  nameMatchQuality: number;
  resolvedViaAlias: boolean;
  ambiguous: boolean;
  countryContextAvailable: boolean;
}): ConfidenceResult {
  const factors: ConfidenceFactor[] = [
    {
      name: 'name_match',
      score: signals.nameMatchQuality,
      weight: 0.4,
      label: 'Name match quality',
    },
    {
      name: 'resolution_method',
      score: signals.resolvedViaAlias ? 0.8 : 1.0,
      weight: 0.2,
      label: signals.resolvedViaAlias ? 'Resolved via alias' : 'Direct match',
    },
    {
      name: 'ambiguity',
      score: signals.ambiguous ? (signals.countryContextAvailable ? 0.7 : 0.4) : 1.0,
      weight: 0.25,
      label: signals.ambiguous ? 'Ambiguous (multiple candidates)' : 'Unambiguous',
    },
    {
      name: 'country_context',
      score: signals.countryContextAvailable ? 1.0 : 0.6,
      weight: 0.15,
      label: signals.countryContextAvailable ? 'Country context available' : 'No country context',
    },
  ];

  return computeConfidence(factors);
}
