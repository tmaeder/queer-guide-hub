/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useFavorites', () => ({ useFavorites: () => ({ favorites: [], toggleFavorite: vi.fn(), isFavorite: () => false }) }));
vi.mock('@/hooks/useVenues', () => ({ useVenues: () => ({ venues: [], loading: false, fetchVenues: vi.fn() }) }));
vi.mock('@/hooks/useEvents', () => ({ useEvents: () => ({ events: [], loading: false, fetchEvents: vi.fn() }) }));
vi.mock('@/hooks/useEntityDetail', () => ({ useEntityDetail: () => ({ data: null, isLoading: false }) }));
vi.mock('@/components/discovery/SimilarItems', () => ({ SimilarItems: () => null }));
vi.mock('@/components/marks/MarkVisitedButton', () => ({ MarkVisitedButton: () => null }));
vi.mock('@/components/routing/LocalizedLink', () => ({ LocalizedLink: ({ children }: { children: ReactNode }) => <span>{children}</span> }));

import QueerVillageDetail from '../QueerVillageDetail';

describe('QueerVillageDetail', () => {
  it('renders without crashing', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(
      <MemoryRouter initialEntries={['/villages/v1']}>
        <QueryClientProvider client={qc}>
          <Routes><Route path="/villages/:slug" element={<QueerVillageDetail />} /></Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
