/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedFrom: () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = () => chain;
    chain.limit = () => Promise.resolve({
      data: [{
        id: 'g1', content_type: 'venue', content_id: 'v1',
        original_lat: 52.5, original_lng: 13.4,
        validated_lat: 52.6, validated_lng: 13.5,
        geocoded_address: '1 Pride St', country: 'DE', city: 'Berlin',
        confidence: 0.9, mismatch_details: 'shifted 11km',
        source: 'mapbox', last_validated_at: '2026-05-15T00:00:00Z',
      }],
    });
    chain.update = () => ({ eq: () => Promise.resolve({ error: null }) });
    return chain;
  },
}));

import GeoMismatchTab from '../GeoMismatchTab';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('GeoMismatchTab', () => {
  it('renders mismatch row with geocoded address + content_type badge', async () => {
    render(<GeoMismatchTab />, { wrapper });
    await waitFor(() => expect(screen.getByText('venue')).toBeInTheDocument());
    expect(screen.getByText(/1 Pride St/)).toBeInTheDocument();
    expect(screen.getByText(/Geo mismatch review/)).toBeInTheDocument();
  });
});
