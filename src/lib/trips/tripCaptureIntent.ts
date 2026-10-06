export const TRIP_CAPTURE_STORAGE_KEY = 'qg.pendingTripCapture';
export const TRIP_CAPTURE_TTL_MS = 24 * 60 * 60 * 1000;

export interface TripDestinationRef {
  cityId: string;
  cityName: string;
  countryId: string;
  countryName: string;
  countryCode: string | null;
  timezone: string | null;
}

export interface TripEntityRef {
  type: 'venue' | 'event' | 'hotel';
  id: string;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  city_id?: string | null;
  country_id?: string | null;
  address?: string | null;
  category?: string | null;
}

export type TripCaptureIntent =
  | {
      kind: 'start_destination';
      destination: TripDestinationRef;
      startDate?: string;
      endDate?: string;
    }
  | { kind: 'add_entity'; entity: TripEntityRef }
  | { kind: 'add_collection'; entityIds: string[]; cityName?: string }
  | { kind: 'open_active_trip' };

export interface StoredTripCapture {
  intent: TripCaptureIntent;
  source: string;
  returnTo: string;
  createdAt: number;
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function storeTripCapture(
  intent: TripCaptureIntent,
  options: { source: string; returnTo: string; now?: number },
): StoredTripCapture {
  const value: StoredTripCapture = {
    intent,
    source: options.source,
    returnTo: options.returnTo,
    createdAt: options.now ?? Date.now(),
  };
  storage()?.setItem(TRIP_CAPTURE_STORAGE_KEY, JSON.stringify(value));
  return value;
}

export function readTripCapture(now = Date.now()): StoredTripCapture | null {
  const raw = storage()?.getItem(TRIP_CAPTURE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredTripCapture;
    if (
      !parsed ||
      typeof parsed.createdAt !== 'number' ||
      typeof parsed.returnTo !== 'string' ||
      typeof parsed.source !== 'string' ||
      !parsed.intent ||
      now - parsed.createdAt > TRIP_CAPTURE_TTL_MS
    ) {
      clearTripCapture();
      return null;
    }
    return parsed;
  } catch {
    clearTripCapture();
    return null;
  }
}

export function clearTripCapture(): void {
  storage()?.removeItem(TRIP_CAPTURE_STORAGE_KEY);
}
