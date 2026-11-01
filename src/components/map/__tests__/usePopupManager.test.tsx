import { describe, it, expect, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { useEffect, useRef } from 'react';

/**
 * The popup card is portalled into MapLibre's popup node, so it must see every
 * provider of the app tree. It used to be a separate createRoot with contexts
 * bridged one at a time, and a missing one crashed every popup: production
 * threw "useActiveTrip must be used within ActiveTripProvider" and then
 * "useNavigate() may be used only in the context of a <Router>" (2026-11-01).
 */

const containers: HTMLElement[] = [];

vi.mock('maplibre-gl', () => ({
  Popup: class {
    setLngLat() {
      return this;
    }
    setDOMContent(el: HTMLElement) {
      containers.push(el);
      return this;
    }
    addTo() {
      return this;
    }
    on() {
      return this;
    }
    remove() {}
  },
}));

vi.mock('@/hooks/useHaptics', () => ({ hapticTrigger: () => {} }));

// The real ActiveTripProvider wraps the app; its trip list comes from useTrips.
vi.mock('@/hooks/useTrips', () => ({
  useTrips: () => ({ data: [{ id: 'trip-1', title: 'Zürich weekend' }] }),
}));

// Stand-in for the card: reads the same contexts the real card's trip/auth
// controls do, so a missing bridge throws exactly as in production.
vi.mock('@/components/map/MapEntityCard', async () => {
  const { useActiveTrip } = await import('@/hooks/useActiveTrip');
  const { useAuth } = await import('@/hooks/useAuth');
  const { useNavigate } = await import('react-router');
  return {
    MapEntityCard: () => {
      const trip = useActiveTrip();
      const auth = useAuth();
      useNavigate();
      return (
        <span>
          trip:{trip.activeTrip?.title ?? 'none'} user:{auth.user?.id ?? 'anon'}
        </span>
      );
    },
  };
});

import { usePopupManager } from '@/components/map/hooks/usePopupManager';
import { ActiveTripProvider } from '@/hooks/useActiveTrip';
import type { ReactNode } from 'react';
import { AuthContext } from '@/hooks/useAuth';

const point = {
  id: 'venue-1',
  type: 'venues',
  entity: 'venue',
  line: 'M',
  name: 'Place',
  lng: 8.54,
  lat: 47.37,
  color: 'hsl(0 0% 0%)',
  featured: false,
  live: false,
} as never;

function Providers({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <AuthContext.Provider value={{ user: { id: 'u1' }, loading: false } as never}>
          <ActiveTripProvider>{children}</ActiveTripProvider>
        </AuthContext.Provider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

/** A map host: opens a popup on mount and renders the portal, as ExploreMap does. */
function Host() {
  // Stable refs, as ExploreMap/EntityMap pass them: showPopup's identity depends on them.
  const popupRef = useRef(null);
  const popupRootRef = useRef(null);
  const { showPopup, popupPortal } = usePopupManager({
    navigate: vi.fn(),
    toast: vi.fn(),
    popupRef,
    popupRootRef,
  } as never);
  useEffect(() => {
    showPopup({} as never, [8.54, 47.37], point);
  }, [showPopup]);
  return <>{popupPortal}</>;
}

describe('usePopupManager', () => {
  it('renders the card inside the app tree: router, auth and the active trip all reach it', async () => {
    localStorage.setItem('qg.activeTripId', 'trip-1'); // pin the trip the provider exposes
    act(() => {
      render(
        <Providers>
          <Host />
        </Providers>,
      );
    });
    const el = containers[containers.length - 1];
    await waitFor(() => expect(el.textContent).toContain('trip:Zürich weekend'));
    expect(el.textContent).toContain('user:u1');
  });
});
