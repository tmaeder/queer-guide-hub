import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTrips, type TripListItem } from '@/hooks/useTrips';
import { useAuth } from '@/hooks/useAuth';
import { getTripPhase } from '@/components/trips/tripPhase';

const STORAGE_KEY = 'qg.activeTripId';
const DISMISS_KEY = 'qg.activeTripDismissed';

interface ActiveTripContextValue {
  /** The trip currently treated as the user's active context, or null. */
  activeTrip: TripListItem | null;
  /** Manually pin a trip as active. Pass null to clear the pin. */
  setActiveTripId: (id: string | null) => void;
  /** Dismiss the context bar for this trip until user re-pins. */
  dismiss: () => void;
  /** Re-show after dismiss. */
  undismiss: () => void;
  /** True if user dismissed the bar for the current active trip. */
  isDismissed: boolean;
  /** All trips the user is a member of (sorted by start_date asc, then updated_at desc). */
  candidateTrips: TripListItem[];
}

const ActiveTripContext = createContext<ActiveTripContextValue | undefined>(undefined);

/**
 * Pick the "best" active trip when user hasn't manually pinned one.
 * Priority: live > countdown > closest upcoming planning trip > most recently updated.
 * Memory/archived trips are never auto-selected.
 */
function pickDefaultTrip(trips: TripListItem[], now: Date = new Date()): TripListItem | null {
  if (!trips || trips.length === 0) return null;
  const ranked = trips
    .map((t) => ({ trip: t, phase: getTripPhase(t, now) }))
    .filter(({ phase }) => phase !== 'memory');

  const live = ranked.find(({ phase }) => phase === 'live');
  if (live) return live.trip;

  const countdowns = ranked
    .filter(({ phase }) => phase === 'countdown')
    .sort((a, b) => (a.trip.start_date ?? '').localeCompare(b.trip.start_date ?? ''));
  if (countdowns.length > 0) return countdowns[0].trip;

  const planning = ranked
    .filter(({ phase }) => phase === 'plan')
    .sort((a, b) => (a.trip.start_date ?? '').localeCompare(b.trip.start_date ?? ''));
  if (planning.length > 0) return planning[0].trip;

  // seed trips fall through to most recently updated
  const seeds = ranked.filter(({ phase }) => phase === 'seed');
  if (seeds.length > 0) return seeds[0].trip;

  return null;
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // ignore (private mode / quota)
  }
}

export function ActiveTripProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { data: trips } = useTrips();

  const [pinnedId, setPinnedId] = useState<string | null>(() => readStorage(STORAGE_KEY));
  const [dismissedId, setDismissedId] = useState<string | null>(() => readStorage(DISMISS_KEY));

  // Reset pin if user signs out
  useEffect(() => {
    if (!user) {
      setPinnedId(null);
      setDismissedId(null);
    }
  }, [user]);

  const activeTrip = useMemo<TripListItem | null>(() => {
    if (!trips || trips.length === 0) return null;
    if (pinnedId) {
      const pinned = trips.find((t) => t.id === pinnedId);
      if (pinned) return pinned;
    }
    return pickDefaultTrip(trips);
  }, [trips, pinnedId]);

  const setActiveTripId = useCallback((id: string | null) => {
    setPinnedId(id);
    writeStorage(STORAGE_KEY, id);
    // Re-show bar when explicitly re-pinned
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

export function useActiveTrip(): ActiveTripContextValue {
  const ctx = useContext(ActiveTripContext);
  if (!ctx) {
    throw new Error('useActiveTrip must be used within ActiveTripProvider');
  }
  return ctx;
}
