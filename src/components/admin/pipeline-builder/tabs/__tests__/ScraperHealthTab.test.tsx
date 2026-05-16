/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) },
}));
vi.mock('@/hooks/usePageFetchers', () => ({
  listFrom: vi.fn().mockResolvedValue([]),
}));

import ScraperHealthTab from '../ScraperHealthTab';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('ScraperHealthTab', () => {
  it('renders without crashing', () => {
    const { container } = render(<ScraperHealthTab />, { wrapper });
    expect(container).toBeTruthy();
  });
});
