import { CONSENT_STORAGE_KEY, CONSENT_VERSION } from '../analyticsConsent';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { SearchFetchException, isSearchUnavailable, SEARCH_UNAVAILABLE_MESSAGE, searchFetch, searchReadFetch } from '../searchFetch';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));

describe('searchFetch', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('negotiates credentialed reads and falls back after a worker rollback', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({}, { headers: { 'X-Search-Session': 'v2' } }))
      .mockRejectedValueOnce(new TypeError('CORS'))
      .mockResolvedValueOnce(Response.json({}));
    vi.stubGlobal('fetch', fetchMock);

    const url = 'https://search.queer.guide/search';
    await searchReadFetch(url, { method: 'POST' });
    await searchReadFetch(url, { method: 'POST' });
    expect(fetchMock.mock.calls.map(([, init]) => init.credentials)).toEqual([
      'same-origin', 'include', 'same-origin',
    ]);
  });

  it('sends analytics opt-in only after negotiation and while consent is current', async () => {
    const supportsSession = () => Response.json({}, { headers: { 'X-Search-Session': 'v2' } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(supportsSession())
      .mockResolvedValueOnce(supportsSession())
      .mockResolvedValueOnce(Response.json({}));
    vi.stubGlobal('fetch', fetchMock);
    const url = 'https://search.queer.guide/search';
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({
      version: CONSENT_VERSION, preferences: { analytics: true },
    }));
    try {
      await searchReadFetch(url, { method: 'POST' });
      await searchReadFetch(url, { method: 'POST' });
      localStorage.removeItem(CONSENT_STORAGE_KEY);
      await searchReadFetch(url, { method: 'POST' });
      expect(fetchMock.mock.calls.map(([, init]) =>
        new Headers(init.headers).get('X-Search-Analytics'),
      )).toEqual([null, '1', null]);
    } finally {
      localStorage.removeItem(CONSENT_STORAGE_KEY);
    }
  });

  it('retries a deadline even when fetch rejects without an AbortError', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce((_url, { signal }: RequestInit) => new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new TypeError('aborted')), { once: true });
      }))
      .mockResolvedValueOnce(Response.json({ hits: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchFetch('/', {}, { timeoutMs: 1 })).resolves.toEqual({ hits: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not send or retry a request cancelled by the caller', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const reason = new Error('superseded');
    controller.abort(reason);

    await expect(searchFetch('/', {}, { signal: controller.signal })).rejects.toBe(reason);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exports message', () => {
    expect(SEARCH_UNAVAILABLE_MESSAGE).toBeTruthy();
  });
  it('SearchFetchException carries detail', () => {
    const e = new SearchFetchException({ kind: 'timeout', message: 'too slow' });
    expect(e.detail.kind).toBe('timeout');
    expect(e.name).toBe('SearchFetchException');
  });
  it('isSearchUnavailable true for csp_or_dns_blocked', () => {
    const e = new SearchFetchException({ kind: 'csp_or_dns_blocked', message: 'blocked', cause: null });
    expect(isSearchUnavailable(e)).toBe(true);
  });
  it('isSearchUnavailable false for random error', () => {
    expect(isSearchUnavailable(new Error('nope'))).toBe(false);
  });
});
