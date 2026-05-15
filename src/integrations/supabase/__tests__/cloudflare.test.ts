import { describe, it, expect, beforeEach, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('../client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import { cloudflareAPI } from '../cloudflare';

beforeEach(() => {
  invokeMock.mockReset();
});

describe('CloudflareAPI dispatch', () => {
  it('invokes the cloudflare-api edge function with the action and params', async () => {
    invokeMock.mockResolvedValueOnce({ data: { ok: true }, error: null });
    await cloudflareAPI.getAnalytics('2026-01-01', '2026-02-01');

    expect(invokeMock).toHaveBeenCalledWith('cloudflare-api', {
      method: 'POST',
      body: { action: 'analytics', params: { since: '2026-01-01', until: '2026-02-01' } },
    });
  });

  it.each([
    ['getZoneInfo', 'zone-info'],
    ['getDNSRecords', 'dns-records'],
    ['getPageRules', 'page-rules'],
    ['getCacheStats', 'cache-stats'],
    ['getSecuritySettings', 'security-settings'],
    ['getPerformanceSettings', 'performance-settings'],
    ['getEdgeCertificates', 'edge-certificates'],
    ['getWorkers', 'workers'],
    ['getAccountInfo', 'account-info'],
  ] as const)('%s maps to action=%s', async (method, action) => {
    invokeMock.mockResolvedValueOnce({ data: { ok: true }, error: null });
    // @ts-expect-error: dynamic dispatch
    await cloudflareAPI[method]();
    const [, opts] = invokeMock.mock.calls[0];
    expect(opts.body.action).toBe(action);
  });

  it('omits since/until params when not provided', async () => {
    invokeMock.mockResolvedValueOnce({ data: {}, error: null });
    await cloudflareAPI.getBandwidthStats();
    const [, opts] = invokeMock.mock.calls[0];
    expect(opts.body.params).toEqual({});
  });
});

describe('Error handling', () => {
  it("returns analytics fallback shape when 'analytics' fails", async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: 'edge down' } });
    const r = await cloudflareAPI.getAnalytics();
    expect(r.success).toBe(true);
    expect(r.result.totals.requests).toEqual({ all: 0, cached: 0, uncached: 0 });
    expect(r.result.timeseries).toEqual([]);
  });

  it("returns threat-analytics fallback shape on failure", async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: 'edge down' } });
    const r = await cloudflareAPI.getThreatAnalytics();
    expect(r.success).toBe(true);
    expect(r.result).toEqual([]);
    expect(r.result_info.total_count).toBe(0);
  });

  it('re-throws errors for actions without a fallback', async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: 'denied' } });
    await expect(cloudflareAPI.getZoneInfo()).rejects.toThrow('denied');
  });

  it("throws 'Failed to fetch <action>' when error has no message", async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: {} });
    await expect(cloudflareAPI.getZoneInfo()).rejects.toThrow('Failed to fetch zone-info');
  });
});
