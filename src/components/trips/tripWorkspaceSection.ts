import type { TripPhase } from './tripPhase';

export type TripWorkspaceSection = 'plan' | 'prepare' | 'together';

export function getTripWorkspaceSection(
  search: URLSearchParams,
  phase: TripPhase = 'plan',
): TripWorkspaceSection {
  const value = search.get('section');
  if (value === 'plan' || value === 'prepare' || value === 'together') return value;
  if (phase === 'countdown') return 'prepare';
  if (phase === 'memory') return 'together';
  return 'plan';
}
