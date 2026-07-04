export type LegalityLevel = 'protected' | 'mixed' | 'restricted';

export interface LegalityBadge {
  level: LegalityLevel;
  label: string;
  ariaLabel: string;
}

interface CountryLegalityInput {
  equality_score?: number | null;
  lgbti_criminalization?: unknown;
}

// Canonical parsing of countries.lgbti_criminalization lives in
// utils/equalityScore.ts — this alias keeps existing badge callers stable.
import { hasAnyCriminalizationSignal as hasCriminalizationFlag } from '@/utils/equalityScore';

export { hasCriminalizationFlag };

export function getLegalityBadge(country: CountryLegalityInput | null | undefined): LegalityBadge | null {
  if (!country) return null;

  const score = country.equality_score;
  const criminalized = hasCriminalizationFlag(country.lgbti_criminalization);

  if (criminalized) {
    return {
      level: 'restricted',
      label: 'Restrictions apply',
      ariaLabel: 'LGBTQ+ legal status: restrictions or criminalization may apply',
    };
  }

  if (typeof score === 'number') {
    if (score >= 75) {
      return {
        level: 'protected',
        label: 'LGBTQ+ legal',
        ariaLabel: `LGBTQ+ legal status: protections in place (equality score ${score})`,
      };
    }
    if (score >= 40) {
      return {
        level: 'mixed',
        label: 'Mixed protections',
        ariaLabel: `LGBTQ+ legal status: mixed protections (equality score ${score})`,
      };
    }
    return {
      level: 'restricted',
      label: 'Restrictions apply',
      ariaLabel: `LGBTQ+ legal status: limited or no protections (equality score ${score})`,
    };
  }

  return null;
}
