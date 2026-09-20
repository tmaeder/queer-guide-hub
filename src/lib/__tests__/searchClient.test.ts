/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getSessionId,
  trackSearchEvent,
  submitFeedback,
  submitOnboarding,
  fetchSimilar,
  fetchTrending,
  fetchRecommendations,
  fetchAutocomplete,
} from '../searchClient';
import { CONSENT_STORAGE_KEY, CONSENT_VERSION } from '@/lib/analyticsConsent';

const SEARCH_URL = 'https://search.queer.guide';

/**
 * Grant analytics consent the way `useCookieConsent.tsx` writes it.
 *
 * `trackSearchEvent` is consent-gated (2026-09-19) and `beforeEach` clears
 * localStorage, so every tracking assertion has to opt in first. The key and
 * version are imported rather than written out: a literal copy would keep
 * passing after either moved, which is the stale-copy failure the single
 * `analyticsConsent` module exists to prevent.
 */
function grantAnalyticsConsent(): void {
  localStorage.setItem(
    CONSENT_STORAGE_KEY,
    JSON.stringify({
      preferences: { necessary: true, functional: true, analytics: true, marketing: false },
      version: CONSENT_VERSION,
      timestamp: new Date().toISOString(),
    }),
  );
}
let fetchSpy: ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  localStorage.clear();
  fetchSpy = vi.fn().mockResolvedValue(jsonResponse({}));
  vi.stubGlobal('fetch', fetchSpy);
  // Stable session id.
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-0000-0000-000000000001');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('getSessionId', () => {
  it('generates and persists a UUID on first call', () => {
    const id = getSessionId();
    expect(id).toBe('00000000-0000-0000-0000-000000000001');
    expect(localStorage.getItem('qg_sid')).toBe(id);
  });

  it('reuses the stored id on subsequent calls', () => {
    localStorage.setItem('qg_sid', 'existing');
    expect(getSessionId()).toBe('existing');
  });
});

describe('trackSearchEvent', () => {
  beforeEach(grantAnalyticsConsent);

  it("POSTs to /track with credentials='include'", async () => {
    await trackSearchEvent('click', { type: 'venue', id: 'v1' }, { rank: 2 }, 'u1');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${SEARCH_URL}/track`);
    expect(opts.method).toBe('POST');
    expect(opts.credentials).toBe('include');
    expect(JSON.parse(opts.body)).toMatchObject({
      user_id: 'u1',
      event_type: 'click',
      entity_type: 'venue',
      entity_id: 'v1',
      metadata: { rank: 2 },
    });
  });

  it('swallows fetch errors silently', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('offline'));
    await expect(trackSearchEvent('click', { type: 'venue', id: 'v1' })).resolves.toBeUndefined();
  });
});

/**
 * The gate itself, asserted in both directions.
 *
 * The positive cases above all grant consent first, and a suite that only ever
 * grants it would pass unchanged against a build with the gate deleted — the
 * vacuous-assertion shape. These are the tests that fail if it goes.
 */
describe('trackSearchEvent consent gate', () => {
  it('writes nothing when consent was never given', async () => {
    await trackSearchEvent('click', { type: 'venue', id: 'v1' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('writes nothing when analytics is explicitly refused', async () => {
    localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({
        preferences: { necessary: true, functional: true, analytics: false, marketing: false },
        version: CONSENT_VERSION,
      }),
    );
    await trackSearchEvent('click', { type: 'venue', id: 'v1' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('writes nothing when the stored consent is a stale version', async () => {
    // The version bump is how the policy re-asks; a stale grant is not a grant.
    grantAnalyticsConsent();
    const stored = JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY) as string);
    localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ ...stored, version: `${CONSENT_VERSION}-old` }),
    );
    await trackSearchEvent('click', { type: 'venue', id: 'v1' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('honours Do Not Track even with consent granted', async () => {
    grantAnalyticsConsent();
    // jsdom's navigator has no doNotTrack property at all, so it cannot be
    // spied. isDoNotTrackEnabled() reads window.doNotTrack first, and window
    // is globalThis here, so the stub lands on the branch that runs — and
    // afterEach's unstubAllGlobals() takes it back off.
    vi.stubGlobal('doNotTrack', '1');
    await trackSearchEvent('click', { type: 'venue', id: 'v1' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not gate submitFeedback, which is user-initiated', async () => {
    // Deliberate asymmetry, per searchClient.ts: passive telemetry is gated,
    // an action the visitor took is not. Asserting it keeps a future widening
    // of the gate from silently swallowing feedback.
    await submitFeedback({ type: 'venue', id: 'v1' }, 'up', 'pride', 'u1');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('submitFeedback', () => {
  it("POSTs to /feedback with credentials='include'", async () => {
    await submitFeedback({ type: 'venue', id: 'v1' }, 'up', 'pride', 'u1');
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${SEARCH_URL}/feedback`);
    expect(opts.credentials).toBe('include');
    expect(JSON.parse(opts.body)).toMatchObject({
      user_id: 'u1',
      entity_type: 'venue',
      entity_id: 'v1',
      vote: 'up',
      query: 'pride',
    });
  });

  it('clears qg_sid when worker reports session_verified', async () => {
    localStorage.setItem('qg_sid', 'legacy');
    fetchSpy.mockResolvedValueOnce(jsonResponse({ session_verified: true }));
    await submitFeedback({ type: 'venue', id: 'v1' }, 'down');
    expect(localStorage.getItem('qg_sid')).toBeNull();
  });

  it('throws when the response is not ok', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse('boom', false, 500));
    await expect(submitFeedback({ type: 'venue', id: 'v1' }, 'up')).rejects.toThrow(
      /\/feedback 500/,
    );
  });
});

describe('submitOnboarding', () => {
  it('POSTs to /onboarding with user_id and prefs', async () => {
    await submitOnboarding('u1', { vibes: ['queer', 'art'], home_city: 'Berlin' });
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${SEARCH_URL}/onboarding`);
    expect(JSON.parse(opts.body)).toEqual({
      user_id: 'u1',
      vibes: ['queer', 'art'],
      home_city: 'Berlin',
    });
  });
});

describe('fetchSimilar', () => {
  it("POSTs to /similar with credentials='same-origin' for reads", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ results: [{ id: 'a', type: 'venue' }] }));
    const r = await fetchSimilar({ type: 'venue', id: 'v1' }, 5, ['venue']);
    expect(r).toEqual([{ id: 'a', type: 'venue' }]);

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${SEARCH_URL}/similar`);
    expect(opts.credentials).toBe('same-origin');
    expect(JSON.parse(opts.body)).toEqual({
      entity_type: 'venue',
      entity_id: 'v1',
      limit: 5,
      content_types: ['venue'],
    });
  });

  it('omits content_types when not provided', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ results: [] }));
    await fetchSimilar({ type: 'venue', id: 'v1' });
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body).not.toHaveProperty('content_types');
  });

  it('returns empty array when results is missing', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({}));
    expect(await fetchSimilar({ type: 'venue', id: 'v1' })).toEqual([]);
  });
});

describe('fetchTrending', () => {
  it('POSTs to /trending and returns the trending array', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ trending: [{ id: 'a', type: 'event' }] }));
    const r = await fetchTrending(['event'], 'Berlin', 5, 'u1');
    expect(r).toEqual([{ id: 'a', type: 'event' }]);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body).toMatchObject({
      types: ['event'],
      city: 'Berlin',
      limit: 5,
      user_id: 'u1',
    });
  });
});

describe('fetchRecommendations', () => {
  it('POSTs to /recommendations and returns the recommendations array', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ recommendations: [{ objectID: 'v1', type: 'venue', title: 'Berghain' }] }),
    );
    const r = await fetchRecommendations({
      types: ['venue'],
      city: 'Berlin',
      limit: 8,
      userId: 'u1',
    });
    expect(r).toEqual([{ objectID: 'v1', type: 'venue', title: 'Berghain' }]);
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain('/recommendations');
    const body = JSON.parse(opts.body);
    expect(body).toMatchObject({ types: ['venue'], city: 'Berlin', limit: 8, user_id: 'u1' });
  });

  it('defaults limit and returns [] when the field is absent', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({}));
    expect(await fetchRecommendations()).toEqual([]);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.limit).toBe(12);
  });
});

describe('fetchAutocomplete', () => {
  it('short-circuits to empty array for empty input', async () => {
    expect(await fetchAutocomplete('')).toEqual([]);
    expect(await fetchAutocomplete('   ')).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('POSTs to /autocomplete with query and types', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ suggestions: [{ id: 'a', type: 'venue', title: 'Berghain' }] }),
    );
    const r = await fetchAutocomplete('ber', ['venue'], 3);
    expect(r).toHaveLength(1);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body).toEqual({ query: 'ber', types: ['venue'], limit: 3 });
  });
});
