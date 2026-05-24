/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, loading: false }),
}));

vi.mock('@/hooks/useFavorites', () => ({
  useFavorites: () => ({
    isFavorited: () => false,
    toggleFavorite: vi.fn(),
    loading: false,
    favoriteIds: new Set<string>(),
  }),
}));

import { GeoCard } from '../GeoCard';

describe('GeoCard', () => {
  it('renders a country card with editorial hook and capital fallback hidden when hook present', () => {
    render(
      <MemoryRouter>
        <GeoCard
          variant="country"
          id="c1"
          slug="spain"
          name="Spain"
          editorialHook="Madrid Pride is the largest in Europe."
          capital="Madrid"
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Spain')).toBeInTheDocument();
    expect(screen.getByText(/Madrid Pride is the largest/)).toBeInTheDocument();
    // Capital should NOT show as fallback because editorialHook is present
    expect(screen.queryByText('Madrid')).not.toBeInTheDocument();
  });

  it('falls back to capital when editorial hook is missing', () => {
    render(
      <MemoryRouter>
        <GeoCard variant="country" id="c2" slug="portugal" name="Portugal" capital="Lisbon" />
      </MemoryRouter>,
    );
    expect(screen.getByText('Lisbon')).toBeInTheDocument();
  });

  it('shows visited stamp overlay when visited prop is true', () => {
    render(
      <MemoryRouter>
        <GeoCard variant="country" id="c3" slug="de" name="Germany" visited />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Visited/i)).toBeInTheDocument();
  });

  it('hides visited stamp when not visited', () => {
    render(
      <MemoryRouter>
        <GeoCard variant="country" id="c4" slug="x" name="X" visited={false} />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/Visited/i)).not.toBeInTheDocument();
  });

  it('shows save button when user is signed in', () => {
    render(
      <MemoryRouter>
        <GeoCard variant="city" id="c5" slug="berlin" name="Berlin" countryName="Germany" />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText(/Save Berlin/)).toBeInTheDocument();
  });
});
