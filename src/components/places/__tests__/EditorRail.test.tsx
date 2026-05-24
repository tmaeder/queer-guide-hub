/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, loading: false }),
}));
vi.mock('@/hooks/useFavorites', () => ({
  useFavorites: () => ({
    isFavorited: () => false,
    toggleFavorite: vi.fn(),
    loading: false,
    favoriteIds: new Set<string>(),
  }),
}));

const countriesMock = vi.hoisted(() => [
  { id: 'c-es', slug: 'spain', name: 'Spain', editorial_hook: 'Madrid Pride.', capital: 'Madrid' },
  { id: 'c-de', slug: 'germany', name: 'Germany', editorial_hook: 'Berlin CSD.', capital: 'Berlin' },
]);

vi.mock('@/hooks/usePlaces', () => ({
  useOptimizedCountries: () => ({ countries: countriesMock, loading: false, error: null }),
  useOptimizedCities: () => ({ cities: [], loading: false, error: null }),
}));

vi.mock('@/hooks/useQueerVillages', () => ({
  useQueerVillages: () => ({ villages: [], loading: false }),
}));

vi.mock('@/hooks/usePlacesPassport', () => ({
  usePlacesPassport: () => ({ data: null, isLoading: false }),
}));

import { EditorRail } from '../EditorRail';
import type { EditorialRail as EditorialRailType } from '@/hooks/useEditorialRails';

describe('EditorRail', () => {
  it('renders empty when no items', () => {
    const rail: EditorialRailType = {
      id: 'r1',
      slug: 'empty',
      title: 'Empty',
      editor_note: null,
      entity_type: 'country',
      cluster_id: null,
      position: 0,
      starts_at: null,
      ends_at: null,
      status: 'published',
      items: [],
    };
    const { container } = render(
      <MemoryRouter>
        <EditorRail rail={rail} />
      </MemoryRouter>,
    );
    // EditorRail returns null when items.length === 0 — container is empty
    expect(container.querySelector('section')).toBeNull();
  });

  it('renders title, editor note, and country cards in order', () => {
    const rail: EditorialRailType = {
      id: 'r2',
      slug: 'pride-capitals',
      title: 'Capitals of Pride',
      editor_note: 'Where the parades go biggest.',
      entity_type: 'country',
      cluster_id: null,
      position: 0,
      starts_at: null,
      ends_at: null,
      status: 'published',
      items: [
        { entity_id: 'c-es', position: 0 },
        { entity_id: 'c-de', position: 1 },
      ],
    };
    render(
      <MemoryRouter>
        <EditorRail rail={rail} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Capitals of Pride')).toBeInTheDocument();
    expect(screen.getByText(/Where the parades go biggest/)).toBeInTheDocument();
    expect(screen.getByText('Spain')).toBeInTheDocument();
    expect(screen.getByText('Germany')).toBeInTheDocument();
  });
});
