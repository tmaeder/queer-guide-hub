/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const toastFn = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  });
  return { toastFn };
});

vi.mock('sonner', () => ({ toast: mocks.toastFn }));

import { adminAction } from '../adminAction';

const toastFn = mocks.toastFn;

describe('adminAction', () => {
  beforeEach(() => {
    toastFn.mockReset();
    toastFn.success = vi.fn();
    toastFn.error = vi.fn();
  });

  it('calls perform and shows success toast when no undo', async () => {
    const perform = vi.fn().mockResolvedValue('ok');
    const result = await adminAction({ label: 'Approved 3', perform });
    expect(result).toBe('ok');
    expect(perform).toHaveBeenCalledOnce();
    expect(toastFn.success).toHaveBeenCalledWith('Approved 3');
  });

  it('shows custom successMessage when provided', async () => {
    await adminAction({
      label: 'Internal',
      successMessage: 'User-facing',
      perform: () => 1,
    });
    expect(toastFn.success).toHaveBeenCalledWith('User-facing');
  });

  it('renders an Undo action when undo callback provided', async () => {
    const undo = vi.fn();
    await adminAction({
      label: 'Approved 5',
      perform: () => ({ id: 'x' }),
      undo,
    });
    expect(toastFn).toHaveBeenCalledTimes(1);
    const [label, opts] = toastFn.mock.calls[0] as [string, { duration: number; action: { label: string; onClick: () => Promise<void> } }];
    expect(label).toBe('Approved 5');
    expect(opts.duration).toBe(5000);
    expect(opts.action.label).toBe('Undo');

    await opts.action.onClick();
    expect(undo).toHaveBeenCalledWith({ id: 'x' });
    expect(toastFn.success).toHaveBeenCalledWith('Undone');
  });

  it('honours undoWindowMs', async () => {
    await adminAction({
      label: 'Foo',
      perform: () => 1,
      undo: () => {},
      undoWindowMs: 12000,
    });
    const [, opts] = toastFn.mock.calls[0] as [string, { duration: number }];
    expect(opts.duration).toBe(12000);
  });

  it('shows error toast and returns null when perform throws', async () => {
    const result = await adminAction({
      label: 'Boom',
      perform: () => {
        throw new Error('boom');
      },
    });
    expect(result).toBeNull();
    expect(toastFn.error).toHaveBeenCalledWith('boom');
  });

  it('uses custom errorMessage when provided', async () => {
    await adminAction({
      label: 'X',
      errorMessage: 'Friendly fail',
      perform: () => {
        throw new Error('raw');
      },
    });
    expect(toastFn.error).toHaveBeenCalledWith('Friendly fail');
  });

  it('reports undo failure via error toast', async () => {
    await adminAction({
      label: 'X',
      perform: () => 1,
      undo: () => {
        throw new Error('cannot undo');
      },
    });
    const [, opts] = toastFn.mock.calls[0] as [string, { action: { onClick: () => Promise<void> } }];
    await opts.action.onClick();
    expect(toastFn.error).toHaveBeenCalledWith('cannot undo');
  });
});
