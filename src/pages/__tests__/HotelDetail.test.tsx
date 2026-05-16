/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/usePageFetchers', () => ({ useHotelByIdFallback: () => ({ data: null, isLoading: false }) }));
vi.mock('@/hooks/useEntityTripStatus', () => ({ useEntityTripStatus: () => ({ data: null, isLoading: false }) }));
vi.mock('@/hooks/useEntityDetail', () => ({ useEntityDetail: () => ({ data: null, isLoading: false }) }));
vi.mock('@/components/trips/AddToTripDialog', () => ({ AddToTripDialog: () => null }));
vi.mock('@/components/entity/EntityDetailLayout', () => ({ EntityDetailLayout: () => <div>layout</div> }));
vi.mock('@/components/seo/NotFoundMeta', () => ({ NotFoundMeta: () => null }));
vi.mock('@/components/routing/LocalizedLink', () => ({ LocalizedLink: ({ children }: { children: ReactNode }) => <span>{children}</span> }));

import HotelDetail from '../HotelDetail';

function wrap(initialPath = '/hotels/h1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/hotels/:id" element={<HotelDetail />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('HotelDetail', () => {
  it('renders without crashing', () => {
    const { container } = render(wrap());
    expect(container).toBeTruthy();
  });
});
