/**
 * The day-level itinerary generator.
 *
 * `generateLine` (src/lib/lines/generateLine.ts) chooses WHICH cities a trip
 * visits. This chooses what happens inside one of them, day by day, slot by
 * slot. It is a deliberate sibling and inherits that file's conventions rather
 * than inventing new ones.
 *
 * PURE ON PURPOSE. No `Date.now()`, no `Math.random()`, no network, no imports
 * from React. The seed is injected, so the same `(pool, input)` always produces
 * the same itinerary — which is what makes it unit-testable, what makes a
 * reroll a seed bump rather than a re-fetch, and what lets a plan be shared as
 * `?seed=`. `Math.random()` may CHOOSE a seed at the call site; it must never
 * be reached from inside here.
 *
 * THE ONE RULE THAT MATTERS: this function never pads.
 *
 * A slot with no eligible candidate is returned EMPTY, carrying the reason it
 * is empty. It is never filled with the nearest cafe to make the day look
 * complete. A traveller who is shown a plan with a bar in it at 10am, or the
 * same venue twice, stops believing the rest of the plan — and the rest of the
 * plan is where the safety information lives.
 *
 * THREE THINGS IT REFUSES TO PRETEND IT KNOWS
 *
 * 1. TIME OF DAY, for a venue whose category carries no signal. The pool
 *    reports `dayPartKnown`; when it is false the array is a permissive "any
 *    slot", not a claim, and such a candidate is ranked BELOW every known match
 *    and never used as evidence that a slot is well-filled.
 *    (The stored `venues.day_part` column is not read at all — it was derived
 *    from `category` in May 2026, `category` has been rewritten nightly since
 *    August, and 51% of bars now contradict it. See the pool migration.)
 *
 * 2. ACCESSIBILITY. `venues.accessibility_attributes` is non-empty on 6 of
 *    25,178 live venues. Treating a need as a FILTER would empty the pool and
 *    present that emptiness as "nowhere here is accessible", which is a false
 *    and harmful claim about real places. A match ranks a venue UP; an unlisted
 *    venue is never dropped, and `accessibilityCoverage` reports how many
 *    candidates published anything at all so the UI can say so out loud.
 *
 * 3. BUDGET. `venues.price_range` is non-null on 564 of 25,178 live rows and
 *    562 of those are bars. Budget is a soft ranking signal where present and
 *    `budgetCoverage` reports the same honest denominator. It never filters.
 */

import { mulberry32, type PaceId, type VibeId } from '@/lib/lines/generateLine';
import { calculateDistanceKm } from '@/utils/calculateDistance';
import { slugsForNeed } from '@/lib/accessibilityNeeds';
// Type-only: erased at compile, so this adds no runtime dependency and the
// file stays pure. Re-exported rather than redeclared so the tier vocabulary
// cannot drift from the column's CHECK constraint, which the hook mirrors.
import type { BudgetTier } from '@/hooks/useUserTravelPreferences';

export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';

/** Chronological order. Slots are always returned in this order. */
export const DAY_PARTS: readonly DayPart[] = ['morning', 'afternoon', 'evening', 'night'] as const;

export type { BudgetTier };

/**
 * One row of `itinerary_candidate_pool`, camel-cased.
 *
 * Nullability here is the MEASURED shape, not the generated one. A Postgres
 * `RETURNS TABLE` signature carries no nullability information, so the type
 * generator marks every output column non-null — which for this pool is wrong
 * on the majority of rows for `priceLevel` (97.8% null), `rating`,
 * `subtype` and `imageUrl`. Same correction, and same reason, as
 * `useLineStationPool`.
 */
export interface Candidate {
  kind: 'venue' | 'event';
  id: string;
  name: string;
  slug: string | null;
  cityId: string;
  countryId: string | null;
  latitude: number;
  longitude: number;
  /** `venues.category` for a venue, `events.event_type` for an event. */
  category: string | null;
  subtype: string | null;
  dayPart: DayPart[];
  /** False when the day part is a permissive default rather than a signal. */
  dayPartKnown: boolean;
  tags: string[];
  accessibilityAttributes: string[];
  amenities: string[];
  priceLevel: number | null;
  isFree: boolean | null;
  qualityScore: number | null;
  rating: number | null;
  imageUrl: string | null;
  /** ISO timestamp. Events only. */
  startsAt: string | null;
  endsAt: string | null;
  /** The venue an event happens at, when known. */
  venueId: string | null;
}

export interface ItineraryDayInput {
  /** `yyyy-MM-dd`. */
  date: string;
  cityId: string;
  cityName: string;
}

export interface GenerateItineraryInput {
  days: ItineraryDayInput[];
  /** Shared vocabulary with `/trips/discover` — one vibe list, not two. */
  vibe: VibeId | null;
  pace: PaceId;
  budget: BudgetTier | null;
  /** Category values from `travel_preferences.accessibility_needs`. */
  accessibilityNeeds: string[];
  group: 'solo' | 'group';
  seed: number;
  /** Entity ids already on the trip. Never suggested again. */
  excludeIds?: string[];
}

export type SlotOutcome =
  /** A real candidate was placed. */
  | 'filled'
  /** Nothing in the pool is eligible for this slot at all. */
  | 'no_candidate'
  /** Eligible candidates existed but were all used earlier in the trip. */
  | 'exhausted';

export interface ItinerarySlot {
  dayPart: DayPart;
  candidate: Candidate | null;
  outcome: SlotOutcome;
  /** Needs from the input that this candidate publishes an attribute for. */
  matchedNeeds: string[];
  /** True when the candidate's day part was a default rather than a signal. */
  dayPartAssumed: boolean;
  /** Straight-line km from the previous filled slot that day. */
  distanceFromPrevKm: number | null;
}

export interface ItineraryDayResult {
  date: string;
  cityId: string;
  cityName: string;
  slots: ItinerarySlot[];
}

export type ItineraryOutcome =
  /** Every requested slot was filled. */
  | 'ok'
  /** Some slots are empty. The plan is still usable; the gaps are named. */
  | 'partial'
  /** Too little in the pool to build anything. Render the reason, not a plan. */
  | 'too_few_candidates';

export interface ItineraryResult {
  days: ItineraryDayResult[];
  outcome: ItineraryOutcome;
  requestedSlots: number;
  filledSlots: number;
  /** Candidates considered after vibe/exclusion filtering. */
  eligibleCount: number;
  poolSize: number;
  /**
   * How many pool candidates publish ANY accessibility attribute, and any
   * price level. Denominators, so the UI can state coverage instead of
   * implying that silence is a "no".
   */
  accessibilityCoverage: { withData: number; total: number };
  budgetCoverage: { withData: number; total: number };
  seed: number;
}

// ── Vibe ⇄ category ────────────────────────────────────────────────────
//
// The same mapping `line_station_pool` uses for its per-city counts, so a city
// picked for `nightlife` on /trips/discover is filled with the categories that
// got it picked. Duplicating this with different members is how the two levels
// would quietly disagree.
const VIBE_CATEGORIES: Record<VibeId, readonly string[]> = {
  nightlife: ['bar', 'club'],
  sauna: ['sauna', 'cruising'],
  slow: ['cafe', 'restaurant'],
  community: ['community_center', 'gallery', 'theater'],
  outdoors: ['outdoor'],
};

/**
 * Day parts a vibe leans into, best first.
 *
 * Pace decides HOW MANY slots a day gets; the vibe decides WHICH ones. A slow
 * nightlife day is an evening and a night, not a morning and an afternoon —
 * taking the first N of a fixed chronological ladder would have produced the
 * latter, which is the wrong two slots for the most-picked vibe.
 */
const VIBE_SLOT_PRIORITY: Record<VibeId, readonly DayPart[]> = {
  nightlife: ['evening', 'night', 'afternoon', 'morning'],
  sauna: ['afternoon', 'evening', 'night', 'morning'],
  slow: ['morning', 'afternoon', 'evening', 'night'],
  community: ['afternoon', 'morning', 'evening', 'night'],
  outdoors: ['morning', 'afternoon', 'evening', 'night'],
};

const DEFAULT_SLOT_PRIORITY: readonly DayPart[] = ['afternoon', 'evening', 'morning', 'night'];

const PACE_SLOT_COUNT: Record<PaceId, number> = { slow: 2, steady: 3, sprint: 4 };

/**
 * How far a known day part outranks a permissive default. Wider than the
 * quality terms' combined spread on purpose — see `scoreCandidate`.
 */
const KNOWN_DAY_PART_MARGIN = 1.5;

/** Fewer than this in the eligible set and there is no plan to make. */
const MIN_ELIGIBLE = 4;

/**
 * Slots for one day, chronological.
 *
 * Exported for the tests and for the UI's "what will this ask for" preview —
 * the preview must not re-derive this, or the two drift.
 */
export function slotsForDay(vibe: VibeId | null, pace: PaceId): DayPart[] {
  const priority = vibe ? VIBE_SLOT_PRIORITY[vibe] : DEFAULT_SLOT_PRIORITY;
  const wanted = priority.slice(0, PACE_SLOT_COUNT[pace]);
  return DAY_PARTS.filter((p) => wanted.includes(p));
}

/** Local calendar date of an event, in the day's own frame. */
function isoDate(ts: string): string {
  return ts.slice(0, 10);
}

/**
 * Score a candidate for a slot it is already eligible for.
 *
 * There is no `slot` parameter and that is deliberate: the caller has already
 * filtered to candidates whose day part includes the slot, so every term that
 * could read it would be constant across the comparison.
 */
function scoreCandidate(
  c: Candidate,
  vibe: VibeId | null,
  budget: BudgetTier | null,
  needSlugs: Set<string>,
  prev: Candidate | null,
  jitter: number,
): number {
  let score = 0;

  // Quality is the spine. `quality_score` is 0-100; `rating` is 0-10 and is
  // present on a minority, so it is a tiebreak and not a second spine.
  score += (c.qualityScore ?? 50) / 100;
  score += (c.rating ?? 0) / 40;

  // A dated event in its own slot is the day's fixed point, not a suggestion.
  // It outranks any venue by a margin no other term can close.
  if (c.kind === 'event') score += 2.5;

  // Vibe match.
  if (vibe && c.category && VIBE_CATEGORIES[vibe].includes(c.category)) score += 1.2;

  // A known day part always beats a permissive default in the same slot.
  //
  // Stated as ONE term with a margin, not as a bonus plus a matching penalty:
  // every candidate reaching this point already includes `slot` in its day
  // part (that is the filter above), so `dayPartKnown && includes(slot)` is
  // just `dayPartKnown`, and splitting it in two only made the magnitude
  // ambiguous. The margin is deliberately wider than the largest spread the
  // quality terms can produce (1.0 quality + 0.25 rating + 0.08 jitter), so
  // quality cannot buy a venue past the fact that we do not know when to
  // visit it. Cheap popularity is exactly what would otherwise fill an
  // evening with a shop.
  if (c.dayPartKnown) score += KNOWN_DAY_PART_MARGIN;

  // Accessibility RANKS, never filters — see the header. A venue that publishes
  // nothing is not penalised, because silence is not a "no".
  if (needSlugs.size > 0) {
    const hits = c.accessibilityAttributes.filter((a) => needSlugs.has(a)).length;
    if (hits > 0) score += 0.6 + Math.min(hits, 3) * 0.1;
  }

  // Budget, soft, and only where the row actually says something.
  if (budget && c.priceLevel != null) {
    const want = budget === 'budget' ? 1 : budget === 'mid' ? 2 : 4;
    score += 0.4 - Math.min(Math.abs(c.priceLevel - want), 3) * 0.15;
  }
  if (budget === 'budget' && c.isFree === true) score += 0.3;

  // Geographic coherence within the day: a plan that crosses the city four
  // times is not a plan. Decays rather than cliffs, so a genuinely better
  // candidate a little further away still wins.
  if (prev) {
    const km = calculateDistanceKm(prev.latitude, prev.longitude, c.latitude, c.longitude);
    score -= Math.min(km, 20) * 0.05;
  }

  // Deterministic tiebreak. Small enough that it only separates candidates the
  // real terms rank equally, big enough that a reroll visibly rerolls.
  return score + jitter * 0.08;
}

export function generateItinerary(
  pool: Candidate[],
  input: GenerateItineraryInput,
): ItineraryResult {
  const { days, vibe, pace, budget, accessibilityNeeds, seed } = input;
  const rng = mulberry32(seed);

  const accessibilityCoverage = {
    withData: pool.filter((c) => c.accessibilityAttributes.length > 0).length,
    total: pool.length,
  };
  const budgetCoverage = {
    withData: pool.filter((c) => c.priceLevel != null || c.isFree != null).length,
    total: pool.length,
  };

  const needSlugs = new Set(accessibilityNeeds.flatMap((n) => slugsForNeed(n)));
  const excluded = new Set(input.excludeIds ?? []);

  // A vibe narrows venues to its categories, but never narrows EVENTS — an
  // event is dated and the traveller is in the city that day either way, and
  // event_type is a free-text taxonomy that no category list can gate cleanly.
  const eligible = pool.filter((c) => {
    if (excluded.has(c.id)) return false;
    if (c.kind === 'event') return true;
    if (!vibe) return true;
    return c.category != null && VIBE_CATEGORIES[vibe].includes(c.category);
  });

  const slotPlan = slotsForDay(vibe, pace);
  const requestedSlots = days.length * slotPlan.length;

  if (eligible.length < MIN_ELIGIBLE) {
    return {
      days: days.map((d) => ({
        ...d,
        slots: slotPlan.map((dayPart) => ({
          dayPart,
          candidate: null,
          outcome: 'no_candidate' as const,
          matchedNeeds: [],
          dayPartAssumed: false,
          distanceFromPrevKm: null,
        })),
      })),
      outcome: 'too_few_candidates',
      requestedSlots,
      filledSlots: 0,
      eligibleCount: eligible.length,
      poolSize: pool.length,
      accessibilityCoverage,
      budgetCoverage,
      seed,
    };
  }

  // Never twice in one trip. Same rule as `generateLine` never repeating a
  // station: a plan that sends you to the same bar on Tuesday and Thursday
  // reads as a bug even when the ranking honestly put it first both times.
  const used = new Set<string>();
  let filledSlots = 0;

  const resultDays: ItineraryDayResult[] = days.map((day) => {
    let prev: Candidate | null = null;

    const slots: ItinerarySlot[] = slotPlan.map((dayPart) => {
      const forSlot = eligible.filter((c) => {
        if (used.has(c.id)) return false;
        if (c.cityId !== day.cityId) return false;
        // A dated event only exists on its own date.
        if (c.kind === 'event') {
          return (
            c.startsAt != null && isoDate(c.startsAt) === day.date && c.dayPart.includes(dayPart)
          );
        }
        return c.dayPart.includes(dayPart);
      });

      if (forSlot.length === 0) {
        // Tell the two empties apart: nothing was ever eligible here, or it was
        // and earlier days took it. They mean different things to a reader and
        // to anyone debugging a thin city.
        const everEligible = eligible.some(
          (c) =>
            c.cityId === day.cityId &&
            c.dayPart.includes(dayPart) &&
            (c.kind !== 'event' || (c.startsAt != null && isoDate(c.startsAt) === day.date)),
        );
        return {
          dayPart,
          candidate: null,
          outcome: everEligible ? ('exhausted' as const) : ('no_candidate' as const),
          matchedNeeds: [],
          dayPartAssumed: false,
          distanceFromPrevKm: null,
        };
      }

      // One rng draw per candidate, always in pool order, so the sequence is a
      // function of (seed, pool order) alone and cannot drift with the filter.
      let best = forSlot[0];
      let bestScore = -Infinity;
      for (const c of forSlot) {
        const s = scoreCandidate(c, vibe, budget, needSlugs, prev, rng());
        if (s > bestScore) {
          bestScore = s;
          best = c;
        }
      }

      used.add(best.id);
      filledSlots += 1;
      const distanceFromPrevKm = prev
        ? calculateDistanceKm(prev.latitude, prev.longitude, best.latitude, best.longitude)
        : null;
      prev = best;

      return {
        dayPart,
        candidate: best,
        outcome: 'filled' as const,
        matchedNeeds: accessibilityNeeds.filter((n) =>
          slugsForNeed(n).some((s) => best.accessibilityAttributes.includes(s)),
        ),
        dayPartAssumed: !best.dayPartKnown,
        distanceFromPrevKm,
      };
    });

    return { date: day.date, cityId: day.cityId, cityName: day.cityName, slots };
  });

  return {
    days: resultDays,
    outcome: filledSlots === requestedSlots ? 'ok' : 'partial',
    requestedSlots,
    filledSlots,
    eligibleCount: eligible.length,
    poolSize: pool.length,
    accessibilityCoverage,
    budgetCoverage,
    seed,
  };
}
