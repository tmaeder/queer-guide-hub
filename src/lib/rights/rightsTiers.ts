// src/lib/rights/rightsTiers.ts
import type { RightsCountry } from '@/hooks/useIntentData';
import { hasAnyCriminalizationSignal, tierForScore } from '@/utils/equalityScore';

export type Tier = 'protected' | 'mixed' | 'restricted' | 'unscored';

export const TIER_LABEL: Record<Tier, string> = {
  protected: 'Protected',
  mixed: 'Mixed',
  restricted: 'Restricted',
  unscored: 'Not scored',
};

export const TIER_ORDER: readonly Tier[] = ['protected', 'mixed', 'restricted', 'unscored'];

/**
 * Bucket a country for the world list.
 *
 * These cutoffs deliberately do NOT come from `EQUALITY_TIER_CUTOFFS`, even
 * though that constant documents itself as the single source of truth and a
 * first pass at this page did adopt it. It is a score-MAGNITUDE scale
 * (very-high/high/moderate/low, breaking at 80/60/40/20); protected/mixed/
 * restricted is a rights-VERDICT scale. Mapping high→protected drops the
 * boundary from 75 to 60 and files North Korea (60), Bahrain (60), Turkey (61)
 * and Vatican City (62) under "Protected" on a page people read to decide
 * whether somewhere is safe to enter.
 *
 * The reason those countries score 60 at all is that `calculateEqualityScore`
 * starts every country at 50 and adds points, so a country with almost no ILGA
 * coverage lands near the middle by default rather than being marked unknown.
 * Until the score is replaced by a categorical verdict, a verdict word cannot
 * be derived from it at the boundary the magnitude scale uses.
 *
 * `unscored` is the honest half of the change and stays: an unscored country
 * used to fall into `mixed`, turning "we hold no data" into a positive claim
 * that partial protections exist.
 */
export const PROTECTED_MIN = 75;
export const MIXED_MIN = 40;

export function tierOf(c: RightsCountry): Tier {
  if (hasAnyCriminalizationSignal(c.lgbti_criminalization)) return 'restricted';
  if (tierForScore(c.equality_score) === 'unknown') return 'unscored';
  const score = c.equality_score as number;
  if (score >= PROTECTED_MIN) return 'protected';
  return score >= MIXED_MIN ? 'mixed' : 'restricted';
}
