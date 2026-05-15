/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const { state, useAuthMock } = vi.hoisted(() => ({
  state: {
    results: [] as Array<{ data: unknown; error: { message: string } | null }>,
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
              return (onFulfilled: (v: { data: unknown; error: { message: string } | null }) => unknown) => {
                const next = state.results.shift() ?? { data: null, error: null };
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

import { useQualityGates } from '../useQualityGates';

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue({ user: { id: 'u1' } });
});

describe('scoreItem — completeness', () => {
  it('scores a fully-populated venue near 100', () => {
    const { result } = renderHook(() => useQualityGates());
    const score = result.current.scoreItem(
      {
        name: 'Berghain',
        description: 'famous techno club',
        category: 'club',
        address: 'Am Wriezener Bahnhof',
        city: 'Berlin',
        country: 'Germany',
      },
      'venues',
    );
    expect(score.completeness).toBeGreaterThanOrEqual(90);
  });

  it('reports missing required fields in details', () => {
    const { result } = renderHook(() => useQualityGates());
    const score = result.current.scoreItem({ name: 'X' }, 'venues');
    const missing = score.details.filter(d => d.issue?.startsWith('Missing required field'));
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.some(d => d.field === 'description')).toBe(true);
  });

  it("returns score=100 for content types with no REQUIRED_FIELDS entry", () => {
    const { result } = renderHook(() => useQualityGates());
    const score = result.current.scoreItem({}, 'unknown_type');
    expect(score.completeness).toBe(100);
  });
});

describe('scoreItem — validity', () => {
  it('flags invalid URLs', () => {
    const { result } = renderHook(() => useQualityGates());
    const score = result.current.scoreItem(
      { name: 'X', website: 'not-a-url', description: 'd', category: 'c', address: 'a', city: 'C', country: 'G' },
      'venues',
    );
    const urlIssue = score.details.find(d => d.field === 'website' && d.issue?.includes('Invalid URL'));
    expect(urlIssue).toBeDefined();
  });

  it('flags invalid emails', () => {
    const { result } = renderHook(() => useQualityGates());
    const score = result.current.scoreItem({ contact_email: 'not-an-email' }, 'unknown_type');
    const issue = score.details.find(d => d.issue?.includes('Invalid email'));
    expect(issue).toBeDefined();
  });

  it('rejects out-of-range latitude / longitude', () => {
    const { result } = renderHook(() => useQualityGates());
    const score = result.current.scoreItem({ latitude: 200, longitude: -300 }, 'unknown_type');
    expect(score.details.some(d => d.issue?.includes('Invalid latitude'))).toBe(true);
    expect(score.details.some(d => d.issue?.includes('Invalid longitude'))).toBe(true);
  });

  it('returns validity=100 when no validation-relevant fields are present', () => {
    const { result } = renderHook(() => useQualityGates());
    const score = result.current.scoreItem({ foo: 1, bar: 'x' }, 'unknown_type');
    expect(score.validity).toBe(100);
  });
});

describe('getDecision', () => {
  it('returns auto_approve at or above the autoApprove threshold', () => {
    const { result } = renderHook(() => useQualityGates());
    expect(
      result.current.getDecision({ overall: 95, completeness: 95, validity: 95, uniqueness: 100, details: [] }),
    ).toBe('auto_approve');
  });

  it('returns review between the two thresholds', () => {
    const { result } = renderHook(() => useQualityGates());
    expect(
      result.current.getDecision({ overall: 70, completeness: 70, validity: 70, uniqueness: 100, details: [] }),
    ).toBe('review');
  });

  it('returns reject below the review threshold', () => {
    const { result } = renderHook(() => useQualityGates());
    expect(
      result.current.getDecision({ overall: 30, completeness: 30, validity: 30, uniqueness: 100, details: [] }),
    ).toBe('reject');
  });

  it('honors custom thresholds', () => {
    const { result } = renderHook(() => useQualityGates({ autoApprove: 50, review: 30 }));
    expect(
      result.current.getDecision({ overall: 55, completeness: 55, validity: 55, uniqueness: 100, details: [] }),
    ).toBe('auto_approve');
  });
});

describe('applyQualityGate', () => {
  it('records the gate result in content_flags and returns the decision', async () => {
    state.results.push({ data: null, error: null });

    const { result } = renderHook(() => useQualityGates());
    const out = await result.current.applyQualityGate(
      'stg-1',
      {
        name: 'X',
        description: 'd',
        category: 'c',
        address: 'a',
        city: 'C',
        country: 'G',
      },
      'venues',
    );

    expect(out.decision).toMatch(/auto_approve|review|reject/);
    expect(state.calls[0].table).toBe('content_flags');
    const insert = state.calls[0].chain.find(s => s.method === 'insert');
    const payload = insert?.args[0] as Record<string, unknown>;
    expect(payload.module_name).toBe('quality-gate');
    expect(payload.content_id).toBe('stg-1');
  });

  it('does not throw when recording fails — logs and returns decision', async () => {
    state.results.push({ data: null, error: { message: 'boom' } });

    const { result } = renderHook(() => useQualityGates());
    const out = await result.current.applyQualityGate('stg-2', {}, 'venues');
    expect(out.decision).toBe('reject');
  });
});

describe('thresholds exposed', () => {
  it('exposes the merged thresholds object', () => {
    const { result } = renderHook(() => useQualityGates({ autoApprove: 80 }));
    expect(result.current.thresholds).toEqual({ autoApprove: 80, review: 60, reject: 0 });
  });
});
