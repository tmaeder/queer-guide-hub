/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type MockResult = { data: unknown; error: { message: string } | null };

const { state, useAuthMock } = vi.hoisted(() => ({
  state: {
    results: [] as MockResult[],
    calls: [] as Array<{ table: string; chain: Array<{ method: string; args: unknown[] }> }>,
  },
  useAuthMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from(table: string) {
      const record = { table, chain: [] as Array<{ method: string; args: unknown[] }> };
      state.calls.push(record);
      const builder: unknown = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === 'then') {
              return (onFulfilled: (v: MockResult) => unknown) => {
                const next = state.results.shift() ?? { data: [], error: null };
                return Promise.resolve(next).then(onFulfilled);
              };
            }
            return (...args: unknown[]) => {
              record.chain.push({ method: prop, args });
              return builder;
            };
          },
        },
      );
      return builder;
    },
  },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));

import {
  useRecordHandoff,
  useUpdateHandoff,
  latestHandoff,
} from '../useFeedbackHandoff';

function withResults(...r: MockResult[]) { state.results.push(...r); }
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue({
    user: { id: 'u1', email: 'admin@queer.guide', user_metadata: { display_name: 'Admin Alice' } },
  });
});

describe('latestHandoff', () => {
  it('returns null when no handoffs', () => {
    expect(latestHandoff({ data: { handoffs: undefined } } as never)).toBeNull();
    expect(latestHandoff({ data: { handoffs: [] } } as never)).toBeNull();
  });

  it('picks the entry with the most-recent at timestamp', () => {
    const item = {
      data: {
        handoffs: [
          { id: 'a', at: '2026-01-01T00:00:00Z' },
          { id: 'c', at: '2026-03-01T00:00:00Z' },
          { id: 'b', at: '2026-02-01T00:00:00Z' },
        ],
      },
    };
    expect(latestHandoff(item as never)?.id).toBe('c');
  });
});

describe('useRecordHandoff', () => {
  it('throws when the submission is not found', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useRecordHandoff(), { wrapper });
    await expect(
      result.current.mutateAsync({ submissionId: 's1', target: 'claude' as never }),
    ).rejects.toThrow('Submission not found');
  });

  it('appends a new handoff entry to existing handoffs jsonb', async () => {
    withResults(
      { data: { data: { handoffs: [{ id: 'old' }] } }, error: null },
      { data: null, error: null },
    );

    const { result } = renderHook(() => useRecordHandoff(), { wrapper });
    const entry = await result.current.mutateAsync({
      submissionId: 's1',
      target: 'claude' as never,
      promptPreview: 'A'.repeat(200),
      note: 'lgtm',
    });

    expect(entry.target).toBe('claude');
    expect(entry.by_name).toBe('Admin Alice');
    expect(entry.status).toBe('sent');
    expect(entry.prompt_preview?.length).toBe(160); // capped

    const updateCall = state.calls[1];
    const payload = updateCall.chain.find(s => s.method === 'update')?.args[0] as { data: { handoffs: unknown[] } };
    expect(payload.data.handoffs).toHaveLength(2);
  });

  it('falls back to email when display_name missing', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1', email: 'admin@queer.guide', user_metadata: {} } });
    withResults({ data: { data: {} }, error: null }, { data: null, error: null });

    const { result } = renderHook(() => useRecordHandoff(), { wrapper });
    const entry = await result.current.mutateAsync({ submissionId: 's1', target: 'claude' as never });
    expect(entry.by_name).toBe('admin@queer.guide');
  });

  it("falls back to 'Admin' when no user", async () => {
    useAuthMock.mockReturnValue({ user: null });
    withResults({ data: { data: {} }, error: null }, { data: null, error: null });

    const { result } = renderHook(() => useRecordHandoff(), { wrapper });
    const entry = await result.current.mutateAsync({ submissionId: 's1', target: 'claude' as never });
    expect(entry.by).toBeNull();
    expect(entry.by_name).toBe('Admin');
  });
});

describe('useUpdateHandoff', () => {
  it('flips status and stamps status_at on the matching id', async () => {
    withResults(
      {
        data: {
          data: {
            handoffs: [
              { id: 'h1', status: 'sent' },
              { id: 'h2', status: 'sent' },
            ],
          },
        },
        error: null,
      },
      { data: null, error: null },
    );

    const { result } = renderHook(() => useUpdateHandoff(), { wrapper });
    await result.current.mutateAsync({
      submissionId: 's1',
      handoffId: 'h2',
      status: 'resolved' as never,
    });

    const payload = state.calls[1].chain.find(s => s.method === 'update')?.args[0] as {
      data: { handoffs: Array<{ id: string; status: string; status_at?: string }> };
    };
    const h1 = payload.data.handoffs.find(h => h.id === 'h1')!;
    const h2 = payload.data.handoffs.find(h => h.id === 'h2')!;
    expect(h1.status).toBe('sent'); // untouched
    expect(h1.status_at).toBeUndefined();
    expect(h2.status).toBe('resolved');
    expect(typeof h2.status_at).toBe('string');
  });

  it('updates the note independently of status', async () => {
    withResults(
      { data: { data: { handoffs: [{ id: 'h1', status: 'sent' }] } }, error: null },
      { data: null, error: null },
    );

    const { result } = renderHook(() => useUpdateHandoff(), { wrapper });
    await result.current.mutateAsync({
      submissionId: 's1',
      handoffId: 'h1',
      note: 'updated note',
    });

    const payload = state.calls[1].chain.find(s => s.method === 'update')?.args[0] as {
      data: { handoffs: Array<{ note: string }> };
    };
    expect(payload.data.handoffs[0].note).toBe('updated note');
  });

  it('throws when submission is not found', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useUpdateHandoff(), { wrapper });
    await expect(
      result.current.mutateAsync({ submissionId: 's1', handoffId: 'h1' }),
    ).rejects.toThrow('Submission not found');
  });
});
