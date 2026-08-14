import { describe, expect, it } from 'vitest';
import {
  MIN_HOP_KM,
  PACE,
  VIBE_IDS,
  generateLine,
  haversineKm,
  lineDates,
  mulberry32,
  swapStation,
  type PaceId,
  type Station,
} from '../generateLine';

/**
 * A synthetic pool laid out on a grid, so distances are predictable and a test
 * failure points at the algorithm rather than at real-world geography.
 *
 * One degree of latitude is ~111 km everywhere, so the lat step controls the
 * hop distance directly. Longitude is held constant for the same reason — at
 * high latitudes a degree of longitude shrinks, and a grid that changes scale
 * with position makes "is this hop within range?" a different question in
 * different parts of the fixture.
 */
function makeStation(i: number, over: Partial<Station> = {}): Station {
  return {
    id: `city-${i}`,
    name: `City ${i}`,
    slug: `city-${i}`,
    imageUrl: `https://example.test/${i}.jpg`,
    description: `City ${i} is a place.`,
    safetyNotes: 'Same-sex relationships are legal here.',
    editorialHook: null,
    latitude: 40 + i * 2, // ~222 km apart, comfortably over MIN_HOP_KM
    longitude: 10,
    timezone: 'Europe/Berlin',
    population: 500_000,
    countryId: `country-${i}`,
    countryName: `Country ${i}`,
    countryCode: 'XX',
    currency: 'EUR',
    equalityScore: 80,
    criminalization: null,
    venueCount: 40,
    nightlifeCount: 20,
    saunaCount: 4,
    cafeCount: 8,
    communityCount: 2,
    outdoorCount: 3,
    shopCount: 2,
    eventCount: 0,
    prideCount: 0,
    nextEventAt: null,
    nextEventTitle: null,
    eventMonths: [],
    villageCount: 0,
    villageName: null,
    ...over,
  };
}

const pool = (n: number, over: (i: number) => Partial<Station> = () => ({})) =>
  Array.from({ length: n }, (_, i) => makeStation(i, over(i)));

const ids = (r: { stations: Station[] }) => r.stations.map((s) => s.id);

describe('mulberry32', () => {
  it('is deterministic for a seed and different across seeds', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    const c = mulberry32(8);
    const seqA = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(seqA);
    expect([c(), c(), c()]).not.toEqual(seqA);
  });

  it('stays inside [0, 1)', () => {
    const rng = mulberry32(1234);
    for (let i = 0; i < 500; i += 1) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('haversineKm', () => {
  it('measures a degree of latitude at about 111 km', () => {
    const km = haversineKm({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 });
    expect(km).toBeGreaterThan(110);
    expect(km).toBeLessThan(112);
  });

  it('is zero for a point against itself', () => {
    expect(haversineKm({ latitude: 52.5, longitude: 13.4 }, { latitude: 52.5, longitude: 13.4 })).toBe(
      0,
    );
  });
});

describe('generateLine — determinism', () => {
  it('returns an identical line for the same pool and input', () => {
    const p = pool(40);
    const input = { vibe: null, pace: 'steady' as PaceId, seed: 99 };
    expect(ids(generateLine(p, input))).toEqual(ids(generateLine(p, input)));
  });

  it('varies the anchor across consecutive seeds', () => {
    const p = pool(60);
    const anchors = new Set<string>();
    for (let seed = 0; seed < 20; seed += 1) {
      const r = generateLine(p, { vibe: null, pace: 'steady', seed });
      if (r.stations.length) anchors.add(r.stations[0].id);
    }
    // Twenty rolls that all land on the same handful of cities would read as a
    // broken reroll button, which is the whole reason the anchor is weighted
    // rather than argmax.
    expect(anchors.size).toBeGreaterThanOrEqual(12);
  });

  it('suppresses recent anchors when the pool has room to be choosy', () => {
    const p = pool(60);
    const first = generateLine(p, { vibe: null, pace: 'steady', seed: 3 });
    const again = generateLine(p, {
      vibe: null,
      pace: 'steady',
      seed: 3,
      recentAnchorIds: [first.stations[0].id],
    });
    expect(again.stations[0]?.id).not.toBe(first.stations[0].id);
  });
});

describe('generateLine — route sanity', () => {
  it.each(['slow', 'steady', 'sprint'] as PaceId[])(
    'respects the hop bounds for pace %s',
    (pace) => {
      const p = pool(60);
      for (let seed = 0; seed < 25; seed += 1) {
        const r = generateLine(p, { vibe: null, pace, seed });
        for (let i = 0; i < r.stations.length - 1; i += 1) {
          const km = haversineKm(r.stations[i], r.stations[i + 1]);
          expect(km).toBeGreaterThanOrEqual(MIN_HOP_KM);
          // The ordering pass reorders for the shortest path, so a hop can only
          // ever get shorter than the one the chain accepted — never longer.
          expect(km).toBeLessThanOrEqual(PACE[pace].maxHopKm);
        }
      }
    },
  );

  it('never repeats a station', () => {
    const p = pool(60);
    for (let seed = 0; seed < 30; seed += 1) {
      const r = generateLine(p, { vibe: null, pace: 'sprint', seed });
      expect(new Set(ids(r)).size).toBe(r.stations.length);
    }
  });

  it('never puts more than two stops in one country', () => {
    // Six cities per country, all within reach of each other.
    const p = pool(36, (i) => ({ countryId: `country-${Math.floor(i / 6)}` }));
    for (let seed = 0; seed < 30; seed += 1) {
      const r = generateLine(p, { vibe: null, pace: 'sprint', seed });
      const perCountry = new Map<string, number>();
      for (const s of r.stations) perCountry.set(s.countryId, (perCountry.get(s.countryId) ?? 0) + 1);
      for (const n of perCountry.values()) expect(n).toBeLessThanOrEqual(2);
    }
  });

  it('orders stops to shorten the path', () => {
    const p = pool(20);
    const r = generateLine(p, { vibe: null, pace: 'sprint', seed: 11 });
    // Stations sit on a line of latitude, so the shortest route is monotonic.
    const lats = r.stations.map((s) => s.latitude);
    const ascending = [...lats].sort((a, b) => a - b);
    const descending = [...ascending].reverse();
    expect(lats.every((v, i) => v === ascending[i]) || lats.every((v, i) => v === descending[i])).toBe(
      true,
    );
  });

  it('pins the origin first when one was named', () => {
    const p = pool(30);
    const home = p[10];
    const r = generateLine(p, {
      vibe: null,
      pace: 'steady',
      seed: 5,
      origin: { id: home.id, name: home.name, latitude: home.latitude, longitude: home.longitude },
    });
    expect(r.stations[0].id).toBe('city-10');
    expect(r.anchorSnappedFrom).toBeNull();
    expect(r.originOutOfRange).toBeNull();
  });

  // The realistic case: the pool is 346 stations and `cities` holds 5,136 rows,
  // so most people's home city is simply not a station. It must be snapped and
  // the move must be reported, never silently dropped.
  it('snaps an origin that is not a station at all and reports the move', () => {
    const p = pool(30);
    // 0.5 degrees off city-10 — about 55 km, well inside the snap radius.
    const r = generateLine(p, {
      vibe: null,
      pace: 'steady',
      seed: 5,
      origin: { name: 'Somewhere Small', latitude: 40 + 10 * 2 + 0.5, longitude: 10 },
    });
    expect(r.anchorSnappedFrom).not.toBeNull();
    expect(r.anchorSnappedFrom?.name).toBe('Somewhere Small');
    expect(r.anchorSnappedFrom?.km).toBeLessThan(80);
    expect(r.stations[0].id).toBe('city-10');
  });

  it('snaps past an origin that is in the pool but fails the vibe floor', () => {
    const p = pool(30, (i) => (i === 10 ? { nightlifeCount: 0 } : {}));
    const home = p[10];
    const r = generateLine(p, {
      vibe: 'nightlife',
      pace: 'steady',
      seed: 5,
      origin: { id: home.id, name: home.name, latitude: home.latitude, longitude: home.longitude },
    });
    expect(r.stations.some((s) => s.id === 'city-10')).toBe(false);
    expect(r.anchorSnappedFrom?.name).toBe('City 10');
  });

  it('says so when nothing is within snapping distance of the origin', () => {
    const p = pool(30);
    const r = generateLine(p, {
      vibe: null,
      pace: 'steady',
      seed: 5,
      // Mid-Atlantic — thousands of km from the grid.
      origin: { name: 'Nowhere', latitude: 30, longitude: -40 },
    });
    expect(r.anchorSnappedFrom).toBeNull();
    expect(r.originOutOfRange?.name).toBe('Nowhere');
    expect(r.originOutOfRange?.km).toBeGreaterThan(300);
    // It still draws a line rather than failing — it just admits where it starts.
    expect(r.stations.length).toBeGreaterThanOrEqual(3);
  });
});

describe('generateLine — honest degradation', () => {
  it('returns a short line rather than padding when the chain runs dry', () => {
    // Three reachable cities, then a gap far beyond any pace's reach.
    const near = pool(3);
    const far = [makeStation(50, { latitude: 5 }), makeStation(51, { latitude: 6 })];
    const r = generateLine([...near, ...far], { vibe: null, pace: 'sprint', seed: 1 });
    expect(r.delivered).toBeLessThan(r.requested);
    expect(r.outcome).not.toBe('ok');
    expect(new Set(ids(r)).size).toBe(r.stations.length);
  });

  it('reports terminus rather than a two-point line', () => {
    const p = [makeStation(0), makeStation(1)];
    const r = generateLine(p, { vibe: null, pace: 'slow', seed: 1 });
    expect(r.delivered).toBeLessThanOrEqual(2);
    expect(r.outcome).toBe('terminus');
  });

  it('names the nearest station it had to refuse', () => {
    const near = pool(2);
    // ~1,900 km north of the pair — past every pace's maxHop.
    const far = makeStation(9, { name: 'Faraway', latitude: 40 + 17 });
    // Pin the anchor. Without an origin the weighted pick could land on
    // Faraway itself, and then the station it refuses is one of the near pair —
    // a correct result, but not the one this test is about.
    const r = generateLine([...near, far], {
      vibe: null,
      pace: 'slow',
      seed: 2,
      origin: { id: near[0].id, name: near[0].name, latitude: near[0].latitude, longitude: 10 },
    });
    expect(r.outcome).not.toBe('ok');
    expect(r.nearestRefused?.name).toBe('Faraway');
    expect(r.nearestRefused!.km).toBeGreaterThan(PACE.slow.maxHopKm);
  });

  it('reaches further when long-haul is asked for explicitly', () => {
    const p = pool(5, () => ({ latitude: 0 }));
    // Spread them ~700 km apart: past slow's 400 km, inside its doubled 800 km.
    const spread = p.map((s, i) => ({ ...s, latitude: 40 + i * 6.3 }));
    const normal = generateLine(spread, { vibe: null, pace: 'slow', seed: 4 });
    const long = generateLine(spread, { vibe: null, pace: 'slow', seed: 4, longHaul: true });
    expect(long.delivered).toBeGreaterThan(normal.delivered);
  });

  it('never returns three stations from a pool of two', () => {
    const r = generateLine([makeStation(0), makeStation(1)], {
      vibe: null,
      pace: 'sprint',
      seed: 7,
    });
    expect(r.stations.length).toBeLessThanOrEqual(2);
  });

  it('always sets an outcome that matches the delivered count', () => {
    const p = pool(60);
    for (let seed = 0; seed < 30; seed += 1) {
      for (const pace of ['slow', 'steady', 'sprint'] as PaceId[]) {
        const r = generateLine(p, { vibe: null, pace, seed });
        if (r.delivered < r.requested) expect(r.outcome).not.toBe('ok');
        if (r.outcome === 'ok') expect(r.delivered).toBe(r.requested);
      }
    }
  });

  it('returns an empty line when no station clears the vibe floor', () => {
    const p = pool(20, () => ({ saunaCount: 0 }));
    const r = generateLine(p, { vibe: 'sauna', pace: 'steady', seed: 1 });
    expect(r.stations).toHaveLength(0);
    expect(r.outcome).toBe('too_few_eligible');
    expect(r.eligibleCount).toBe(0);
  });
});

describe('generateLine — vibe filtering', () => {
  it.each(VIBE_IDS)('only returns stations that clear the %s floor', (vibe) => {
    // Half the pool has nothing; the generator must not reach for it.
    const p = pool(40, (i) =>
      i % 2 === 0
        ? {}
        : {
            nightlifeCount: 0,
            saunaCount: 0,
            cafeCount: 0,
            communityCount: 0,
            outdoorCount: 0,
          },
    );
    for (let seed = 0; seed < 10; seed += 1) {
      const r = generateLine(p, { vibe, pace: 'steady', seed });
      for (const s of r.stations) expect(Number(s.id.split('-')[1]) % 2).toBe(0);
    }
  });

  it('prefers a specialist over a bigger generalist', () => {
    // A megacity with more bars in absolute terms, and a small town where bars
    // are most of what there is. The ratio term should let the town win often.
    const mega = makeStation(0, { name: 'Mega', venueCount: 800, nightlifeCount: 120 });
    const town = makeStation(1, { name: 'Town', venueCount: 14, nightlifeCount: 12 });
    const filler = pool(10).map((s, i) => ({ ...s, id: `filler-${i}`, latitude: 40 + i * 2 }));
    let townFirst = 0;
    for (let seed = 0; seed < 60; seed += 1) {
      const r = generateLine([mega, town, ...filler], { vibe: 'nightlife', pace: 'slow', seed });
      if (r.stations.some((s) => s.name === 'Town')) townFirst += 1;
    }
    expect(townFirst).toBeGreaterThan(0);
  });
});

describe('lineDates', () => {
  const from = new Date('2026-08-12T00:00:00Z');
  const result = generateLine(pool(30), { vibe: null, pace: 'steady', seed: 1 });

  it('returns null when no season was picked', () => {
    expect(lineDates(result, null, from)).toBeNull();
  });

  it('keeps at least a fortnight of lead time', () => {
    const dates = lineDates(result, new Date('2026-08-13T00:00:00Z'), from);
    expect(dates!.start).toBe('2026-08-26');
  });

  it('honours a window that is already far enough out', () => {
    const dates = lineDates(result, new Date('2027-06-01T00:00:00Z'), from);
    expect(dates!.start).toBe('2027-06-01');
  });

  it('keeps the span short enough not to spray trip_days rows', () => {
    const sprint = generateLine(pool(30), { vibe: null, pace: 'sprint', seed: 1 });
    const dates = lineDates(sprint, new Date('2027-06-01T00:00:00Z'), from);
    const days =
      (Date.parse(dates!.end) - Date.parse(dates!.start)) / 86_400_000 + 1;
    expect(days).toBeLessThanOrEqual(14);
  });
});

describe('swapStation', () => {
  const p = pool(30);
  const base = generateLine(p, { vibe: null, pace: 'steady', seed: 12 });

  it('replaces exactly one stop and leaves the others in place', () => {
    const out = swapStation(p, base, 1, 5)!;
    expect(out).not.toBeNull();
    expect(out.stations).toHaveLength(base.stations.length);
    expect(out.stations[1].id).not.toBe(base.stations[1].id);
    base.stations.forEach((s, i) => {
      if (i !== 1) expect(out.stations[i].id).toBe(s.id);
    });
  });

  // The whole point of a single-stop swap: the line has to still be a line
  // afterwards. A replacement is only legal if it sits within reach of BOTH
  // neighbours, not just of the stop it replaced.
  it('keeps the replacement within hop range of both neighbours', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const out = swapStation(p, base, 1, seed);
      if (!out) continue;
      for (let i = 0; i < out.stations.length - 1; i += 1) {
        const km = haversineKm(out.stations[i], out.stations[i + 1]);
        expect(km).toBeGreaterThanOrEqual(MIN_HOP_KM);
        expect(km).toBeLessThanOrEqual(PACE.steady.maxHopKm);
      }
    }
  });

  it('never reintroduces a station already on the line', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const out = swapStation(p, base, 2, seed);
      if (!out) continue;
      expect(new Set(ids(out)).size).toBe(out.stations.length);
    }
  });

  it('recomputes the distance and the country list', () => {
    const out = swapStation(p, base, 0, 3)!;
    expect(out.countryIds).toEqual([...new Set(out.stations.map((s) => s.countryId))]);
    expect(out.totalKm).not.toBe(undefined);
  });

  it('returns null rather than forcing a replacement that does not fit', () => {
    // Exactly enough cities for the line and nothing spare.
    const tight = pool(4);
    const line = generateLine(tight, { vibe: null, pace: 'steady', seed: 1 });
    expect(swapStation(tight, line, 1, 9)).toBeNull();
  });

  it('respects the two-stops-per-country cap after substitution', () => {
    const grouped = pool(36, (i) => ({ countryId: `country-${Math.floor(i / 6)}` }));
    const line = generateLine(grouped, { vibe: null, pace: 'sprint', seed: 4 });
    for (let seed = 0; seed < 20; seed += 1) {
      const out = swapStation(grouped, line, 1, seed);
      if (!out) continue;
      const per = new Map<string, number>();
      for (const s of out.stations) per.set(s.countryId, (per.get(s.countryId) ?? 0) + 1);
      for (const n of per.values()) expect(n).toBeLessThanOrEqual(2);
    }
  });
});

describe('generateLine — anchor retry', () => {
  /**
   * The Johannesburg shape, which is what forced this behaviour.
   *
   * One high-affinity city with a single reachable neighbour, plus a dense
   * cluster far away. A single-attempt anchor lands on the isolated pair
   * (highest affinity wins the weighted pick often) and returns two stops. The
   * pool can clearly support a four-stop line — it just does not start there.
   */
  const isolatedPlusCluster = () => {
    const isolated = [
      makeStation(90, { name: 'Isolated A', latitude: -26, longitude: 28, venueCount: 900, countryId: 'ZA' }),
      makeStation(91, { name: 'Isolated B', latitude: -29.9, longitude: 31, venueCount: 800, countryId: 'ZA' }),
    ];
    // Eight cities ~220 km apart, two per country so the country cap cannot bite.
    const cluster = Array.from({ length: 8 }, (_, i) =>
      makeStation(i, {
        latitude: 45 + i * 2,
        longitude: 10,
        venueCount: 100,
        countryId: `cluster-${Math.floor(i / 2)}`,
      }),
    );
    return [...isolated, ...cluster];
  };

  it('finds a full line where one exists instead of settling for the first anchor', () => {
    const p = isolatedPlusCluster();
    let full = 0;
    for (let seed = 0; seed < 30; seed += 1) {
      if (generateLine(p, { vibe: null, pace: 'steady', seed }).delivered === 4) full += 1;
    }
    // Before the retry this sat far below 30 — the isolated pair won the anchor
    // pick often enough to answer a third of clicks with "this is not a line".
    expect(full).toBe(30);
  });

  it('still reports a short line honestly when no anchor can do better', () => {
    // Three reachable cities and nothing else in range: every anchor stalls.
    const r = generateLine(pool(3), { vibe: null, pace: 'sprint', seed: 5 });
    expect(r.delivered).toBe(3);
    expect(r.outcome).toBe('chain_exhausted');
    expect(r.nearestRefused === null || r.nearestRefused.km > 0).toBe(true);
  });

  it('never pads, repeats or exceeds the hop bounds while retrying', () => {
    const p = isolatedPlusCluster();
    for (let seed = 0; seed < 30; seed += 1) {
      const r = generateLine(p, { vibe: null, pace: 'steady', seed });
      expect(new Set(ids(r)).size).toBe(r.stations.length);
      expect(r.stations.length).toBeLessThanOrEqual(r.requested);
      for (let i = 0; i < r.stations.length - 1; i += 1) {
        const km = haversineKm(r.stations[i], r.stations[i + 1]);
        expect(km).toBeGreaterThanOrEqual(MIN_HOP_KM);
        expect(km).toBeLessThanOrEqual(PACE.steady.maxHopKm);
      }
    }
  });

  // "Start from here" is an instruction. Quietly starting somewhere else to win
  // a longer line is exactly the class of small lie this module exists to avoid.
  it('does not re-anchor away from a named origin', () => {
    const p = isolatedPlusCluster();
    const home = p[0]; // Isolated A — deliberately a dead end
    const r = generateLine(p, {
      vibe: null,
      pace: 'steady',
      seed: 3,
      origin: { id: home.id, name: home.name, latitude: home.latitude, longitude: home.longitude },
    });
    expect(r.stations[0].id).toBe(home.id);
    expect(r.delivered).toBeLessThan(r.requested);
  });

  it('stays deterministic for a seed', () => {
    const p = isolatedPlusCluster();
    const a = generateLine(p, { vibe: null, pace: 'steady', seed: 77 });
    const b = generateLine(p, { vibe: null, pace: 'steady', seed: 77 });
    expect(ids(a)).toEqual(ids(b));
  });
});

describe('generateLine — minimum hop survives reordering', () => {
  /**
   * A metro and its suburb, plus far-apart cities.
   *
   * The grid fixture used everywhere else cannot catch this: its cities sit on
   * one line of latitude, so reordering for the shortest path never changes
   * which pairs are adjacent. Real geography does — a live line came back as
   * Washington DC → Toronto → Mississauga → Indianapolis, and Mississauga is
   * 22 km from Toronto. The chain had checked MIN_HOP only against the previous
   * pick, and the permutation pass then sat the two next to each other.
   */
  const metroAndSuburb = () => [
    makeStation(0, { name: 'Metro', latitude: 43.65, longitude: -79.38, countryId: 'CA' }),
    makeStation(1, { name: 'Suburb', latitude: 43.59, longitude: -79.64, countryId: 'CA' }),
    makeStation(2, { name: 'Capital', latitude: 38.9, longitude: -77.04, countryId: 'US' }),
    makeStation(3, { name: 'Midwest', latitude: 39.77, longitude: -86.16, countryId: 'US' }),
    makeStation(4, { name: 'East', latitude: 42.36, longitude: -71.06, countryId: 'US2' }),
    makeStation(5, { name: 'Lakeside', latitude: 41.88, longitude: -87.63, countryId: 'US3' }),
  ];

  it('never seats two stops closer than MIN_HOP, in any order', () => {
    const p = metroAndSuburb();
    for (const pace of ['slow', 'steady', 'sprint'] as PaceId[]) {
      for (let seed = 0; seed < 40; seed += 1) {
        const r = generateLine(p, { vibe: null, pace, seed });
        // Every PAIR, not just consecutive ones — the ordering is free to move
        // any of them next to any other.
        for (let i = 0; i < r.stations.length; i += 1) {
          for (let j = i + 1; j < r.stations.length; j += 1) {
            const km = haversineKm(r.stations[i], r.stations[j]);
            expect(km).toBeGreaterThanOrEqual(MIN_HOP_KM);
          }
        }
      }
    }
  });

  it('picks at most one of a metro/suburb pair', () => {
    const p = metroAndSuburb();
    for (let seed = 0; seed < 40; seed += 1) {
      const names = generateLine(p, { vibe: null, pace: 'sprint', seed }).stations.map((s) => s.name);
      expect(names.includes('Metro') && names.includes('Suburb')).toBe(false);
    }
  });
});
