/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }), single: () => Promise.resolve({ data: null, error: null }) }) }) }),
  },
}));
vi.mock('@/config/contentTypeRegistry', () => ({ getContentType: () => null }));

import { useCMSEditor } from '../useCMSEditor';

describe('useCMSEditor', () => {
  it('returns shape', () => {
    const { result } = renderHook(() => useCMSEditor({ contentType: 'venues', itemId: null }));
    expect(result.current).toBeDefined();
  });

  it('tracks per-field dirty state and clears when a field reverts', () => {
    const { result } = renderHook(() => useCMSEditor({ contentType: 'venues', itemId: null }));

    act(() => result.current.setField('name', 'Berlin Bar'));
    expect(result.current.state.isDirty).toBe(true);

    // Revert to the original (undefined) value → no dirty fields remain.
    act(() => result.current.setField('name', undefined));
    expect(result.current.state.isDirty).toBe(false);
  });

  it('setFields marks multiple fields dirty and reset clears them', () => {
    const { result } = renderHook(() => useCMSEditor({ contentType: 'venues', itemId: null }));

    act(() => result.current.setFields({ name: 'A', description: 'B' }));
    expect(result.current.state.isDirty).toBe(true);

    act(() => result.current.reset());
    expect(result.current.state.isDirty).toBe(false);
  });
});
