/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useSimilarCities', () => ({
  fetchSimilarCitiesPool: vi.fn().mockResolvedValue([]),
  fetchSameCountryCities: vi.fn().mockResolvedValue([]),
}));

import { SimilarCities } from '../SimilarCities';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>;
}

describe('SimilarCities', () => {
  it('renders', () => {
    const { container } = render(<SimilarCities cityId="c1" cityName="Berlin" />, { wrapper });
    expect(container).toBeTruthy();
  });
});
