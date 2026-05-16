/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/useRecommendations', () => ({ useRecommendations: () => ({ data: [], isLoading: false }) }));
vi.mock('@/hooks/usePersonalizedCities', () => ({
  fetchPersonalizedCitiesByIds: vi.fn().mockResolvedValue([]),
  fetchTrendingCities: vi.fn().mockResolvedValue([]),
}));

import { PersonalizedFeed } from '../PersonalizedFeed';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>;
}

describe('PersonalizedFeed', () => {
  it('renders', () => {
    const { container } = render(<PersonalizedFeed />, { wrapper });
    expect(container).toBeTruthy();
  });
});
