/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const fromMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));

import { useAdminFullEditRow } from '../useAdminFullEditRow';

describe('useAdminFullEditRow', () => {
  it("uses the type's own loader instead of reading tableName", async () => {
    const load = vi.fn().mockResolvedValue({ id: 'l1', address: 'Main St' });
    const { result } = renderHook(() =>
      useAdminFullEditRow('cms_landmarks', 'l1', true, undefined, load),
    );
    await waitFor(() => expect(result.current.data).toEqual({ id: 'l1', address: 'Main St' }));
    expect(load).toHaveBeenCalledWith('l1');
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('keeps an empty form when the loader fails', async () => {
    const load = vi.fn().mockRejectedValue(new Error('gone'));
    const { result } = renderHook(() =>
      useAdminFullEditRow('cms_landmarks', 'l1', true, undefined, load),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({});
  });
});
