import { describe, it, expect, beforeEach, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import { callSearchIntelligence } from '../useSearchIntelligence';

beforeEach(() => {
  invokeMock.mockReset();
});

describe('callSearchIntelligence', () => {
  it('builds the path without a leading slash', async () => {
    invokeMock.mockResolvedValueOnce({ data: { success: true, data: [] }, error: null });
    await callSearchIntelligence('/indexes');
    const [path] = invokeMock.mock.calls[0];
    expect(path).toBe('search-intelligence/indexes');
  });

  it("defaults method to 'GET'", async () => {
    invokeMock.mockResolvedValueOnce({ data: { success: true, data: 'ok' }, error: null });
    await callSearchIntelligence('foo');
    const [, opts] = invokeMock.mock.calls[0];
    expect(opts.method).toBe('GET');
  });

  it('forwards custom method + body', async () => {
    invokeMock.mockResolvedValueOnce({ data: { success: true, data: {} }, error: null });
    await callSearchIntelligence('synonyms/123', { method: 'PATCH', body: { status: 'approved' } });
    const [path, opts] = invokeMock.mock.calls[0];
    expect(path).toBe('search-intelligence/synonyms/123');
    expect(opts.method).toBe('PATCH');
    expect(opts.body).toEqual({ status: 'approved' });
  });

  it('appends searchParams to the URL', async () => {
    invokeMock.mockResolvedValueOnce({ data: { success: true, data: [] }, error: null });
    await callSearchIntelligence('clusters', {
      searchParams: { status: 'active', limit: '100', empty: '', missing: undefined },
    });
    const [path] = invokeMock.mock.calls[0];
    expect(path).toContain('?');
    expect(path).toContain('status=active');
    expect(path).toContain('limit=100');
    expect(path).not.toContain('empty=');
    expect(path).not.toContain('missing=');
  });

  it('returns the envelope when present', async () => {
    invokeMock.mockResolvedValueOnce({
      data: { success: false, error: 'bad cluster' },
      error: null,
    });
    const r = await callSearchIntelligence('clusters');
    expect(r).toEqual({ success: false, error: 'bad cluster' });
  });

  it("returns success:false 'empty response' when data is null", async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: null });
    const r = await callSearchIntelligence('clusters');
    expect(r).toEqual({ success: false, error: 'empty response' });
  });

  it('wraps edge errors as success:false', async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: 'timeout' } });
    const r = await callSearchIntelligence('clusters');
    expect(r).toEqual({ success: false, error: 'timeout' });
  });

  it("falls back to 'edge function error' when error has no message", async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: {} });
    const r = await callSearchIntelligence('clusters');
    expect(r).toEqual({ success: false, error: 'edge function error' });
  });
});
