/**
 * The /trips/discover line generator.
 *
 * Given the station pool and three playful picks, choose 3–5 real cities that
 * form a route somebody could actually travel, in an order that makes sense on
 * a map.
 *
 * PURE ON PURPOSE. No `Date.now()`, no `Math.random()`, no network, no imports
 * from React. The seed is injected, so the same `(pool, input)` always produces
 * the same line — which is what makes it unit-testable, what makes a reroll a
 * seed bump rather than a re-fetch, and what lets a line be shared as `?seed=`.
 * `Math.random()` may CHOOSE a seed at the call site; it must never be reached
 * from inside here.
 *
 * THE ONE RULE THAT MATTERS: this function never pads.
 *
 * If the chain runs out of reachable cities it returns a short line and says
 * why. It will not repeat a station, and it will not reach for a city that
 * fails the pool's definition (image, prose, safety notes, coordinates, ten
 * live venues) in exchange for a longer route. On a corpus of 346 stations a
 * padded line is not a rounding error the reader will forgive — it is the one
 * thing that would make the whole surface untrustworthy.
 */

export type VibeId = 'nightlife' | 'sauna' | 'slow' | 'community' | 'outdoors';
export type PaceId = 'slow' | 'steady' | 'sprint';

export interface Station {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  description: string | null;
  safetyNotes: string | null;
  editorialHook: string | null;
  latitude: number;
  longitude: number;
  timezone: string | null;
  population: number | null;
  countryId: string;
  countryName: string;
  countryCode: string | null;
  currency: string | null;
  equalityScore: number | null;
  /**
   * Raw `countries.lgbti_criminalization` jsonb, passed straight to
   * `getLegalityBadge`. Deliberately not pre-reduced to a boolean here: the
   * canonical parse lives in `@/utils/equalityScore` and reading either of its
   * two death-penalty fields alone is a documented way to get real countries
   * wrong.
   */
  criminalization: unknown;
  venueCount: number;
  nightlifeCount: number;
  saunaCount: number;
  cafeCount: number;
  communityCount: number;
  outdoorCount: number;
  shopCount: number;
  eventCount: number;
  prideCount: number;
  nextEventAt: string | null;
  nextEventTitle: string | null;
  eventMonths: string[];
  villageCount: number;
  villageName: string | null;
}

/**
 * Where the traveller wants to start.
 *
 * Coordinates, NOT a pool id. The pool is 346 stations and `cities` holds
 * 5,136 rows, so most people's home city is not a station — looking the origin
 * up in the pool would silently discard it for the majority of travellers, and
 * the whole point of the snap logic is that moving somebody's starting point is
 * something we SAY rather than something we do quietly. `id` is optional and is
 * only used to recognise the origin when it does happen to be a station.
 */
export interface LineOrigin {
  id?: string | null;
  name: string;
  latitude: number;
  longitude: number;
}

export interface GenerateLineInput {
  vibe: VibeId | null;
  pace: PaceId;
  /** A place the traveller wants to start from. Snapped, never silently dropped. */
  origin?: LineOrigin | null;
  seed: number;
  /** Anchors used by recent rolls, so a reroll actually rerolls. */
  recentAnchorIds?: string[];
  /** The explicit "go long-haul anyway" escape from a terminus. */
  longHaul?: boolean;
}

export type LineOutcome =
  /** Got the full count the pace asked for. */
  | 'ok'
  /** Ran out of reachable stations partway. Short line, still drawable. */
  | 'chain_exhausted'
  /** Fewer than three stops — not a line. Render plates, no track. */
  | 'terminus'
  /** The vibe filter alone leaves too little to work with. */
  | 'too_few_eligible';

export interface LineResult {
  stations: Station[];
  /** What the pace asked for. */
  requested: number;
  delivered: number;
  outcome: LineOutcome;
  /** How many stations passed the vibe filter, for honest copy. */
  eligibleCount: number;
  /**
   * Set when the origin city was not itself a station and we snapped to the
   * nearest one. The UI must SAY so — silently moving somebody's starting point
   * is the kind of small lie that makes people stop believing the rest.
   */
  anchorSnappedFrom: { name: string; km: number } | null;
  /**
   * Set when an origin was given but no station sits within snapping distance
   * of it, so the line had to start somewhere else entirely. The counterpart to
   * `anchorSnappedFrom`: between the two, an origin can never be dropped in
   * silence.
   */
  originOutOfRange: { name: string; km: number | null } | null;
  /**
   * The closest station the chain had to refuse, and by how far. This is what
   * turns "we couldn't build a line" into "the nearest match is Madrid, 1,180 km
   * — further than a steady line goes", which a reader can act on.
   */
  nearestRefused: { name: string; km: number } | null;
  /** Sum of the hops, in km. */
  totalKm: number;
  /** Distinct countries touched, in route order. */
  countryIds: string[];
  /** Echoed so the caller can persist the exact line it rendered. */
  seed: number;
  pace: PaceId;
  vibe: VibeId | null;
}

/* ── Tuning ──────────────────────────────────────────────────────────────── */

export const PACE: Record<PaceId, { stations: number; maxHopKm: number; nightsPerStation: number }> =
  {
    slow: { stations: 3, maxHopKm: 400, nightsPerStation: 3 },
    steady: { stations: 4, maxHopKm: 800, nightsPerStation: 2 },
    sprint: { stations: 5, maxHopKm: 1500, nightsPerStation: 2 },
  };

/**
 * Two cities 20 km apart are one destination with a train between them, not two
 * stops. Without this floor the generator happily produced Brighton → Hove.
 */
export const MIN_HOP_KM = 80;

/** At most two stops in one country, so a "line" is not a domestic tour. */
const MAX_PER_COUNTRY = 2;

/** How many recent anchors to suppress, so rerolling actually rerolls. */
const ANCHOR_MEMORY = 5;

/** Anchors are drawn from the top of the affinity ranking, not the whole pool. */
const ANCHOR_POOL = 40;

/** Beyond this the origin is a different part of the world, not a near miss. */
const ORIGIN_SNAP_KM = 300;

/**
 * Which venue count each vibe reads, and the floor that makes the claim honest.
 *
 * The floors are set from the measured pool (nightlife >= 5 → 154 cities,
 * sauna >= 2 → 98, slow >= 3 → 52, community >= 1 → 77, outdoors >= 2 → 38), so
 * every vibe still has enough stations to chain. Note what is NOT here:
 * `venues.category = 'other'` is 57% of the entire venue table, so a vibe built
 * on it would match most of the corpus and therefore filter nothing.
 */
const VIBE: Record<VibeId, { field: keyof Station; min: number }> = {
  nightlife: { field: 'nightlifeCount', min: 5 },
  sauna: { field: 'saunaCount', min: 2 },
  slow: { field: 'cafeCount', min: 3 },
  community: { field: 'communityCount', min: 1 },
  outdoors: { field: 'outdoorCount', min: 2 },
};

export const VIBE_IDS = Object.keys(VIBE) as VibeId[];

/* ── Primitives ──────────────────────────────────────────────────────────── */

/**
 * mulberry32 — small, fast, well-distributed 32-bit PRNG.
 *
 * Chosen over anything in a dependency because the whole point is that the
 * sequence is pinned by the seed and can never drift under us: a package bump
 * that changed the sequence would silently change every shared `?seed=` link.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EARTH_KM = 6371;
const rad = (deg: number) => (deg * Math.PI) / 180;

export function haversineKm(a: Pick<Station, 'latitude' | 'longitude'>, b: typeof a): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

function pickWeighted<T>(items: T[], weight: (item: T) => number, rng: () => number): T | null {
  let total = 0;
  for (const item of items) total += Math.max(0, weight(item));
  if (total <= 0) return items.length ? items[Math.floor(rng() * items.length)] : null;
  let roll = rng() * total;
  for (const item of items) {
    roll -= Math.max(0, weight(item));
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 1) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) out.push([items[i], ...tail]);
  }
  return out;
}

function pathKm(stations: Station[]): number {
  let sum = 0;
  for (let i = 0; i < stations.length - 1; i += 1) sum += haversineKm(stations[i], stations[i + 1]);
  return sum;
}

/* ── Scoring ─────────────────────────────────────────────────────────────── */

const countFor = (s: Station, vibe: VibeId | null): number =>
  vibe ? (s[VIBE[vibe].field] as number) : s.venueCount;

/**
 * How well a station answers the pick.
 *
 * The RATIO term is the load-bearing half. Score by raw magnitude alone and the
 * same six megacities win every roll for every vibe, because London has more of
 * everything; dividing by the city's own venue count is what lets Sitges beat
 * London for "slow" — it says "this is what this place is FOR", which is the
 * actual question a vibe pick is asking.
 */
function affinityFor(pool: Station[], vibe: VibeId | null): (s: Station) => number {
  const maxLog = Math.max(...pool.map((s) => Math.log1p(countFor(s, vibe))), 1);
  if (!vibe) {
    return (s) =>
      0.5 * (Math.log1p(s.venueCount) / maxLog) +
      0.3 * (s.villageCount > 0 ? 1 : 0) +
      0.2 * (s.editorialHook ? 1 : 0);
  }
  return (s) => {
    const n = countFor(s, vibe);
    return 0.6 * (Math.log1p(n) / maxLog) + 0.4 * (s.venueCount > 0 ? n / s.venueCount : 0);
  };
}

/** Real lines have evenly spaced stops; reward hops near the middle of the range. */
const spacing = (km: number, maxHopKm: number) =>
  Math.max(0.05, 1 - Math.abs(km - 0.55 * maxHopKm) / maxHopKm);

/* ── The generator ───────────────────────────────────────────────────────── */

export function generateLine(pool: Station[], input: GenerateLineInput): LineResult {
  const { vibe, pace, seed } = input;
  const plan = PACE[pace];
  const maxHopKm = plan.maxHopKm * (input.longHaul ? 2 : 1);
  const rng = mulberry32(seed);

  const base = (over: Partial<LineResult> = {}): LineResult => ({
    stations: [],
    requested: plan.stations,
    delivered: 0,
    outcome: 'too_few_eligible',
    eligibleCount: 0,
    anchorSnappedFrom: null,
    originOutOfRange: null,
    nearestRefused: null,
    totalKm: 0,
    countryIds: [],
    seed,
    pace,
    vibe,
    ...over,
  });

  // The pool's own definition — image, prose, safety notes, coordinates, ten
  // live venues — is enforced in SQL. Here we only apply the vibe floor.
  const eligible = vibe ? pool.filter((s) => countFor(s, vibe) >= VIBE[vibe].min) : pool.slice();

  if (eligible.length === 0) return base({ eligibleCount: 0 });

  const affinity = affinityFor(eligible, vibe);
  const origin = input.origin ?? null;

  /* Anchor. */
  let anchor: Station | null = null;
  let anchorSnappedFrom: LineResult['anchorSnappedFrom'] = null;
  let originOutOfRange: LineResult['originOutOfRange'] = null;

  if (origin) {
    const exact = origin.id ? eligible.find((s) => s.id === origin.id) : undefined;
    if (exact) {
      anchor = exact;
    } else {
      let best: { station: Station; km: number } | null = null;
      for (const s of eligible) {
        const km = haversineKm(origin, s);
        if (!best || km < best.km) best = { station: s, km };
      }
      if (best && best.km <= ORIGIN_SNAP_KM) {
        anchor = best.station;
        anchorSnappedFrom = { name: origin.name, km: Math.round(best.km) };
      } else {
        // Nothing near enough. Fall through to a free anchor, but record it —
        // a line that quietly ignores "start from Reykjavík" is worse than one
        // that says there is no matching station within 300 km of it.
        originOutOfRange = { name: origin.name, km: best ? Math.round(best.km) : null };
      }
    }
  }

  if (!anchor) {
    const ranked = [...eligible].sort((a, b) => affinity(b) - affinity(a)).slice(0, ANCHOR_POOL);
    // Suppress recent anchors so a reroll actually rerolls — unless the eligible
    // set is so small that suppressing would leave nothing to pick from.
    const recent = new Set((input.recentAnchorIds ?? []).slice(-ANCHOR_MEMORY));
    const roomToBeChoosy = eligible.length >= 2 * plan.stations;
    anchor = pickWeighted(
      ranked,
      (s) => (roomToBeChoosy && recent.has(s.id) ? 0 : affinity(s)),
      rng,
    );
  }

  if (!anchor) return base({ eligibleCount: eligible.length });

  /* Greedy chain. This is what keeps Berlin away from Sydney. */
  const line: Station[] = [anchor];
  const perCountry = new Map<string, number>([[anchor.countryId, 1]]);
  let nearestRefused: LineResult['nearestRefused'] = null;

  while (line.length < plan.stations) {
    const last = line[line.length - 1];
    const chosen = new Set(line.map((s) => s.id));
    const candidates: Station[] = [];

    for (const s of eligible) {
      if (chosen.has(s.id)) continue;
      if ((perCountry.get(s.countryId) ?? 0) >= MAX_PER_COUNTRY) continue;
      const km = haversineKm(last, s);
      if (km < MIN_HOP_KM) continue;
      if (km > maxHopKm) {
        if (!nearestRefused || km < nearestRefused.km) {
          nearestRefused = { name: s.name, km: Math.round(km) };
        }
        continue;
      }
      // Keep the whole line within reach of its anchor, or a five-stop sprint
      // spirals away from where the traveller said they wanted to be.
      if (haversineKm(anchor, s) > maxHopKm * (plan.stations - 1)) continue;
      candidates.push(s);
    }

    if (candidates.length === 0) break; // Short line. Never padded.

    const next = pickWeighted(
      candidates,
      (s) => {
        const km = haversineKm(last, s);
        const novelty = perCountry.has(s.countryId) ? 0.4 : 1;
        return Math.max(0.001, affinity(s)) * spacing(km, maxHopKm) * novelty;
      },
      rng,
    );
    if (!next) break;
    line.push(next);
    perCountry.set(next.countryId, (perCountry.get(next.countryId) ?? 0) + 1);
  }

  /* Order. n <= 5, so brute-force every permutation and take the shortest total
     path — exact, trivially testable, and no 2-opt heuristic to get subtly
     wrong. The anchor is pinned first when the traveller named a starting
     point, because "start here" is an instruction, not a preference. */
  let ordered = line;
  if (line.length > 2) {
    // Only pin when the anchor actually came from the origin. If the origin was
    // out of range the anchor is a free pick, and pinning it would freeze a
    // random city at position one for no reason.
    const pinFirst = Boolean(origin) && !originOutOfRange;
    const head = pinFirst ? [line[0]] : [];
    const rest = pinFirst ? line.slice(1) : line;
    let best: { route: Station[]; km: number } | null = null;
    for (const perm of permutations(rest)) {
      const route = [...head, ...perm];
      const km = pathKm(route);
      if (!best || km < best.km) best = { route, km };
    }
    ordered = best?.route ?? line;
  }

  const outcome: LineOutcome =
    ordered.length >= plan.stations
      ? 'ok'
      : ordered.length >= 3
        ? 'chain_exhausted'
        : 'terminus';

  return {
    stations: ordered,
    requested: plan.stations,
    delivered: ordered.length,
    outcome,
    eligibleCount: eligible.length,
    anchorSnappedFrom,
    originOutOfRange,
    nearestRefused: outcome === 'ok' ? null : nearestRefused,
    totalKm: Math.round(pathKm(ordered)),
    countryIds: [...new Set(ordered.map((s) => s.countryId))],
    seed,
    pace,
    vibe,
  };
}

/**
 * Replace ONE stop, keeping the rest of the line exactly as it is.
 *
 * "I like this line but not Milan" is a different request from "draw me another
 * line", and answering it with a full reroll would be a small lie told by the
 * button's own label. So the replacement has to satisfy the hop bounds against
 * the stop's actual NEIGHBOURS — both of them for a middle stop, one for an
 * end — which is what keeps the route coherent after the substitution.
 *
 * Returns null when nothing fits. The caller says so rather than silently
 * doing nothing or quietly redrawing the whole line.
 */
export function swapStation(
  pool: Station[],
  line: LineResult,
  index: number,
  seed: number,
): LineResult | null {
  const current = line.stations[index];
  if (!current) return null;

  const plan = PACE[line.pace];
  const rng = mulberry32(seed);
  const vibe = line.vibe;
  const eligible = vibe ? pool.filter((s) => countFor(s, vibe) >= VIBE[vibe].min) : pool;
  const affinity = affinityFor(eligible.length ? eligible : pool, vibe);

  const chosen = new Set(line.stations.map((s) => s.id));
  const prev = line.stations[index - 1];
  const next = line.stations[index + 1];

  // Country cap is measured against the line WITHOUT the stop being replaced.
  const perCountry = new Map<string, number>();
  line.stations.forEach((s, i) => {
    if (i === index) return;
    perCountry.set(s.countryId, (perCountry.get(s.countryId) ?? 0) + 1);
  });

  const fits = (s: Station, neighbour: Station | undefined) => {
    if (!neighbour) return true;
    const km = haversineKm(neighbour, s);
    return km >= MIN_HOP_KM && km <= plan.maxHopKm;
  };

  const candidates = eligible.filter(
    (s) =>
      !chosen.has(s.id) &&
      (perCountry.get(s.countryId) ?? 0) < MAX_PER_COUNTRY &&
      fits(s, prev) &&
      fits(s, next),
  );
  if (candidates.length === 0) return null;

  const replacement = pickWeighted(candidates, (s) => Math.max(0.001, affinity(s)), rng);
  if (!replacement) return null;

  const stations = line.stations.map((s, i) => (i === index ? replacement : s));
  return {
    ...line,
    stations,
    totalKm: Math.round(pathKm(stations)),
    countryIds: [...new Set(stations.map((s) => s.countryId))],
    seed,
  };
}

/**
 * Trip dates for a generated line.
 *
 * Kept here rather than in the component because it is arithmetic with one
 * genuinely load-bearing rule: `trg_trip_auto_generate_days` writes one
 * `trip_days` row per date in the range, so an unbounded span writes an
 * unbounded number of rows. `nightsPerStation` keeps a five-stop sprint at ten
 * nights.
 *
 * `from` is injected rather than read from the clock, so this stays pure.
 */
export function lineDates(
  result: LineResult,
  windowStart: Date | null,
  from: Date,
): { start: string; end: string } | null {
  if (!windowStart || result.stations.length === 0) return null;
  // Fourteen days' lead time — a line you cannot book is not a plan.
  const earliest = new Date(from.getTime() + 14 * 86_400_000);
  const start = windowStart > earliest ? windowStart : earliest;
  const nights = result.stations.length * PACE[result.pace].nightsPerStation;
  const end = new Date(start.getTime() + (nights - 1) * 86_400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}
