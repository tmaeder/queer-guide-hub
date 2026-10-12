/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useSearchActions', () => ({ useTrackClick: () => vi.fn() }));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useUserMode', () => ({
  useUserMode: () => ({ mode: 'community', setMode: vi.fn() }),
}));
// useSearchRecommendations fetches lazily; mock it so the bar renders in
// isolation (matches the other hook mocks here).
vi.mock('@/hooks/useSearchRecommendations', () => ({
  useSearchRecommendations: () => ({ recommendations: [], loading: false }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/useTrendingSuggestions', () => ({
  useTrendingSuggestions: () => ({ trending: [] }),
}));

import { UniversalSearchBar } from '../UniversalSearchBar';

describe('UniversalSearchBar', () => {
  it('closes from the close button without reopening from the field wrapper', async () => {
    render(
      <MemoryRouter>
        <UniversalSearchBar />
      </MemoryRouter>,
    );
    fireEvent.focus(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByRole('button', { name: 'Close search' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders without crashing', () => {
    const { container } = render(
      <MemoryRouter>
        <UniversalSearchBar />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
