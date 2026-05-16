/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../../hooks/usePipelineHistory', () => ({
  usePipelineRun: () => ({ data: null, isLoading: false }),
}));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedFrom: () => ({
    select: () => ({
      order: () => ({
        limit: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  }),
}));

import RunCompareDialog from '../RunCompareDialog';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('RunCompareDialog', () => {
  it('renders trigger button', () => {
    render(<RunCompareDialog />, { wrapper });
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });
});
