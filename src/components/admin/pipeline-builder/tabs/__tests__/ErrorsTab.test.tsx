/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/integrations/supabase/untyped', () => ({
  untypedFrom: () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.order = () => Promise.resolve({ data: [], error: null });
    return chain;
  },
}));

import ErrorsTab from '../ErrorsTab';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('ErrorsTab', () => {
  it('renders without crashing', () => {
    const { container } = render(<ErrorsTab />, { wrapper });
    expect(container).toBeTruthy();
  });
});
