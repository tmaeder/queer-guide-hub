/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
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

import { UniversalSearchBar } from '../UniversalSearchBar';

describe('UniversalSearchBar', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><UniversalSearchBar /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
