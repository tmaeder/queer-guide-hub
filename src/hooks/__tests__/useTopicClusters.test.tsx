/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/integrations/supabase/untyped', () => ({
  untypedFrom: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
}));

import { useTopicClusters } from '../useTopicClusters';

describe('useTopicClusters', () => {
  it('returns clusters and loading state', () => {
    const { result } = renderHook(() => useTopicClusters());
    expect(result.current).toBeDefined();
    expect('clusters' in result.current).toBe(true);
  });
});
