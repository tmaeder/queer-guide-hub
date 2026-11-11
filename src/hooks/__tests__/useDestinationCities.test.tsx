/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const city = (id: string) => ({ id, name: id, slug: id, countries: null });
vi.mock('@/hooks/usePersonalizedCities', () => ({
  fetchCountryCities: async () => [city('zurich'), city('basel'), city('geneva')],
  fetchTrendingCities: async () => [city('berlin'), city('zurich'), city('madrid')],
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { useDestinationCities } from '../useIntentData';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useDestinationCities', () => {
  // "Elsewhere" on a city page must not list that city, and must lead with
  // the visitor's own country before the global trending list.
  it('excludes the current city and ranks the visitor country first', async () => {
    const { result } = renderHook(
      () => useDestinationCities(4, { excludeCityId: 'zurich', countryId: 'ch' }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.map((c) => c.id)).toEqual(['basel', 'geneva', 'berlin', 'madrid']);
  });
});
