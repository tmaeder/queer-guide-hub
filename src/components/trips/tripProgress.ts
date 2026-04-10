import type { TripWithDetails } from '@/hooks/useTrips';

export interface TripProgressStep {
  key: 'dates' | 'places' | 'days' | 'companions';
  done: boolean;
}

/**
 * Compute a trip's "planning completeness" from the fields already on
 * TripWithDetails — no extra fetches. Four checkpoints, 0–100%.
 */
export function computeTripProgress(trip: TripWithDetails): {
  percent: number;
  steps: TripProgressStep[];
} {
  const steps: TripProgressStep[] = [
    { key: 'dates', done: Boolean(trip.start_date && trip.end_date) },
    { key: 'places', done: (trip.trip_places?.length ?? 0) > 0 },
    { key: 'days', done: (trip.trip_days?.length ?? 0) > 0 },
    { key: 'companions', done: (trip.trip_members?.length ?? 0) > 1 },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  return { percent: Math.round((doneCount / steps.length) * 100), steps };
}
