/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/usePersonalities', () => ({
  usePersonalities: () => ({ personalities: [], totalCount: 0, loading: false, error: null, hasMore: false, fetchPersonalities: vi.fn() }),
  useProfessionFacets: () => ({ data: [], isLoading: false }),
}));

import Personalities from '../Personalities';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <MemoryRouter><QueryClientProvider client={qc}>{children}</QueryClientProvider></MemoryRouter>;
}

describe('Personalities', () => {
  it('renders without crashing', () => {
    const { container } = render(<Personalities />, { wrapper });
    expect(container).toBeTruthy();
  });
});
