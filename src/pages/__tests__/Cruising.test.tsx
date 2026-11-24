/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authState } = vi.hoisted(() => ({
  authState: { user: { id: 'user-1' } as { id: string } | null, loading: false },
}));

vi.mock('@/components/meet/MeetNav', () => ({ MeetNavBar: () => null }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));
vi.mock('@/hooks/useMeta', () => ({ useMeta: () => {} }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | { city?: string }, values?: { city?: string }) => {
      const v = typeof fallback === 'object' ? fallback : values;
      if (key === 'cruising.cityFilter') return `around ${v?.city}`;
      const messages: Record<string, string> = {
        'people.tabs.dating': 'Dating',
        'cruising.openMap': 'Live map',
        'cruising.views.allCities': 'Show all cities',
      };
      return messages[key] ?? key;
    },
  }),
}));
vi.mock('@/pages/intimate/IntimateDiscovery', () => ({
  default: ({ cityIdOverride }: { cityIdOverride?: string }) => (
    <div>dating discovery {cityIdOverride}</div>
  ),
}));

import Cruising from '../Cruising';

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname + loc.search}</div>;
}

function renderPage(path = '/meet/dating') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/meet/dating" element={<Cruising />} />
        <Route path="/meet/nearby" element={<Where />} />
        <Route path="/auth" element={<div>sign in screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authState.user = { id: 'user-1' };
  authState.loading = false;
});

describe('Cruising (/meet/dating)', () => {
  it('redirects signed-out visitors to sign in', () => {
    authState.user = null;
    renderPage();
    expect(screen.getByText('sign in screen')).toBeInTheDocument();
  });

  it('shows dating profiles only, with a link to the live map', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Dating' })).toBeInTheDocument();
    expect(screen.getByText(/^dating discovery/)).toBeInTheDocument();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.getByRole('link', { name: 'Live map' })).toHaveAttribute('href', '/meet/nearby');
  });

  it('filters to a city from a dating area on the map, and clears it', () => {
    renderPage('/meet/dating?city=city-zh&in=Z%C3%BCrich');
    expect(screen.getByText('dating discovery city-zh')).toBeInTheDocument();
    expect(screen.getByText(/around Zürich/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show all cities' }));
    expect(screen.queryByText(/around Zürich/)).toBeNull();
  });

  it('sends old map links to the live map, keeping their layers', () => {
    renderPage('/meet/dating?view=map&layers=spots');
    expect(screen.getByTestId('where').textContent).toBe('/meet/nearby?layers=spots');
  });

  it('sends the old ?panel=spots link to the live map', () => {
    renderPage('/meet/dating?panel=spots');
    expect(screen.getByTestId('where').textContent).toBe('/meet/nearby');
  });
});
