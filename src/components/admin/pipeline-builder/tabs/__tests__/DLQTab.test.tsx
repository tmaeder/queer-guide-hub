/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) } },
}));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedFrom: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
}));
vi.mock('@/hooks/usePipelineBuilderTabs', () => ({
  fetchDlqRows: vi.fn().mockResolvedValue([]),
  retryDlqItem: vi.fn().mockResolvedValue(undefined),
}));

import DLQTab from '../DLQTab';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}><TooltipProvider>{children}</TooltipProvider></QueryClientProvider>;
}

describe('DLQTab', () => {
  it('renders without crashing', () => {
    const { container } = render(<DLQTab />, { wrapper });
    expect(container).toBeTruthy();
  });
});
