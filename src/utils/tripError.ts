const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TripErrorKind =
  | 'invalid-id'
  | 'not-found'
  | 'permission-denied'
  | 'load-error';

export function isValidTripId(id: string | undefined | null): boolean {
  return !!id && UUID_RE.test(id);
}

export function classifyTripError(
  tripId: string | undefined | null,
  error: unknown,
  trip: unknown,
): TripErrorKind | null {
  if (!tripId) return 'invalid-id';
  if (!isValidTripId(tripId)) return 'invalid-id';

  if (error) {
    const e = error as { code?: string; status?: number; message?: string };
    // PostgREST: 0 rows returned from .single()
    if (e.code === 'PGRST116') return 'not-found';
    // Invalid UUID syntax reached the DB
    if (e.code === '22P02') return 'invalid-id';
    // RLS / permission denied
    if (e.code === '42501' || e.status === 401 || e.status === 403) {
      return 'permission-denied';
    }
    return 'load-error';
  }

  if (!trip) return 'not-found';
  return null;
}
