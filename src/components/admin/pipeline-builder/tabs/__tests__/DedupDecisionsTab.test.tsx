/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn().mockResolvedValue({ data: 0, error: null }) } }));
vi.mock('@/hooks/usePipelineBuilderTabs', () => ({
  fetchPendingDedupDecisions: fetchMock,
  setDedupDecision: vi.fn().mockResolvedValue(undefined),
}));

import DedupDecisionsTab from '../DedupDecisionsTab';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('DedupDecisionsTab', () => {
  it('shows pending count + filter chips', async () => {
    fetchMock.mockResolvedValue([
      { id: 'd1', entity_type: 'venue', confidence: 0.8, created_at: new Date().toISOString() },
    ]);
    render(<DedupDecisionsTab />, { wrapper });
    await waitFor(() => expect(screen.getByText(/Pending dedupe decisions/)).toBeInTheDocument());
    expect(screen.getByText(/all/i)).toBeInTheDocument();
  });
});
