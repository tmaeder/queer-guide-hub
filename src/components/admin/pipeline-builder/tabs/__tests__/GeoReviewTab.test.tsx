/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { resolveMock } = vi.hoisted(() => ({ resolveMock: vi.fn() }));

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/hooks/usePipelineBuilderTabs', () => ({ resolveGeoMergeCandidate: resolveMock }));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedFrom: () => ({
    select: () => ({
      in: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () => Promise.resolve({
                data: [{
                  id: 's1', target_table: 'cities',
                  normalized_data: { name: 'Berlin', location: { country: 'DE', lat: 52.52, lng: 13.4 } },
                  dedup_match_id: 'm-abc-12345',
                  dedup_match_score: 0.93,
                  dedup_details: { match_type: 'name_match' },
                  created_at: '2026-05-15T00:00:00Z',
                }],
              }),
            }),
          }),
        }),
      }),
    }),
  }),
}));

import GeoReviewTab from '../GeoReviewTab';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => resolveMock.mockReset());

describe('GeoReviewTab', () => {
  it('renders heading + count badge', async () => {
    render(<GeoReviewTab />, { wrapper });
    await waitFor(() => expect(screen.getByText('Berlin')).toBeInTheDocument());
    expect(screen.getByText(/Geo merge candidates/)).toBeInTheDocument();
  });

  it('renders score percentage', async () => {
    render(<GeoReviewTab />, { wrapper });
    await waitFor(() => expect(screen.getByText('93%')).toBeInTheDocument());
  });

  it('shows match type', async () => {
    render(<GeoReviewTab />, { wrapper });
    await waitFor(() => expect(screen.getByText(/name_match/)).toBeInTheDocument());
  });
});
