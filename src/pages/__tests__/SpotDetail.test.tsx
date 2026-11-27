/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

const kindState = vi.hoisted(() => ({ data: null as string | null, isLoading: false }));
vi.mock('@/hooks/useSpotKind', () => ({ useSpotKind: () => kindState }));
vi.mock('../EntityDetail', () => ({
  default: ({ source }: { source: string }) => <div data-testid="entity" data-source={source} />,
}));

import SpotDetail from '../SpotDetail';

function renderAt(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/spots/${slug}`]}>
      <Routes>
        <Route path="/spots/:slug" element={<SpotDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SpotDetail', () => {
  beforeEach(() => {
    kindState.data = null;
    kindState.isLoading = false;
  });

  it('renders the organisation page for an organisation slug', () => {
    kindState.data = 'organization';
    renderAt('acme');
    expect(screen.getByTestId('entity').dataset.source).toBe('organization');
  });

  it('renders the venue page for a place slug', () => {
    kindState.data = 'place';
    renderAt('berghain');
    expect(screen.getByTestId('entity').dataset.source).toBe('venue');
  });

  it('lets the venue page handle an unknown slug (not-found, redirects, gate)', () => {
    renderAt('nothing');
    expect(screen.getByTestId('entity').dataset.source).toBe('venue');
  });

  it('waits for the answer instead of guessing', () => {
    kindState.isLoading = true;
    renderAt('berghain');
    expect(screen.queryByTestId('entity')).toBeNull();
  });
});
