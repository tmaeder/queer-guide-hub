/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

type MockResult = { data: unknown; error: { message: string } | null };
const { state, useAuthMock, useToastMock, useLoadingStateMock, toastFn } = vi.hoisted(() => {
  const toastFn = vi.fn();
  return {
    state: {
      results: [] as MockResult[],
      calls: [] as Array<{ table?: string; rpc?: string; chain: Array<{ method: string; args: unknown[] }> }>,
    },
    useAuthMock: vi.fn(),
    useToastMock: vi.fn(),
    useLoadingStateMock: vi.fn(),
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
              const next = state.results.shift() ?? { data: [], error: null };
              return Promise.resolve(next).then(onFulfilled);
            };
          }
          return (...args: unknown[]) => { record.chain.push({ method: prop, args }); return builder; };
        },
      });
      return builder;
    },
    rpc(name: string, args: unknown) {
      state.calls.push({ rpc: name, chain: [{ method: 'rpc', args: [name, args] }] });
      const next = state.results.shift() ?? { data: null, error: null };
      return Promise.resolve(next);
    },
  },
}));
vi.mock('../useAuth', () => ({ useAuth: useAuthMock }));
vi.mock('../use-toast', () => ({ useToast: useToastMock }));
vi.mock('../useLoadingState', () => ({ useLoadingState: useLoadingStateMock }));

import { useConsolidatedSecurity } from '../useConsolidatedSecurity';

function withResults(...r: MockResult[]) { state.results.push(...r); }

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
  toastFn.mockReset();
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue({ user: { id: 'u1' } });
  useToastMock.mockReset();
  useToastMock.mockReturnValue({ toast: toastFn });
  useLoadingStateMock.mockReset();
  // useLoadingState wraps an async function — pass through.
  useLoadingStateMock.mockReturnValue({
    loading: false,
    error: null,
    withLoading: (fn: () => Promise<unknown>) => fn(),
  });
});

describe('useConsolidatedSecurity — metrics computation', () => {
  it('categorizes events into critical/high/medium and counts privacy/location/admin', async () => {
    withResults({
      data: [
        { event_type: 'CRITICAL_BREACH' },
        { event_type: 'SECURITY_INCIDENT' },
        { event_type: 'ADMIN_ACCESS' },
        { event_type: 'FINANCIAL_ALERT' },
        { event_type: 'PRIVACY_SETTINGS_UPDATED' },
        { event_type: 'LOCATION_DATA_ANONYMIZED' },
        { event_type: 'NOISE' },
      ],
      error: null,
    });

    const { result } = renderHook(() => useConsolidatedSecurity());
    await waitFor(() => expect(result.current.securityMetrics.totalEvents).toBeGreaterThan(0));

    const m = result.current.securityMetrics;
    expect(m.totalEvents).toBe(7);
    expect(m.criticalAlerts).toBe(2);
    expect(m.highAlerts).toBeGreaterThan(0);
    expect(m.privacyUpdates).toBe(1);
    expect(m.locationAnonymizations).toBe(1);
    expect(m.adminDataAccess).toBe(1);
    expect(m.suspiciousActivityScore).toBeGreaterThan(0);
  });

  it('caps suspicious score at 100', async () => {
    // 12 critical events → 12 × 10 = 120, should clamp to 100.
    withResults({
      data: Array.from({ length: 12 }, () => ({ event_type: 'CRITICAL_X' })),
      error: null,
    });
    const { result } = renderHook(() => useConsolidatedSecurity());
    await waitFor(() => expect(result.current.securityMetrics.totalEvents).toBe(12));
    expect(result.current.securityMetrics.suspiciousActivityScore).toBe(100);
  });
});

describe('useConsolidatedSecurity — logSecurityAction', () => {
  it('calls log_security_event RPC with medium severity', async () => {
    withResults({ data: [], error: null });
    const { result } = renderHook(() => useConsolidatedSecurity());
    await waitFor(() => expect(state.calls.length).toBeGreaterThanOrEqual(1));

    withResults({ data: null, error: null }); // for rpc call

    await result.current.logSecurityAction({ type: 'TEST_EVENT', metadata: { x: 1 } });

    const rpc = state.calls.find(c => c.rpc === 'log_security_event');
    expect(rpc).toBeDefined();
    const [, args] = rpc!.chain[0].args as [string, Record<string, unknown>];
    expect(args.p_event_type).toBe('TEST_EVENT');
    expect(args.p_severity).toBe('medium');
  });
});

describe('useConsolidatedSecurity — triggerSecurityIncident', () => {
  it('logs via RPC and shows destructive toast for critical severity', async () => {
    withResults({ data: [], error: null }, { data: null, error: null });

    const { result } = renderHook(() => useConsolidatedSecurity());
    await waitFor(() => expect(state.calls.length).toBeGreaterThanOrEqual(1));

    await result.current.triggerSecurityIncident('XSS_ATTEMPT', 'critical', { url: '/x' });

    expect(toastFn).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Security Incident Logged', variant: 'destructive' }),
    );
  });

  it("uses 'default' variant for non-critical severity", async () => {
    withResults({ data: [], error: null }, { data: null, error: null });
    const { result } = renderHook(() => useConsolidatedSecurity());
    await waitFor(() => expect(state.calls.length).toBeGreaterThanOrEqual(1));

    await result.current.triggerSecurityIncident('SUSPICIOUS', 'high');

    const lastToast = toastFn.mock.calls.at(-1)![0];
    expect(lastToast.variant).toBe('default');
  });
});

describe('useConsolidatedSecurity — anonymizeLocationData', () => {
  it('calls anonymize_location_data RPC + logs + success toast', async () => {
    withResults({ data: [], error: null }, { data: null, error: null }, { data: null, error: null });

    const { result } = renderHook(() => useConsolidatedSecurity());
    await waitFor(() => expect(state.calls.length).toBeGreaterThanOrEqual(1));

    await result.current.anonymizeLocationData();

    expect(state.calls.some(c => c.rpc === 'anonymize_location_data')).toBe(true);
    expect(toastFn).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Success' }),
    );
  });
});
