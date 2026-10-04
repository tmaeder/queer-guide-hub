import { describe, expect, it } from 'vitest';
import {
  PRIVATE_PARAMS,
  SHAREABLE_PARAMS,
  fromMapParams,
  mapUrl,
  shareParams,
  shareParamsFromContext,
  shareUrl,
  toMapParams,
} from '@/lib/mapContext';
import { MAP_LINE_IDS, MAP_VIEW_IDS } from '@/components/map/mapDomain';

describe('toMapParams / fromMapParams round-trip', () => {
  it('is lossless over every view', () => {
    for (const view of MAP_VIEW_IDS) {
      const sp = toMapParams({
        view,
        lines: ['M', 'C'],
        center: [13.405, 52.52],
        zoom: 11.5,
        query: 'sauna',
        station: 'venue-abc',
      });
      const ctx = fromMapParams(sp);
      expect(ctx.view).toBe(view);
      expect(ctx.lines).toEqual(['M', 'C']);
      expect(ctx.viewport).toEqual({ center: [13.405, 52.52], zoom: 11.5 });
      expect(ctx.query).toBe('sauna');
      expect(ctx.focusedStationId).toBe('venue-abc');
    }
  });

  it('fixes the two dead links by sending a camera, not a slug', () => {
    // `/map?city=` and `/map?country=` were never in the param schema. The
    // calling component already holds a centroid and a zoom, so no resolver is
    // needed — every param here already worked.
    const url = mapUrl({ center: [13.405, 52.52], zoom: 11, lines: ['M', 'E'] });
    expect(url).toBe('/map?lines=M%2CE&lng=13.4050&lat=52.5200&z=11.00');
    expect(url).not.toContain('city=');
  });

  it('drops a partial viewport rather than inventing the missing half', () => {
    const sp = new URLSearchParams({ lat: '52.52' });
    expect(fromMapParams(sp).viewport).toBeUndefined();
  });

  it('ignores an unknown view or line instead of rendering it', () => {
    const sp = new URLSearchParams({ view: 'teleport', lines: 'M,Z' });
    const ctx = fromMapParams(sp);
    expect(ctx.view).toBeUndefined();
    expect(ctx.lines).toEqual(['M']);
  });
});

describe('the `back` chip is sanitised through the EXISTING filter', () => {
  it('keeps a same-origin path', () => {
    expect(toMapParams({ back: '/venues?q=sauna' }).get('back')).toBe('/venues?q=sauna');
  });

  it('refuses an absolute off-origin URL', () => {
    for (const hostile of [
      'https://evil.test/phish',
      '//evil.test/phish',
      '/\\evil.test',
      'javascript:alert(1)',
      'HTTPS://evil.test',
    ]) {
      expect(toMapParams({ back: hostile }).get('back'), hostile).toBeNull();
    }
  });

  it('refuses it on READ as well as on write', () => {
    // A context can arrive from anywhere, so the filter runs in both
    // directions rather than trusting that we wrote the URL.
    const sp = new URLSearchParams();
    sp.set('back', 'https://evil.test/phish');
    expect(fromMapParams(sp).back).toBeUndefined();
  });
});

/**
 * Privacy, checked DENY-BY-DEFAULT over keys.
 *
 * `expect(payload.home_lat).toBeUndefined()` passes on a payload that never
 * had the field, and keeps passing after a rename. An allowlist is the only
 * shape that survives one.
 */
describe('shareParams — deny by default', () => {
  const live = new URLSearchParams({
    view: 'heat',
    lines: 'M,C',
    q: 'sauna',
    category: 'bar',
    tags: 'leather',
    open: '1',
    from: '2026-01-01',
    to: '2026-01-07',
    era: '1970-1980',
    lat: '52.5200',
    lng: '13.4050',
    z: '11.00',
    station: 'venue-abc',
    route: 'guide:pride-trail',
    // the three that must never travel
    near: '52.5200,13.4050,5',
    accessible: '1',
    visited: '1',
    saved: '1',
    back: '/venues',
    // and something nobody has thought of yet
    experimental_tracking_id: 'xyz',
  });

  it('emits ONLY allowlisted keys', () => {
    const out = shareParams(live);
    for (const key of [...out.keys()]) {
      expect(SHAREABLE_PARAMS as readonly string[], `${key} leaked`).toContain(key);
    }
  });

  it('carries every allowlisted key that was present — the positive control', () => {
    // Without this, `shareParams` returning an empty set passes the assertion
    // above perfectly, and "Share this view" would share no view at all.
    const out = shareParams(live);
    for (const key of SHAREABLE_PARAMS) {
      expect(out.get(key), `${key} missing`).toBe(live.get(key));
    }
    expect([...out.keys()]).toHaveLength(SHAREABLE_PARAMS.length);
  });

  it('never carries precise location, accessibility needs, or history', () => {
    const out = shareParams(live);
    for (const key of PRIVATE_PARAMS) {
      expect(out.get(key), `${key} must not be shared`).toBeNull();
    }
  });

  it('the two lists are disjoint', () => {
    // A key in both would make the deny assertion unsatisfiable, and the
    // allowlist is what decides — so this catches the contradiction at the
    // vocabulary level rather than in one payload.
    for (const key of PRIVATE_PARAMS) {
      expect(SHAREABLE_PARAMS as readonly string[], key).not.toContain(key);
    }
  });

  it('drops an unknown key, which is what deny-by-default means', () => {
    expect(shareParams(live).get('experimental_tracking_id')).toBeNull();
  });
});

describe('shareUrl / shareParamsFromContext', () => {
  it('builds an absolute URL from the filtered set', () => {
    const sp = new URLSearchParams({ view: 'areas', near: '1,2,3' });
    expect(shareUrl('https://queer.guide', '/map', sp)).toBe(
      'https://queer.guide/map?view=areas',
    );
  });

  it('omits the question mark when nothing is shareable', () => {
    const sp = new URLSearchParams({ near: '1,2,3', accessible: '1' });
    expect(shareUrl('https://queer.guide', '/map', sp)).toBe('https://queer.guide/map');
  });

  it('serves the enableUrlState:false surfaces from their own context', () => {
    // The live bug this closes: `handleShare` copied `window.location.href`,
    // so on /search, /venues, city and country pages "Share this view" shared
    // none of the view.
    const out = shareParamsFromContext({
      view: 'stations',
      lines: [...MAP_LINE_IDS],
      viewport: { center: [13.405, 52.52], zoom: 11 },
      query: 'sauna',
      focusedStationId: 'venue-abc',
      back: '/venues',
    });
    expect(out.get('view')).toBe('stations');
    expect(out.get('lines')).toBe('M,E,C,T');
    expect(out.get('z')).toBe('11.00');
    expect(out.get('q')).toBe('sauna');
    expect(out.get('station')).toBe('venue-abc');
    // A referrer is the reader's own navigation, not part of the shared view.
    expect(out.get('back')).toBeNull();
  });
});
