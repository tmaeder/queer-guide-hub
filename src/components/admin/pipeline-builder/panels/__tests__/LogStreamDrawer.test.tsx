/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ReactNode } from 'react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { channel: vi.fn(() => ({ on: () => ({ subscribe: vi.fn() }), unsubscribe: vi.fn() })), removeChannel: vi.fn() },
}));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedFrom: () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.in = () => chain;
    chain.order = () => chain;
    chain.limit = () => Promise.resolve({ data: [], error: null });
    return chain;
  },
}));

import LogStreamDrawer from '../LogStreamDrawer';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}><TooltipProvider>{children}</TooltipProvider></QueryClientProvider>;
}

describe('LogStreamDrawer', () => {
  it('renders without crashing when pipelineRunId is null', () => {
    const { container } = render(<LogStreamDrawer pipelineRunId={null} onClose={vi.fn()} />, { wrapper });
    expect(container).toBeTruthy();
  });
});
