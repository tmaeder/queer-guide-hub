/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }) },
}));

import { useCountryCentroids } from '../useCountryCentroids';

describe('useCountryCentroids', () => {
  it('returns shape', () => {
    const { result } = renderHook(() => useCountryCentroids());
    expect(result.current).toBeDefined();
  });
});
