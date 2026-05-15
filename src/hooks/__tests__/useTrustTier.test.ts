import { describe, it, expect } from 'vitest';
import { TIER_ORDER, TIER_REQUIREMENTS, nextTier } from '../useTrustTier';
import type { TrustTier } from '../useTrustTier';

describe('TIER_ORDER', () => {
  it('lists the five tiers in ascending order', () => {
    expect(TIER_ORDER).toEqual([
      'visitor',
      'local',
      'scout',
      'steward',
      'guardian',
    ]);
  });
});

describe('TIER_REQUIREMENTS', () => {
  it('has thresholds for every non-visitor tier', () => {
    for (const tier of ['local', 'scout', 'steward', 'guardian'] as const) {
      expect(TIER_REQUIREMENTS[tier]).toBeDefined();
    }
  });

  it('scales submissions monotonically through scout → steward', () => {
    expect(TIER_REQUIREMENTS.local.submissions).toBeLessThanOrEqual(
      TIER_REQUIREMENTS.scout.submissions,
    );
    expect(TIER_REQUIREMENTS.scout.submissions).toBeLessThanOrEqual(
      TIER_REQUIREMENTS.steward.submissions,
    );
  });

  it('marks guardian as manual', () => {
    expect(TIER_REQUIREMENTS.guardian.manual).toBe(true);
  });
});

describe('nextTier', () => {
  it.each([
    ['visitor', 'local'],
    ['local', 'scout'],
    ['scout', 'steward'],
    ['steward', 'guardian'],
  ] as Array<[TrustTier, TrustTier]>)('%s → %s', (from, to) => {
    expect(nextTier(from)).toBe(to);
  });

  it('returns null for the top tier', () => {
    expect(nextTier('guardian')).toBeNull();
  });
});
