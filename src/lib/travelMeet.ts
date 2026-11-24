import { isUuid } from '@/lib/uuid';

export const TRAVEL_ACTIVITIES = ['coffee', 'culture', 'outdoors', 'nightlife', 'event'] as const;
export type TravelActivity = (typeof TRAVEL_ACTIVITIES)[number];
export interface TravelMeetContext {
  cityId: string;
  start: string;
  end: string;
  activity: TravelActivity | '';
  tripId: string;
  eventId: string;
}
export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function validTravelDates(start: string, end: string): boolean {
  const valid = (s: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s;
  return (
    valid(start) &&
    valid(end) &&
    start >= localToday() &&
    end >= start &&
    Date.parse(end) - Date.parse(start) <= 31 * 86400000
  );
}
export function readTravelMeetContext(params: URLSearchParams): TravelMeetContext {
  const uuid = (key: string) => (isUuid(params.get(key) ?? '') ? params.get(key)! : '');
  const activity = params.get('activity') ?? '';
  return {
    cityId: uuid('cityId'),
    tripId: uuid('tripId'),
    eventId: uuid('eventId'),
    start: params.get('start') ?? '',
    end: params.get('end') ?? '',
    activity: TRAVEL_ACTIVITIES.includes(activity as TravelActivity)
      ? (activity as TravelActivity)
      : '',
  };
}
export function travelMeetHref(context: Partial<TravelMeetContext> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(context)) if (value) params.set(key, value);
  return `/meet/travel${params.size ? `?${params}` : ''}`;
}

/** Match the server gate: unknown criminalisation is distinct from unknown protections. */
export function travelConnectionsAllowed(safety: {
  status: string;
  hasCriminalizedDestination: boolean;
  hasDeathPenaltyRiskDestination: boolean;
  countries: Array<{ lgbti_criminalization: unknown }>;
}): boolean {
  return (
    safety.status === 'ready' &&
    !safety.hasCriminalizedDestination &&
    !safety.hasDeathPenaltyRiskDestination &&
    safety.countries.length > 0 &&
    safety.countries.every((country) => {
      const legal = (country.lgbti_criminalization as { legal?: unknown } | null)?.legal;
      return legal === true || legal === 'true';
    })
  );
}
