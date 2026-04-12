import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/hooks/useVisitorLocation', () => ({
  useVisitorLocation: () => ({ location: null, loading: false }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import { useVisitorOrigin } from '../useVisitorOrigin';

describe('useVisitorOrigin', () => {
  it('should return null origin when no location', () => {
    const { result } = renderHook(() => useVisitorOrigin());
    expect(result.current.originIata).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
