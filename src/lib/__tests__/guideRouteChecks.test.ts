import { describe, expect, it } from 'vitest';
import {
  classifyStop,
  classifyStops,
  orderStops,
  pickKey,
  publishBlockers,
  publishWarnings,
  routeReadiness,
  routeStopsFromPicks,
  WALK_LEG_WARN_KM,
  type RoutePickInput,
} from '@/lib/guideRouteChecks';
import type { PickEntityDisplay } from '@/lib/guidePickAdapters';

const pick = (over: Partial<RoutePickInput> = {}): RoutePickInput => ({
  id: 'p1',
  entity_type: 'venue',
  entity_id: 'v1',
  position: 1,
  ...over,
});

const display = (over: Partial<PickEntityDisplay> = {}): PickEntityDisplay => ({
  name: 'Somewhere',
  href: '/venues/somewhere',
  imagePath: null,
  metaLine: null,
  categoryLabel: 'bar',
  lat: 52.52,
  lng: 13.4,
  geo: 'own',
  ...over,
});

describe('orderStops', () => {
  it('orders by position', () => {
    const out = orderStops([pick({ id: 'c', position: 3 }), pick({ id: 'a', position: 1 })]);
    expect(out.map((p) => p.id)).toEqual(['a', 'c']);
  });

  it('breaks a DUPLICATE position deterministically — duplicates are real', () => {
    /**
     * `GuidePicksPanel.move()` swaps two positions with two INDEPENDENT
     * mutations, so a failed second one leaves two rows on the same position
     * permanently. Without an explicit tiebreak the stop numbers flicker
     * between renders.
     */
    const a = orderStops([pick({ id: 'b', position: 2 }), pick({ id: 'a', position: 2 })]);
    const b = orderStops([pick({ id: 'a', position: 2 }), pick({ id: 'b', position: 2 })]);
    expect(a.map((p) => p.id)).toEqual(['a', 'b']);
    expect(b.map((p) => p.id)).toEqual(a.map((p) => p.id));
  });

  it('does not mutate its input', () => {
    const input = [pick({ id: 'c', position: 3 }), pick({ id: 'a', position: 1 })];
    orderStops(input);
    expect(input.map((p) => p.id)).toEqual(['c', 'a']);
  });
});

describe('the three stop states are three, not two', () => {
  it('resolved: has coordinates', () => {
    expect(classifyStop(pick(), display()).state).toBe('resolved');
  });

  it('unresolved: target exists, geo resolved to none', () => {
    const c = classifyStop(pick(), display({ lat: null, lng: null, geo: 'none' }));
    expect(c.state).toBe('unresolved');
    expect(c.reason).toMatch(/no coordinates/i);
  });

  it('missing: the adapter returned nothing', () => {
    const c = classifyStop(pick(), undefined);
    expect(c.state).toBe('missing');
    // It must name the RLS possibility — the editor's own session cannot see a
    // safety-gated venue, and "deleted" would be a wrong diagnosis.
    expect(c.reason).toMatch(/safety-gated/i);
  });

  it('missing + is_orphaned names the janitor instead', () => {
    expect(classifyStop(pick({ is_orphaned: true }), undefined).reason).toMatch(/deleted/i);
  });

  it('ineligible: `geo` UNDEFINED is not the same as `geo: none`', () => {
    /**
     * A marketplace listing has no geometry by construction, so "this pick is
     * unresolved" is a false positive. Collapsing the two is what would block
     * a route for carrying a shop.
     */
    const c = classifyStop(
      pick({ entity_type: 'marketplace' }),
      display({ lat: null, lng: null, geo: undefined }),
    );
    expect(c.state).toBe('ineligible');
  });

  it('all four states are reachable — the positive control', () => {
    // Without this, a classifier that returned one state for everything would
    // satisfy each assertion above in isolation.
    const states = new Set([
      classifyStop(pick(), display()).state,
      classifyStop(pick(), display({ lat: null, lng: null, geo: 'none' })).state,
      classifyStop(pick(), undefined).state,
      classifyStop(pick(), display({ geo: undefined, lat: null, lng: null })).state,
    ]);
    expect(states.size).toBe(4);
  });
});

describe('classifyStops keys by entity_type:entity_id', () => {
  it('resolves through the map fetchPickEntities returns', () => {
    const p = pick({ entity_type: 'event', entity_id: 'e9' });
    expect(pickKey(p)).toBe('event:e9');
    const out = classifyStops([p], new Map([[pickKey(p), display()]]));
    expect(out[0].state).toBe('resolved');
  });

  it('a key mismatch reads as MISSING, not as resolved', () => {
    const p = pick({ entity_type: 'event', entity_id: 'e9' });
    const out = classifyStops([p], new Map([['venue:e9', display()]]));
    expect(out[0].state).toBe('missing');
  });
});

describe('routeStopsFromPicks', () => {
  it('keeps the pick position and NEVER renumbers survivors', () => {
    /**
     * A route with stops 1, 2, 4, 5 must SHOW a missing 3. A silently closed
     * gap is a wrong route presented as a right one.
     */
    const picks = [
      pick({ id: 'a', entity_id: 'v1', position: 1 }),
      pick({ id: 'b', entity_id: 'v2', position: 2 }),
      pick({ id: 'c', entity_id: 'v3', position: 3 }),
      pick({ id: 'd', entity_id: 'v4', position: 4 }),
    ];
    const entities = new Map<string, PickEntityDisplay>([
      ['venue:v1', display()],
      ['venue:v2', display()],
      // v3 absent → missing
      ['venue:v4', display()],
    ]);
    const stops = routeStopsFromPicks(classifyStops(picks, entities));
    expect(stops.map((s) => s.position)).toEqual([1, 2, 4]);
  });

  it('drops nothing silently: coordinates round-trip onto the station', () => {
    const stops = routeStopsFromPicks(
      classifyStops([pick()], new Map([['venue:v1', display({ lat: 1.5, lng: -2.5 })]])),
    );
    expect(stops).toHaveLength(1);
    expect(stops[0].station.lat).toBe(1.5);
    expect(stops[0].station.lng).toBe(-2.5);
  });

  it('an AREA pick draws with line NULL — invariant B, not coalesced to M', () => {
    /**
     * `lineFor('cities', …)` is null by design: geography is a VIEW, not a
     * line. A city route stop must still DRAW — it is a pin at the centroid —
     * but it must not claim to be on a line. A first draft coalesced this to
     * `'M'` so the stroke colour resolved, which published a city stop as a
     * venue-line station; `MapStation.line` is `MapLine | null` exactly so
     * this case can be honest.
     */
    const p = pick({ entity_type: 'city', entity_id: 'c1' });
    const stops = routeStopsFromPicks(classifyStops([p], new Map([['city:c1', display()]])));
    expect(stops).toHaveLength(1);
    expect(stops[0].station.line).toBeNull();
    // …and it still carries its LAYER, because the data path is layer-keyed.
    expect(stops[0].station.type).toBe('cities');
  });

  it('a POINT pick carries a real line — the contrast case', () => {
    // Without this, "area stops have line null" is satisfied by a builder that
    // returns null for everything.
    const stops = routeStopsFromPicks(
      classifyStops([pick()], new Map([['venue:v1', display({ categoryLabel: 'bar' })]])),
    );
    expect(stops[0].station.line).toBe('M');
  });

  it('an entity type with no layer mapping is skipped rather than crashing', () => {
    const p = pick({ entity_type: 'personality', entity_id: 'x1' });
    expect(
      routeStopsFromPicks(classifyStops([p], new Map([['personality:x1', display()]]))),
    ).toEqual([]);
  });
});

describe('publication gates', () => {
  const two = (entities: Map<string, PickEntityDisplay>) =>
    classifyStops(
      [
        pick({ id: 'a', entity_id: 'v1', position: 1 }),
        pick({ id: 'b', entity_id: 'v2', position: 2 }),
      ],
      entities,
    );
  const resolvedPair = new Map<string, PickEntityDisplay>([
    ['venue:v1', display({ lat: 52.52, lng: 13.4 })],
    ['venue:v2', display({ lat: 52.53, lng: 13.41 })],
  ]);

  it('passes with two resolved stops and a route kind', () => {
    expect(publishBlockers(two(resolvedPair), { route_kind: 'walk' })).toEqual([]);
  });

  it('BLOCKS on fewer than two mappable stops', () => {
    const one = new Map<string, PickEntityDisplay>([['venue:v1', display()]]);
    expect(publishBlockers(two(one), { route_kind: 'walk' }).join(' ')).toMatch(/at least 2/);
  });

  it('BLOCKS on an unresolved stop — a gap in the line is a broken line', () => {
    const withGap = new Map<string, PickEntityDisplay>([
      ['venue:v1', display()],
      ['venue:v2', display({ lat: null, lng: null, geo: 'none' })],
      ['venue:v3', display()],
    ]);
    const classified = classifyStops(
      [
        pick({ id: 'a', entity_id: 'v1', position: 1 }),
        pick({ id: 'b', entity_id: 'v2', position: 2 }),
        pick({ id: 'c', entity_id: 'v3', position: 3 }),
      ],
      withGap,
    );
    expect(publishBlockers(classified, { route_kind: 'walk' }).join(' ')).toMatch(
      /no coordinates/i,
    );
  });

  it('WARNS ONLY on a missing stop — never blocks', () => {
    /**
     * The decisive case: blocking here makes a route unpublishable because the
     * EDITOR's session cannot see a safety-gated venue, which punishes the
     * reviewer for the gate working.
     */
    const classified = classifyStops(
      [
        pick({ id: 'a', entity_id: 'v1', position: 1 }),
        pick({ id: 'b', entity_id: 'v2', position: 2 }),
        pick({ id: 'c', entity_id: 'gone', position: 3 }),
      ],
      resolvedPair,
    );
    expect(publishBlockers(classified, { route_kind: 'walk' })).toEqual([]);
    expect(publishWarnings(classified, { route_kind: 'walk' }).join(' ')).toMatch(
      /could not be loaded/i,
    );
  });

  it('BLOCKS on a missing route kind — the friendly copy of a DB constraint', () => {
    expect(publishBlockers(two(resolvedPair), {}).join(' ')).toMatch(/route kind/i);
  });

  it('warns on an implausible walking leg, and only for `walk`', () => {
    const far = new Map<string, PickEntityDisplay>([
      ['venue:v1', display({ lat: 52.52, lng: 13.4 })],
      ['venue:v2', display({ lat: 48.14, lng: 11.58 })], // Berlin → Munich
    ]);
    expect(publishWarnings(two(far), { route_kind: 'walk' }).join(' ')).toMatch(/too far to walk/i);
    expect(publishWarnings(two(far), { route_kind: 'drive' }).join(' ')).not.toMatch(/walk/i);
  });

  it('the walk threshold is a real bound, not zero', () => {
    // A 0 km threshold would warn on every route and read as noise.
    expect(WALK_LEG_WARN_KM).toBeGreaterThan(1);
  });

  it('routeReadiness agrees with its own parts', () => {
    const r = routeReadiness(two(resolvedPair), { route_kind: 'walk' });
    expect(r.canPublish).toBe(true);
    expect(r.counts).toMatchObject({ resolved: 2, unresolved: 0, missing: 0, total: 2 });
  });
});
