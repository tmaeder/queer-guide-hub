/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ insert: vi.fn().mockResolvedValue({ data: null, error: null }) }) },
}));

import { useTrackEvent } from '../useTrackEvent';

describe('useTrackEvent', () => {
  it('returns track function', () => {
    const { result } = renderHook(() => useTrackEvent());
    expect(typeof result.current.track).toBe('function');
  });
});
