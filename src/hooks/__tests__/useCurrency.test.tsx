/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) },
}));

import { CurrencyProvider, useCurrency } from '../useCurrency';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}><CurrencyProvider>{children}</CurrencyProvider></QueryClientProvider>;
}

describe('useCurrency', () => {
  it('renders provider', () => {
    const { container } = render(<CurrencyProvider><div>x</div></CurrencyProvider>, { wrapper: ({ children }: { children: ReactNode }) => {
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
      return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    } });
    expect(container).toBeTruthy();
  });
  it('hook returns shape', () => {
    const { result } = renderHook(() => useCurrency(), { wrapper });
    expect(result.current).toBeDefined();
  });
});
