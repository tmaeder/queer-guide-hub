/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { SubmissionTypeConfig } from '@/config/submissionRegistry';

type MockResult = { data: unknown; error: { message: string } | null };
const { state, useAuthMock, useToastMock, toastFn } = vi.hoisted(() => {
  const toastFn = vi.fn();
  return {
    state: {
      results: [] as MockResult[],
      calls: [] as Array<{ table: string; chain: Array<{ method: string; args: unknown[] }> }>,
    },
    useAuthMock: vi.fn(),
    useToastMock: vi.fn(),
    toastFn,
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from(table: string) {
      const record = { table, chain: [] as Array<{ method: string; args: unknown[] }> };
      state.calls.push(record);
      const builder: unknown = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') {
            return (onFulfilled: (v: MockResult) => unknown) => {
              const next = state.results.shift() ?? { data: null, error: null };
              return Promise.resolve(next).then(onFulfilled);
            };
          }
          return (...args: unknown[]) => { record.chain.push({ method: prop, args }); return builder; };
        },
      });
      return builder;
    },
  },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));
vi.mock('@/hooks/use-toast', () => ({ useToast: useToastMock }));
vi.mock('@/config/contentTypeRegistry', () => ({
  contentTypeRegistry: {
    venues: {
      fields: [
        { name: 'name', label: 'Name', type: 'text', required: true },
        { name: 'description', label: 'Description', type: 'textarea' },
        { name: 'website', label: 'Website', type: 'url' },
      ],
    },
  },
}));

import { useSubmission } from '../useSubmission';

function withResults(...r: MockResult[]) { state.results.push(...r); }

function makeConfig(): SubmissionTypeConfig {
  return {
    id: 'venue',
    contentType: 'venues',
    targetTable: 'venues',
    label: 'Venue',
    description: '',
    icon: (() => null) as never,
    color: '#000',
    titleField: 'name',
    defaults: { name: '', description: '', website: '' },
    steps: [
      { id: 'a', label: 'A', fields: ['name'] },
      { id: 'b', label: 'B', fields: ['description', 'website'] },
    ],
  };
}

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
  toastFn.mockReset();
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue({ user: { id: 'u1' } });
  useToastMock.mockReset();
  useToastMock.mockReturnValue({ toast: toastFn });
});

describe('useSubmission — initial state', () => {
  it('starts at step 0, not submitted, totalSteps from config', () => {
    const { result } = renderHook(() => useSubmission(makeConfig()));
    expect(result.current.currentStep).toBe(0);
    expect(result.current.isSubmitted).toBe(false);
    expect(result.current.totalSteps).toBe(2);
  });
});

describe('useSubmission — navigation + validation', () => {
  it('nextStep blocks when required field empty', async () => {
    const { result } = renderHook(() => useSubmission(makeConfig()));
    let res: { ok: boolean; firstInvalid?: string } | undefined;
    await act(async () => {
      res = await result.current.nextStep();
    });
    expect(res?.ok).toBe(false);
    expect(result.current.currentStep).toBe(0);
  });

  it('nextStep advances when valid', async () => {
    const { result } = renderHook(() => useSubmission(makeConfig()));
    act(() => result.current.setField('name', 'Berghain'));
    await act(async () => { await result.current.nextStep(); });
    expect(result.current.currentStep).toBe(1);
  });

  it('prevStep clamps at 0', () => {
    const { result } = renderHook(() => useSubmission(makeConfig()));
    act(() => result.current.prevStep());
    expect(result.current.currentStep).toBe(0);
  });

  it('goToStep allows backward navigation freely; gates forward on validation', async () => {
    const { result } = renderHook(() => useSubmission(makeConfig()));
    act(() => result.current.setField('name', 'X'));
    await act(async () => { await result.current.goToStep(1); });
    expect(result.current.currentStep).toBe(1);

    await act(async () => { await result.current.goToStep(0); });
    expect(result.current.currentStep).toBe(0);
  });
});

describe('useSubmission — submit', () => {
  it('inserts to community_submissions on success', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useSubmission(makeConfig()));
    act(() => result.current.setField('name', 'Berghain'));

    await act(async () => { await result.current.submit(); });

    expect(state.calls[0].table).toBe('community_submissions');
    const insert = state.calls[0].chain.find(s => s.method === 'insert');
    expect((insert?.args[0] as Record<string, unknown>).submitted_by).toBe('u1');
    expect(result.current.isSubmitted).toBe(true);
  });

  it('aborts silently when honeypot is filled', async () => {
    const { result } = renderHook(() => useSubmission(makeConfig()));
    act(() => result.current.setField('name', 'Berghain'));
    act(() => result.current.setHoneypot('spam'));
    await act(async () => { await result.current.submit(); });

    expect(state.calls).toHaveLength(0);
    expect(result.current.isSubmitted).toBe(false);
  });

  it('toasts + bails when validation fails on any step', async () => {
    const { result } = renderHook(() => useSubmission(makeConfig()));
    await act(async () => { await result.current.submit(); });

    expect(toastFn).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Please fix form errors', variant: 'destructive' }),
    );
    expect(state.calls).toHaveLength(0);
  });

  it('toasts sign-in-required when no user (after validation passes)', async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHook(() => useSubmission(makeConfig()));
    act(() => result.current.setField('name', 'Berghain'));

    await act(async () => { await result.current.submit(); });

    expect(toastFn).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Sign in required' }),
    );
    expect(state.calls).toHaveLength(0);
  });

  it('fires destructive toast on supabase error', async () => {
    withResults({ data: null, error: { message: 'rls denied' } });
    const { result } = renderHook(() => useSubmission(makeConfig()));
    act(() => result.current.setField('name', 'Berghain'));

    await act(async () => { await result.current.submit(); });

    expect(toastFn).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Submission failed', variant: 'destructive' }),
    );
    expect(result.current.isSubmitted).toBe(false);
  });
});

describe('useSubmission — reset', () => {
  it('clears form, returns to step 0, isSubmitted=false', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useSubmission(makeConfig()));
    act(() => result.current.setField('name', 'Berghain'));
    await act(async () => { await result.current.submit(); });
    expect(result.current.isSubmitted).toBe(true);

    act(() => result.current.reset());
    expect(result.current.isSubmitted).toBe(false);
    expect(result.current.currentStep).toBe(0);
  });
});
