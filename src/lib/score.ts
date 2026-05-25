// Community Score helpers — formulas + names for the unified XP system.
// Mirrors public.compute_community_level in
// supabase/migrations/20260525100000_unified_activity_score.sql.

export type CommunityDomain =
  | 'venue'
  | 'marketplace'
  | 'group'
  | 'event'
  | 'trip'
  | 'profile'
  | 'social'
  | 'contribution'
  | 'dating';

export const COMMUNITY_DOMAINS: CommunityDomain[] = [
  'venue',
  'marketplace',
  'group',
  'event',
  'trip',
  'profile',
  'social',
  'contribution',
  'dating',
];

export const MAX_COMMUNITY_LEVEL = 50;

// 50 levels grouped in 10 named tiers of 5 levels each.
const TIER_NAMES = [
  'Newcomer',
  'Explorer',
  'Local',
  'Regular',
  'Curator',
  'Champion',
  'Ambassador',
  'Insider',
  'Legend',
  'Icon',
] as const;

export function communityLevel(points: number): number {
  const safe = Math.max(0, Math.floor(points));
  const lvl = Math.floor(Math.sqrt(safe / 100)) + 1;
  return Math.min(MAX_COMMUNITY_LEVEL, Math.max(1, lvl));
}

export function pointsForCommunityLevel(level: number): number {
  // Inverse of communityLevel: points = (level - 1)^2 * 100.
  const clamped = Math.min(MAX_COMMUNITY_LEVEL, Math.max(1, Math.floor(level)));
  return Math.pow(clamped - 1, 2) * 100;
}

export function communityTierName(level: number): string {
  const clamped = Math.min(MAX_COMMUNITY_LEVEL, Math.max(1, Math.floor(level)));
  const tierIdx = Math.min(TIER_NAMES.length - 1, Math.floor((clamped - 1) / 5));
  return TIER_NAMES[tierIdx];
}

export function progressToNextCommunityLevel(points: number, level?: number): number {
  const lvl = level ?? communityLevel(points);
  if (lvl >= MAX_COMMUNITY_LEVEL) return 1;
  const floor = pointsForCommunityLevel(lvl);
  const ceil = pointsForCommunityLevel(lvl + 1);
  if (ceil <= floor) return 1;
  return Math.min(1, Math.max(0, (points - floor) / (ceil - floor)));
}

export function pointsToNextLevel(points: number, level?: number): number {
  const lvl = level ?? communityLevel(points);
  if (lvl >= MAX_COMMUNITY_LEVEL) return 0;
  return Math.max(0, pointsForCommunityLevel(lvl + 1) - points);
}

export const DOMAIN_LABELS: Record<CommunityDomain, string> = {
  venue: 'Venues',
  marketplace: 'Marketplace',
  group: 'Groups',
  event: 'Events',
  trip: 'Trips',
  profile: 'Profile',
  social: 'Friends',
  contribution: 'Contributions',
  dating: 'Dating',
};
