import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { AddToTripDialog } from '@/components/trips/AddToTripDialog';
import { CreateTripDialog } from '@/components/trips/CreateTripDialog';
import { useActiveTrip } from '@/hooks/useActiveTrip';
import { useAuth } from '@/hooks/useAuth';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import {
  clearTripCapture,
  readTripCapture,
  type StoredTripCapture,
} from '@/lib/trips/tripCaptureIntent';
import { trackTripEvent } from '@/utils/tripTracking';
import { stripLocale } from '@/lib/locale';

export function TripIntentResume() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useLocalizedNavigate();
  const { openDock } = useActiveTrip();
  const [pending, setPending] = useState<StoredTripCapture | null>(null);

  useEffect(() => {
    if (!user || pending) return;
    const routePath = stripLocale(pathname);
    if (
      routePath === '/auth' ||
      routePath.startsWith('/auth/') ||
      routePath === '/onboarding' ||
      routePath.startsWith('/onboarding/') ||
      routePath === '/claim-username'
    ) {
      return;
    }
    const stored = readTripCapture();
    if (!stored) return;
    clearTripCapture();
    trackTripEvent('trip_intent_resumed', {
      kind: stored.intent.kind,
      source: stored.source,
      auth_state: 'signed_in',
    });
    if (stored.intent.kind === 'open_active_trip') {
      openDock();
      if (pathname !== stored.returnTo) navigate(stored.returnTo, { replace: true });
      return;
    }
    if (stored.intent.kind === 'add_collection') {
      navigate('/hub/saved', { replace: true });
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setPending(stored);
    });
    if (pathname !== stored.returnTo) navigate(stored.returnTo, { replace: true });
    return () => {
      cancelled = true;
    };
  }, [navigate, openDock, pathname, pending, user]);

  if (!pending) return null;
  const close = () => setPending(null);

  if (pending.intent.kind === 'add_entity') {
    return (
      <AddToTripDialog
        open
        onClose={close}
        entity={pending.intent.entity}
        source={pending.source}
      />
    );
  }
  if (pending.intent.kind === 'start_destination') {
    return (
      <CreateTripDialog
        open
        onClose={close}
        initialGeo={pending.intent.destination}
        initialStart={pending.intent.startDate}
        initialEnd={pending.intent.endDate}
        source={pending.source}
      />
    );
  }
  return null;
}
