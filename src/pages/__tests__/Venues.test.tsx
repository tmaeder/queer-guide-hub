/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useVenues', () => ({ useVenues: () => ({ venues: [], loading: false, error: null, hasMore: false, datasetTotal: 0, filteredTotal: 0, fetchVenues: vi.fn(), loadingTimedOut: false }) }));
vi.mock('@/hooks/useRecentVenues', () => ({ useRecentVenues: () => ({ venues: [], loading: false }) }));
vi.mock('@/hooks/useEvents', () => ({ useEvents: () => ({ events: [], loading: false, fetchEvents: vi.fn() }) }));
vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));

import Venues from '../Venues';

describe('Venues', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><Venues /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
