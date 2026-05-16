/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.order = () => chain;
      chain.range = () => Promise.resolve({ data: [], error: null, count: 0 });
      return chain;
    },
  },
}));
vi.mock('@/config/contentTypeRegistry', () => ({ getContentType: () => null }));

import { useContentListController } from '../useContentListController';

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('useContentListController', () => {
  it('returns initial state', () => {
    const { result } = renderHook(() => useContentListController({ contentTypeId: 'venues' }), { wrapper });
    expect(result.current).toBeDefined();
  });
});
