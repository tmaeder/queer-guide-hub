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

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));
vi.mock('@/hooks/useMeta', () => ({ useMeta: () => {} }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count?: number }) => {
      const messages: Record<string, string> = {
        'cruising.title': 'Cruise the queer map',
        'cruising.tabs.people': 'Nearby people',
        'cruising.tabs.spots': 'All spots',
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
  }: {
    onSearchArea: (bounds: { west: number; south: number; east: number; north: number }) => void;
  }) => (
    <button
      type="button"
      data-testid="cruising-map"
      onClick={() => onSearchArea({ west: 5, south: 45, east: 11, north: 48 })}
    >
      interactive map
    </button>
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

  it('renders the interactive map and complete spot list for a signed-in user', () => {
    renderPage();

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

  it('opens dating discovery inside the people panel', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Nearby people' }));

    expect(screen.getByText(/^dating discovery/)).toBeInTheDocument();
    expect(screen.getByText('presence control')).toBeInTheDocument();
  });
});
