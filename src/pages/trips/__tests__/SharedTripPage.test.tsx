/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/useTripReactions', () => ({ useTripReactions: () => ({ data: [], toggle: vi.fn() }) }));
vi.mock('@/hooks/useTripComments', () => ({ useTripComments: () => ({ data: [], add: vi.fn() }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));

import SharedTripPage from '../SharedTripPage';

describe('SharedTripPage', () => {
  it('renders without crashing', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(
      <MemoryRouter initialEntries={['/share/trip/tok']}>
        <QueryClientProvider client={qc}>
          <Routes><Route path="/share/trip/:token" element={<SharedTripPage />} /></Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
