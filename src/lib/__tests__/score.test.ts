import { describe, it, expect } from 'vitest';
import {
  communityLevel,
  pointsForCommunityLevel,
  communityTierName,
  progressToNextCommunityLevel,
  pointsToNextLevel,
  MAX_COMMUNITY_LEVEL,
  COMMUNITY_DOMAINS,
  DOMAIN_LABELS,
} from '../score';

describe('communityLevel', () => {
  it('returns 1 for zero or negative points', () => {
    expect(communityLevel(0)).toBe(1);
    expect(communityLevel(-50)).toBe(1);
  });

  it('crosses to level 2 at 100 points', () => {
    expect(communityLevel(99)).toBe(1);
    expect(communityLevel(100)).toBe(2);
  });

  it('matches floor(sqrt(p/100))+1 for sampled mid values', () => {
    expect(communityLevel(400)).toBe(3); // sqrt(4)=2 +1
    expect(communityLevel(900)).toBe(4); // sqrt(9)=3 +1
    expect(communityLevel(2500)).toBe(6); // sqrt(25)=5 +1
  });

  it('caps at MAX_COMMUNITY_LEVEL', () => {
    expect(communityLevel(1_000_000)).toBe(MAX_COMMUNITY_LEVEL);
  });
});

describe('pointsForCommunityLevel <-> communityLevel inverse', () => {
  it('round-trips: communityLevel(pointsForCommunityLevel(n)) === n', () => {
    for (let n = 1; n <= MAX_COMMUNITY_LEVEL; n++) {
      expect(communityLevel(pointsForCommunityLevel(n))).toBe(n);
    }
  });

  it('returns 0 for level 1', () => {
    expect(pointsForCommunityLevel(1)).toBe(0);
  });
});

describe('communityTierName', () => {
  it('returns Newcomer for levels 1-5', () => {
    for (let n = 1; n <= 5; n++) expect(communityTierName(n)).toBe('Newcomer');
  });

  it('returns Explorer for levels 6-10', () => {
    for (let n = 6; n <= 10; n++) expect(communityTierName(n)).toBe('Explorer');
  });

  it('returns Icon for level 50', () => {
    expect(communityTierName(50)).toBe('Icon');
  });

  it('clamps out-of-range levels to a valid tier', () => {
    expect(communityTierName(0)).toBe('Newcomer');
    expect(communityTierName(999)).toBe('Icon');
  });
});

describe('progressToNextCommunityLevel', () => {
  it('is 0 at the floor of a level', () => {
    expect(progressToNextCommunityLevel(pointsForCommunityLevel(3), 3)).toBe(0);
  });

  it('is ~1 just before the next level', () => {
    const ceil = pointsForCommunityLevel(4);
    expect(progressToNextCommunityLevel(ceil - 1, 3)).toBeGreaterThan(0.9);
  });

  it('is 1 at max level', () => {
    expect(progressToNextCommunityLevel(999_999, MAX_COMMUNITY_LEVEL)).toBe(1);
  });
});

describe('pointsToNextLevel', () => {
  it('matches ceil - current at floor of level', () => {
    const floor3 = pointsForCommunityLevel(3);
    const ceil = pointsForCommunityLevel(4);
    expect(pointsToNextLevel(floor3, 3)).toBe(ceil - floor3);
  });

  it('returns 0 at max level', () => {
    expect(pointsToNextLevel(999_999, MAX_COMMUNITY_LEVEL)).toBe(0);
  });
});

describe('domain catalog', () => {
  it('every domain has a label', () => {
    for (const d of COMMUNITY_DOMAINS) {
      expect(DOMAIN_LABELS[d]).toBeTruthy();
    }
  });
});
