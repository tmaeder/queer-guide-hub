/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const insertMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ insert: insertMock }),
  },
}));

import { useReportHotline } from '../useReportHotline';

beforeEach(() => {
  insertMock.mockReset();
});

describe('useReportHotline', () => {
  it('starts in idle state', () => {
    const { result } = renderHook(() => useReportHotline());
    expect(result.current.submitting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('inserts a hotline_reports row with trimmed detail', async () => {
    insertMock.mockResolvedValueOnce({ error: null });
    const { result } = renderHook(() => useReportHotline());

    let ok = false;
    await act(async () => {
      ok = await result.current.submit({
        hotlineId: 'h1',
        reason: 'closed',
        detail: '  no longer answering  ',
      });
    });

    expect(ok).toBe(true);
    expect(insertMock).toHaveBeenCalledWith({
      hotline_id: 'h1',
      reason: 'closed',
      detail: 'no longer answering',
    });
    expect(result.current.error).toBeNull();
  });

  it('coerces empty detail to null', async () => {
    insertMock.mockResolvedValueOnce({ error: null });
    const { result } = renderHook(() => useReportHotline());
    await act(async () => {
      await result.current.submit({ hotlineId: 'h1', reason: 'other', detail: '   ' });
    });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ detail: null }),
    );
  });

  it('surfaces error message and returns false on failure', async () => {
    insertMock.mockResolvedValueOnce({ error: { message: 'rls denied' } });
    const { result } = renderHook(() => useReportHotline());

    let ok = true;
    await act(async () => {
      ok = await result.current.submit({ hotlineId: 'h1', reason: 'unsafe' });
    });
    expect(ok).toBe(false);
    expect(result.current.error).toBe('rls denied');
    expect(result.current.submitting).toBe(false);
  });
});
