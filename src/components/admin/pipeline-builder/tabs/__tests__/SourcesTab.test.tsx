/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedFrom: () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = () => Promise.resolve({ data: [], error: null });
    return chain;
  },
}));
vi.mock('@/components/admin/WebScrapersPanel', () => ({ WebScrapersPanel: () => null }));
vi.mock('@/components/admin/IngestionSourcesManager', () => ({ IngestionSourcesManager: () => null }));
vi.mock('@/components/admin/NewsSourcesManager', () => ({ NewsSourcesManager: () => null }));
vi.mock('@/components/admin/ApiKeysManager', () => ({ ApiKeysManager: () => null }));

import SourcesTab from '../SourcesTab';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}><TooltipProvider>{children}</TooltipProvider></QueryClientProvider>;
}

describe('SourcesTab', () => {
  it('renders without crashing', () => {
    const { container } = render(<SourcesTab />, { wrapper });
    expect(container).toBeTruthy();
  });
});
