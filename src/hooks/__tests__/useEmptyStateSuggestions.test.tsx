/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }) },
}));

import { useEmptyStateSuggestions } from '../useEmptyStateSuggestions';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useEmptyStateSuggestions', () => {
  it('returns query', () => {
    const { result } = renderHook(() => useEmptyStateSuggestions({ enabled: true }), { wrapper });
    expect(result.current).toBeDefined();
  });
});
