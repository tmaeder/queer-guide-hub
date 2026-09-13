/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

/**
 * The ROUTES patterns in SearchTelemetryProvider are anchored at "/", e.g.
 * /^\/venues\/([^/]+)/. A localized path — /de/venues/berghain — matched none
 * of them, so the implicit `view` event was silently dropped for every visitor
 * on 10 of the 11 supported locales, and the personalization bias vector only
 * ever learned from English-locale traffic.
 *
 * The sibling suite deliberately does not exercise the debounced fire path.
 * This one does, because the locale fix is only observable there.
 */

const trackSearchEvent = vi.hoisted(() => vi.fn());

vi.mock('@/lib/searchClient', () => ({ trackSearchEvent }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
// The resolved id must be DERIVED FROM THE SLUG. The provider keeps a
// module-level `seenInSession` map keyed `${type}:${id}` with a 5-minute
// window, so a mock returning one constant id makes the first venue view
// suppress every later one — which looked exactly like the locale fix not
// working, and would have sent me back into the source for no reason.
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedFrom: () => ({
    select: () => ({
      eq: (_col: string, slug: string) => ({
        maybeSingle: () => Promise.resolve({ data: { id: `id-${slug}` }, error: null }),
      }),
    }),
  }),
}));

const { useSearchTelemetry } = await import('../SearchTelemetryProvider');

function Probe() {
  useSearchTelemetry();
  return null;
}

/** Drives the 1s debounce plus the async slug resolution to completion. */
async function settle() {
  await vi.advanceTimersByTimeAsync(1200);
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  trackSearchEvent.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SearchTelemetryProvider — localized routes', () => {
  it('fires a view for an English path (positive control)', async () => {
    render(
      <MemoryRouter initialEntries={['/venues/control-venue']}>
        <Probe />
      </MemoryRouter>,
    );
    await settle();

    expect(trackSearchEvent).toHaveBeenCalledTimes(1);
    expect(trackSearchEvent.mock.calls[0][0]).toBe('view');
    expect(trackSearchEvent.mock.calls[0][1]).toMatchObject({ type: 'venue' });
  });

  it.each([
    ['/de/venues/german-venue', 'venue'],
    ['/ja/city/japanese-city', 'city'],
    ['/ar/news/arabic-article', 'news'],
  ])('fires a view for the localized path %s', async (path, type) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <Probe />
      </MemoryRouter>,
    );
    await settle();

    expect(trackSearchEvent).toHaveBeenCalledTimes(1);
    expect(trackSearchEvent.mock.calls[0][1]).toMatchObject({ type });
  });

  it('records the RAW path in the event metadata so the locale stays visible', async () => {
    // The locale is stripped for MATCHING, not for recording. Losing it here
    // would make "which locales do people actually browse in" unanswerable.
    render(
      <MemoryRouter initialEntries={['/de/venues/metadata-venue']}>
        <Probe />
      </MemoryRouter>,
    );
    await settle();

    expect(trackSearchEvent.mock.calls[0][2]).toMatchObject({
      slug: 'metadata-venue',
      path: '/de/venues/metadata-venue',
    });
  });

  it('still fires nothing on a path that matches no entity route', async () => {
    render(
      <MemoryRouter initialEntries={['/about']}>
        <Probe />
      </MemoryRouter>,
    );
    await settle();

    expect(trackSearchEvent).not.toHaveBeenCalled();
  });
});
