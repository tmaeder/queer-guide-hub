// src/lib/rights/__tests__/rightsTiers.test.ts
import { describe, expect, it } from 'vitest';
import { tierOf, TIER_ORDER, TIER_LABEL } from '../rightsTiers';
import type { RightsCountry } from '@/hooks/useIntentData';

const country = (over: Partial<RightsCountry>): RightsCountry => ({
  id: 'x',
  name: 'X',
  slug: 'x',
  code: 'XX',
  equality_score: null,
  lgbti_criminalization: null,
  lgbti_same_sex_unions: null,
  ...over,
});

describe('tierOf', () => {
  it('criminalisation overrides any score', () => {
    expect(tierOf(country({ equality_score: 90, lgbti_criminalization: { legal: false } }))).toBe(
      'restricted',
    );
  });

  it('unscored is its own bucket, never mixed', () => {
    expect(tierOf(country({ equality_score: null, lgbti_criminalization: {} }))).toBe('unscored');
  });

  it('protected starts at 75, not the magnitude scale’s 60', () => {
    expect(tierOf(country({ equality_score: 75, lgbti_criminalization: { legal: true } }))).toBe(
      'protected',
    );
    // North Korea’s formula-default 60 must not read as protected.
    expect(tierOf(country({ equality_score: 60, lgbti_criminalization: { legal: true } }))).toBe(
      'mixed',
    );
  });

  it('mixed floor is 40', () => {
    expect(tierOf(country({ equality_score: 40, lgbti_criminalization: { legal: true } }))).toBe(
      'mixed',
    );
    expect(tierOf(country({ equality_score: 39, lgbti_criminalization: { legal: true } }))).toBe(
      'restricted',
    );
  });

  it('order and labels cover all four tiers', () => {
    expect(TIER_ORDER).toEqual(['protected', 'mixed', 'restricted', 'unscored']);
    for (const t of TIER_ORDER) expect(TIER_LABEL[t]).toBeTruthy();
  });
});
