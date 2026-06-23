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
vi.mock('@/hooks/useEntityTripStatus', () => ({
  useEntityTripStatus: () => ({ data: null, isLoading: false }),
}));
vi.mock('@/hooks/useVenueSocialSignals', () => ({ useVenueSocialSignals: () => ({ data: null }) }));
vi.mock('@/hooks/useEvents', () => ({
  useEvents: () => ({ events: [], loading: false, fetchEvents: vi.fn() }),
}));
vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));

import EntityDetail from '../EntityDetail';

function renderAt(path: string, routePath: string, element: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path={routePath} element={element} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('EntityDetail', () => {
  it('renders the venue source without crashing', () => {
    const { container } = renderAt('/venues/v1', '/venues/:slug', <EntityDetail source="venue" />);
    expect(container).toBeTruthy();
  });

  it('renders the organization source without crashing', () => {
    const { container } = renderAt(
      '/organizations/o1',
      '/organizations/:slug',
      <EntityDetail source="organization" />,
    );
    expect(container).toBeTruthy();
  });
});
