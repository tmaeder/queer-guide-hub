/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedSupabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.order = () => chain;
      chain.limit = () => Promise.resolve({ data: [], error: null });
      chain.update = () => chain;
      return chain;
    },
  },
}));

import NewsQualityReviewTab from '../NewsQualityReviewTab';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('NewsQualityReviewTab', () => {
  it('renders without crashing', () => {
    const { container } = render(<NewsQualityReviewTab />, { wrapper });
    expect(container).toBeTruthy();
  });
});
