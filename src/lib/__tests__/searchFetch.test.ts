import { CONSENT_STORAGE_KEY, CONSENT_VERSION } from '../analyticsConsent';
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  SearchFetchException,
  isSearchUnavailable,
  SEARCH_UNAVAILABLE_MESSAGE,
  resetSearchCountForTests,
  searchCountKey,
  searchFetch,
  searchReadFetch,
} from '../searchFetch';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));

describe('searchFetch', () => {
  afterEach(() => vi.unstubAllGlobals());

  const consent = () =>
    localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ version: CONSENT_VERSION, preferences: { analytics: true } }),
    );
  const optIns = (fetchMock: ReturnType<typeof vi.fn>) =>
    fetchMock.mock.calls.map(([, init]) => new Headers(init.headers).get('X-Search-Analytics'));
  const session = () => Response.json({}, { headers: { 'X-Search-Session': 'v2' } });
  afterEach(() => {
    localStorage.removeItem(CONSENT_STORAGE_KEY);
    resetSearchCountForTests();
  });

  it('assumes credentialed reads and falls back after a worker rollback', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(session())
      .mockRejectedValueOnce(new TypeError('CORS'))
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(Response.json({}));
    vi.stubGlobal('fetch', fetchMock);

    const url = 'https://search.queer.guide/search';
    await searchReadFetch(url, { method: 'POST' });
    await searchReadFetch(url, { method: 'POST' });
    await searchReadFetch(url, { method: 'POST' });
    expect(fetchMock.mock.calls.map(([, init]) => init.credentials)).toEqual([
      'include',
      'include',
      'same-origin', // retry after the CORS refusal
      'same-origin', // and no further credentialed attempt on this page
    ]);
  });

  it('opts in the first search of a page load, so a search that arrives by URL is counted', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(session());
    vi.stubGlobal('fetch', fetchMock);
    consent();
    await searchReadFetch('https://search.queer.guide/', { method: 'POST' });
    expect(optIns(fetchMock)).toEqual(['1']);
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include');
  });

  it('retries a refused first request without the opt-in header', async () => {
    // A wildcard-CORS answer does not allow X-Search-Analytics, so keeping the
    // header on the retry would fail the preflight a second time.
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('CORS'))
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(Response.json({}));
    vi.stubGlobal('fetch', fetchMock);
    consent();
    const url = 'https://search.queer.guide/';
    const res = await searchReadFetch(url, { method: 'POST' });
    await searchReadFetch(url, { method: 'POST' });
    expect(res.ok).toBe(true);
    expect(optIns(fetchMock)).toEqual(['1', null, null]);
  });

  it('does not retry a refusal that was not a credentialed attempt', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({})) // no v2: the worker cannot do sessions
      .mockRejectedValueOnce(new TypeError('offline'));
    vi.stubGlobal('fetch', fetchMock);
    const url = 'https://search.queer.guide/';
    await searchReadFetch(url, { method: 'POST' });
    await expect(searchReadFetch(url, { method: 'POST' })).rejects.toThrow('offline');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sends analytics opt-in only while consent is current', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(session())
      .mockResolvedValueOnce(session())
      .mockResolvedValueOnce(Response.json({}));
    vi.stubGlobal('fetch', fetchMock);
    const url = 'https://search.queer.guide/search';
    await searchReadFetch(url, { method: 'POST' });
    consent();
    await searchReadFetch(url, { method: 'POST' });
    localStorage.removeItem(CONSENT_STORAGE_KEY);
    await searchReadFetch(url, { method: 'POST' });
    expect(optIns(fetchMock)).toEqual([null, '1', null]);
  });

  it('stops opting in after a response from a worker without sessions', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(session())
      .mockResolvedValueOnce(session());
    vi.stubGlobal('fetch', fetchMock);
    consent();
    const url = 'https://search.queer.guide/';
    await searchReadFetch(url, { method: 'POST' });
    await searchReadFetch(url, { method: 'POST' });
    await searchReadFetch(url, { method: 'POST' });
    expect(optIns(fetchMock)).toEqual(['1', null, '1']);
  });

  it('counts the All tab and its "See all" list as one search', async () => {
    const counted = () =>
      Response.json({}, { headers: { 'X-Search-Session': 'v2', 'X-Search-Counted': '1' } });
    const notCounted = () => Response.json({}, { headers: { 'X-Search-Session': 'v2' } });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(counted()) // All tab, first request of the page
      .mockResolvedValueOnce(notCounted()) // See all: same search
      .mockResolvedValueOnce(notCounted()) // new query, worker did NOT count it
      .mockResolvedValueOnce(counted()); // same new query again: still opted in
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ version: CONSENT_VERSION, preferences: { analytics: true } }),
    );
    resetSearchCountForTests();
    const url = 'https://search.queer.guide/';
    const overview = searchCountKey('Berlin ', {});
    const seeAll = searchCountKey('berlin', { types: ['venue'], sort: 'rating' });
    const other = searchCountKey('berlin', { location: 'Berlin' });
    try {
      await searchReadFetch(url, { method: 'POST' }, { countKey: overview });
      await searchReadFetch(url, { method: 'POST' }, { countKey: seeAll });
      await searchReadFetch(url, { method: 'POST' }, { countKey: other });
      await searchReadFetch(url, { method: 'POST' }, { countKey: other });
      expect(
        fetchMock.mock.calls.map(([, init]) => new Headers(init.headers).get('X-Search-Analytics')),
      ).toEqual(['1', null, '1', '1']);
    } finally {
      localStorage.removeItem(CONSENT_STORAGE_KEY);
      resetSearchCountForTests();
    }
  });

  it('keys a search on query and filters, not on scope or sort', () => {
    expect(searchCountKey('Berlin', { types: ['event'], tags: ['a'], location: 'x' })).toBe(
      searchCountKey(' berlin', { location: 'x', tags: ['a'], sort: 'date' }),
    );
    expect(searchCountKey('berlin', { tags: ['a'] })).not.toBe(searchCountKey('berlin', {}));
    expect(searchCountKey('berlin', {})).not.toBe(searchCountKey('berlin bar', {}));
  });

  it('retries a deadline even when fetch rejects without an AbortError', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        (_url, { signal }: RequestInit) =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener('abort', () => reject(new TypeError('aborted')), {
              once: true,
            });
          }),
      )
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
    const e = new SearchFetchException({
      kind: 'csp_or_dns_blocked',
      message: 'blocked',
      cause: null,
    });
    expect(isSearchUnavailable(e)).toBe(true);
  });
  it('isSearchUnavailable false for random error', () => {
    expect(isSearchUnavailable(new Error('nope'))).toBe(false);
  });
});
