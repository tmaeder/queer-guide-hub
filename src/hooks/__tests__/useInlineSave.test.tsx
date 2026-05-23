import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { FieldConfig } from '@/types/cms';

const toastErrorSpy = vi.fn();
const toastSuccessSpy = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorSpy(...args),
    success: (...args: unknown[]) => toastSuccessSpy(...args),
  },
}));

// Build a chainable mock that returns the data the hook expects.
function chain(value: unknown, error: unknown = null) {
  const obj: Record<string, unknown> = {};
  ['select', 'update', 'insert', 'eq'].forEach((m) => {
    obj[m] = vi.fn().mockReturnValue(obj);
  });
  obj.maybeSingle = vi.fn().mockResolvedValue({ data: value, error });
  obj.single = vi.fn().mockResolvedValue({ data: value, error });
  obj.then = (resolve: (v: { data: unknown; error: unknown }) => void) =>
    Promise.resolve({ data: value, error }).then(resolve);
  return obj;
}

const fromMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
  },
}));

import { useInlineSave } from '../useInlineSave';

const NAME_FIELD: FieldConfig = {
  name: 'name',
  label: 'Name',
  type: 'text',
  required: true,
  group: 'basic',
  maxLength: 5,
};

const WEBSITE_FIELD: FieldConfig = {
  name: 'website',
  label: 'Website',
  type: 'url',
  group: 'details',
};

describe('useInlineSave', () => {
  beforeEach(() => {
    toastErrorSpy.mockClear();
    toastSuccessSpy.mockClear();
    fromMock.mockReset();
  });

  it('rejects empty value on required field', async () => {
    const { result } = renderHook(() => useInlineSave('venues', 'v1'));
    const res = await act(async () => result.current.save({ field: NAME_FIELD, value: '' }));
    expect(res.success).toBe(false);
    expect(toastErrorSpy).toHaveBeenCalledWith(expect.stringContaining('required'));
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('rejects value exceeding maxLength', async () => {
    const { result } = renderHook(() => useInlineSave('venues', 'v1'));
    const res = await act(async () => result.current.save({ field: NAME_FIELD, value: 'too-long' }));
    expect(res.success).toBe(false);
    expect(toastErrorSpy).toHaveBeenCalledWith(expect.stringContaining('at most 5'));
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('refuses blocklisted website URL client-side', async () => {
    const { result } = renderHook(() => useInlineSave('venues', 'v1'));
    const res = await act(async () =>
      result.current.save({ field: WEBSITE_FIELD, value: 'https://en.wikipedia.org/wiki/X' }),
    );
    expect(res.success).toBe(false);
    expect(toastErrorSpy).toHaveBeenCalledWith(expect.stringContaining('blocklisted'));
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('saves a valid value and writes audit log', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'admin_edit_log') return chain({ id: 'log1' });
      // venues: fetch before, then update returns after
      return chain({ id: 'v1', name: 'Hello' });
    });

    const { result } = renderHook(() => useInlineSave('venues', 'v1'));
    const res = await act(async () => result.current.save({ field: NAME_FIELD, value: 'Hello' }));

    expect(res.success).toBe(true);
    expect(toastSuccessSpy).toHaveBeenCalledWith(expect.stringContaining('Saved'));
    expect(fromMock).toHaveBeenCalledWith('venues');
    expect(fromMock).toHaveBeenCalledWith('admin_edit_log');
  });

  it('detects silent trigger nulling and surfaces an error', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'admin_edit_log') return chain({ id: 'log1' });
      // After-update returns null in name field — simulating trigger
      return chain({ id: 'v1', name: null });
    });

    const { result } = renderHook(() => useInlineSave('venues', 'v1'));
    const res = await act(async () => result.current.save({ field: NAME_FIELD, value: 'Hello' }));
    expect(res.success).toBe(false);
    expect(toastErrorSpy).toHaveBeenCalledWith(expect.stringContaining('silently'));
  });

  it('returns error on unknown content type without DB calls', async () => {
    const { result } = renderHook(() => useInlineSave('not_a_type', 'x'));
    const res = await act(async () => result.current.save({ field: NAME_FIELD, value: 'ok' }));
    expect(res.success).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });
});
