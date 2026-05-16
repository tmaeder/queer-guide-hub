/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useTrackEvent', () => ({ useTrackEvent: () => ({ track: vi.fn() }) }));
vi.mock('@/hooks/useEntityTripStatus', () => ({ useEntityTripStatus: () => ({ data: null, isLoading: false }) }));
vi.mock('@/hooks/useVenueSocialSignals', () => ({ useVenueSocialSignals: () => ({ data: null }) }));
vi.mock('@/hooks/useEvents', () => ({ useEvents: () => ({ events: [], loading: false, fetchEvents: vi.fn() }) }));
vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));

import VenueDetail from '../VenueDetail';

describe('VenueDetail', () => {
  it('renders without crashing', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(
      <MemoryRouter initialEntries={['/venues/v1']}>
        <QueryClientProvider client={qc}>
          <Routes><Route path="/venues/:slug" element={<VenueDetail />} /></Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
