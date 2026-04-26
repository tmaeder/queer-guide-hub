import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTrips, type TripListItem } from '@/hooks/useTrips';
import { useAuth } from '@/hooks/useAuth';
import { getTripPhase } from '@/components/trips/tripPhase';

const STORAGE_KEY = 'qg.activeTripId';
const DISMISS_KEY = 'qg.activeTripDismissed';

interface ActiveTripContextValue {
  activeTrip: TripListItem | null;
  setActiveTripId: (id: string | null) => void;
  dismiss: () => void;
  undismiss: () => void;
  isDismissed: boolean;
  candidateTrips: TripListItem[];
}

const ActiveTripContext = createContext<ActiveTripContextValue | undefined>(undefined);

/**
 * Pick the "best" trip to auto-surface in the global context bar.
 *
 * Only auto-pick when there is real, current context worth interrupting the
 * global UI for:
 *   - `live`: happening right now, or
 *   - `countdown` (< 14 days) AND user has started planning (has places or days).
 *
 * Planning-only, seed (no dates), and memory/archived trips are never
 * auto-picked. Users can still pin them explicitly via `setActiveTripId`.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function pickDefaultTrip(trips: TripListItem[], now: Date = new Date()): TripListItem | null {
  if (!trips || trips.length === 0) return null;
  const ranked = trips
    .map((t) => ({ trip: t, phase: getTripPhase(t, now) }))
    .filter(({ phase }) => phase !== 'memory');

  const live = ranked.find(({ phase }) => phase === 'live');
  if (live) return live.trip;

  const countdowns = ranked
    .filter(({ phase, trip }) => phase === 'countdown' && (trip.place_count > 0 || trip.day_count > 0))
    .sort((a, b) => (a.trip.start_date ?? '').localeCompare(b.trip.start_date ?? ''));
  if (countdowns.length > 0) return countdowns[0].trip;

  return null;
}

function readStorage(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* ignore */ }
}

export function ActiveTripProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { data: trips } = useTrips();

  const [pinnedId, setPinnedId] = useState<string | null>(() => readStorage(STORAGE_KEY));
  const [dismissedId, setDismissedId] = useState<string | null>(() => readStorage(DISMISS_KEY));

  useEffect(() => {
    if (!user) {
      setPinnedId(null);
      setDismissedId(null);
      writeStorage(STORAGE_KEY, null);
      writeStorage(DISMISS_KEY, null);
    }
  }, [user]);

  useEffect(() => {
    if (!dismissedId || !trips) return;
    if (!trips.some((t) => t.id === dismissedId)) {
      setDismissedId(null);
      writeStorage(DISMISS_KEY, null);
    }
  }, [dismissedId, trips]);

  const activeTrip = useMemo<TripListItem | null>(() => {
    if (!user) return null;
    if (!trips || trips.length === 0) return null;
    if (pinnedId) {
      const pinned = trips.find((t) => t.id === pinnedId);
      if (pinned) return pinned;
    }
    return pickDefaultTrip(trips);
  }, [user, trips, pinnedId]);

  const setActiveTripId = useCallback((id: string | null) => {
    setPinnedId(id);
    writeStorage(STORAGE_KEY, id);
    setDismissedId(null);
    writeStorage(DISMISS_KEY, null);
  }, []);

  const dismiss = useCallback(() => {
    if (!activeTrip) return;
    setDismissedId(activeTrip.id);
    writeStorage(DISMISS_KEY, activeTrip.id);
  }, [activeTrip]);

  const undismiss = useCallback(() => {
    setDismissedId(null);
    writeStorage(DISMISS_KEY, null);
  }, []);

  const value = useMemo<ActiveTripContextValue>(
    () => ({
      activeTrip,
      setActiveTripId,
      dismiss,
      undismiss,
      isDismissed: !!activeTrip && dismissedId === activeTrip.id,
      candidateTrips: trips ?? [],
    }),
    [activeTrip, setActiveTripId, dismiss, undismiss, dismissedId, trips],
  );

  return <ActiveTripContext.Provider value={value}>{children}</ActiveTripContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useActiveTrip(): ActiveTripContextValue {
  const ctx = useContext(ActiveTripContext);
  if (!ctx) throw new Error('useActiveTrip must be used within ActiveTripProvider');
  return ctx;
}
