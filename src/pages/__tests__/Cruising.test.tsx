/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authState, listMock, mapMock, presenceMock, profileMock } = vi.hoisted(() => ({
  authState: { user: { id: 'user-1' } as { id: string } | null, loading: false },
  listMock: vi.fn(),
  mapMock: vi.fn(),
  presenceMock: vi.fn(),
  profileMock: vi.fn(),
}));

// HubNavBar is page chrome here, and it now reads the inbox count and the
// viewer's profile through react-query. These specs render without a
// QueryClientProvider and are about the page's own content, so stub it —
// hubNavConsistency.test.ts is what asserts the bar is actually present.
vi.mock('@/components/hub/HubNavBar', () => ({ HubNavBar: () => null }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));
vi.mock('@/hooks/useMeta', () => ({ useMeta: () => {} }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count?: number }) => {
      const messages: Record<string, string> = {
        'cruising.title': 'Cruise the queer map',
        'cruising.views.profiles': 'Profiles',
        'cruising.views.map': 'Map',
        'cruising.spot.noCoordinates': 'Listed without coordinates',
      };
      if (key === 'cruising.count.spots') return `${values?.count ?? 0} spots`;
      return messages[key] ?? key;
    },
  }),
}));
vi.mock('@/hooks/useIntimateProfile', () => ({
  useMyIntimateProfile: profileMock,
}));
vi.mock('@/hooks/useCruisingGuide', () => ({
  useCruisingSpotsList: listMock,
  useCruisingMapSpots: mapMock,
  useCruisingPresenceAreas: presenceMock,
}));
vi.mock('@/components/cruising/CruisingMapPanel', () => ({
  CruisingMapPanel: ({
    onSearchArea,
    onSelectArea,
  }: {
    onSearchArea: (bounds: { west: number; south: number; east: number; north: number }) => void;
    onSelectArea: (area: { city_id: string; city_name: string; active_count: number }) => void;
  }) => (
    <>
      <button
        type="button"
        data-testid="cruising-map"
        onClick={() => onSearchArea({ west: 5, south: 45, east: 11, north: 48 })}
      >
        interactive map
      </button>
      <button
        type="button"
        onClick={() => onSelectArea({ city_id: 'city-zh', city_name: 'Zürich', active_count: 3 })}
      >
        people area
      </button>
    </>
  ),
}));
vi.mock('@/components/cruising/CruisingPresenceControl', () => ({
  CruisingPresenceControl: () => <div>presence control</div>,
}));
vi.mock('@/pages/intimate/IntimateDiscovery', () => ({
  default: ({ cityIdOverride }: { cityIdOverride?: string }) => (
    <div>dating discovery {cityIdOverride}</div>
  ),
}));

import Cruising from '../Cruising';

function renderPage(path = '/cruising') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/cruising" element={<Cruising />} />
        <Route path="/auth" element={<div>sign in screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  authState.user = { id: 'user-1' };
  authState.loading = false;
  profileMock.mockReturnValue({ data: { opted_in_at: '2026-10-06T12:00:00Z' } });
  listMock.mockReturnValue({
    data: {
      spots: [
        {
          id: 'spot-1',
          slug: 'old-bridge',
          name: 'Old Bridge',
          city: 'Zürich',
          state: null,
          country: 'Switzerland',
          description: 'A listed spot',
          latitude: null,
          longitude: null,
          verified: true,
        },
      ],
      total: 1,
    },
    isLoading: false,
    isError: false,
  });
  mapMock.mockReturnValue({ data: [] });
  presenceMock.mockReturnValue({ data: [] });
  vi.clearAllMocks();
});

describe('Cruising', () => {
  it('redirects signed-out visitors before any query can run', () => {
    authState.user = null;
    renderPage('/cruising?panel=people');

    expect(screen.getByText('sign in screen')).toBeInTheDocument();
    expect(listMock).toHaveBeenCalledWith(false, '', 1, 40);
    expect(mapMock).toHaveBeenCalledWith(false, '', null);
    expect(presenceMock).toHaveBeenCalledWith(false);
  });

  it('renders the interactive map and complete spot list in the map view', () => {
    renderPage('/cruising?view=map');

    expect(screen.getByRole('heading', { name: 'Cruise the queer map' })).toBeInTheDocument();
    expect(screen.getByTestId('cruising-map')).toBeInTheDocument();
    expect(screen.getByText('Old Bridge')).toBeInTheDocument();
    expect(screen.getByText('Listed without coordinates')).toBeInTheDocument();
    expect(listMock).toHaveBeenCalledWith(true, '', 1, 40);
    expect(mapMock).toHaveBeenCalledWith(true, '', null);

    fireEvent.click(screen.getByTestId('cruising-map'));
    expect(mapMock).toHaveBeenLastCalledWith(true, '', {
      west: 5,
      south: 45,
      east: 11,
      north: 48,
    });
  });

  it('opens the profiles view for an opted-in member and skips the map queries', () => {
    renderPage();

    expect(screen.getByRole('tab', { name: 'Profiles' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/^dating discovery/)).toBeInTheDocument();
    expect(screen.queryByTestId('cruising-map')).toBeNull();
    expect(listMock).toHaveBeenCalledWith(false, '', 1, 40);
  });

  it('opens the map view for a member who is not opted in', () => {
    profileMock.mockReturnValue({ data: null });
    renderPage();

    expect(screen.getByRole('tab', { name: 'Map' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('cruising-map')).toBeInTheDocument();
    expect(screen.getByText('presence control')).toBeInTheDocument();
  });

  it('reads the old ?panel= links', () => {
    renderPage('/cruising?panel=spots');
    expect(screen.getByTestId('cruising-map')).toBeInTheDocument();
  });

  it('opens a people area from the map as profiles filtered to that city', () => {
    renderPage('/cruising?view=map');
    fireEvent.click(screen.getByText('people area'));

    expect(screen.getByRole('tab', { name: 'Profiles' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('dating discovery city-zh')).toBeInTheDocument();
  });
});
