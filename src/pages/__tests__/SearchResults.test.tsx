/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useSearch', () => {
  const response = { results: [], loading: false, totalHits: 0, resultsKey: 'test', refetch: vi.fn() };
  return { useSearch: () => response };
});
vi.mock('@/hooks/useSearchActions', () => ({ useTrackClick: () => vi.fn(), useFeedbackVote: () => vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));

import SearchResults from '../SearchResults';

describe('SearchResults', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><SearchResults /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
