import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@/integrations/supabase/client', () => {
  const handler: ProxyHandler<object> = {
    get: (_t, p) => (p === 'then' ? undefined : (..._a: unknown[]) => new Proxy(() => {}, handler)),
    apply: () => new Proxy(() => {}, handler),
  };
  return { supabase: { from: () => new Proxy(() => {}, handler), rpc: vi.fn().mockResolvedValue({ data: {}, error: null }) } };
});

import { useReviewCounts, toReviewCounts } from '../useReviewCounts';

const w = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe('useReviewCounts', () => {
  it('should return query shape', () => {
    const { result } = renderHook(() => useReviewCounts(), { wrapper: w() });
    expect(result.current).toHaveProperty('data');
    expect(result.current).toHaveProperty('isLoading');
  });
});

describe('toReviewCounts', () => {
  it('maps get_admin_counts keys and totals them', () => {
    const counts = toReviewCounts({
      review_staging: 3,
      review_cms: 1,
      review_moderation: 2,
      review_submissions: 4,
      review_automation: 5,
      review_tags: 6,
      review_duplicates: 7,
      review_feedback: 8,
    });
    expect(counts).toEqual({
      staging: 3,
      cmsReview: 1,
      moderation: 2,
      submissions: 4,
      automation: 5,
      tagSuggestions: 6,
      duplicates: 7,
      feedback: 8,
      total: 36,
    });
  });

  it('defaults missing keys to 0', () => {
    expect(toReviewCounts({}).total).toBe(0);
  });
});
