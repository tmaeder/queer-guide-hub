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
    const res = await act(async () =>
      result.current.save({ field: NAME_FIELD, value: 'too-long' }),
    );
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

  it('saves a valid value', async () => {
    fromMock.mockImplementation(() => chain({ id: 'v1', name: 'Hello' }));

    const { result } = renderHook(() => useInlineSave('venues', 'v1'));
    const res = await act(async () => result.current.save({ field: NAME_FIELD, value: 'Hello' }));

    expect(res.success).toBe(true);
    expect(toastSuccessSpy).toHaveBeenCalledWith(expect.stringContaining('Saved'));
    expect(fromMock).toHaveBeenCalledWith('venues');
  });

  it('writes NO audit row from the client', async () => {
    // This assertion used to be its opposite, and that is the point.
    // `admin_edit_log` held 0 rows for its entire life — RLS enabled, a
    // SELECT-only policy, no INSERT policy — so every insert was denied and
    // swallowed by a bare `catch {}`. The mock made the old test green while
    // production recorded nothing: the test verified the CALL, never the
    // EFFECT. The trail is a database trigger now.
    fromMock.mockImplementation(() => chain({ id: 'v1', name: 'Hello' }));

    const { result } = renderHook(() => useInlineSave('venues', 'v1'));
    await act(async () => result.current.save({ field: NAME_FIELD, value: 'Hello' }));

    expect(fromMock).not.toHaveBeenCalledWith('admin_edit_log');
    expect(fromMock).not.toHaveBeenCalledWith('content_revisions');
  });

  it('does not re-read the row before writing it', async () => {
    // The pre-save SELECT existed only to fill that audit row, so it was a
    // round-trip per save for a write that never happened.
    fromMock.mockImplementation(() => chain({ id: 'v1', name: 'Hello' }));

    const { result } = renderHook(() => useInlineSave('venues', 'v1'));
    await act(async () => result.current.save({ field: NAME_FIELD, value: 'Hello' }));

    expect(fromMock.mock.calls.filter((c) => c[0] === 'venues')).toHaveLength(1);
  });

  it('detects silent trigger nulling and surfaces an error', async () => {
    // After-update returns null in the name field — simulating a trigger
    // that silently blanked the value.
    fromMock.mockImplementation(() => chain({ id: 'v1', name: null }));

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
