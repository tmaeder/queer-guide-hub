import {
  resolveEntityGeo,
  tripPlaceRowFromGeo,
  type EntityGeo,
  type EntityRef,
} from '@/lib/trips/resolveEntityGeo';
import type { ClassifiedStop } from '@/lib/guideRouteChecks';
import type { GuideEntityType } from '@/lib/guidePickAdapters';

/**
 * Copy a curated route into a trip.
 *
 * This is the SAVE primitive for routes, and it is deliberately the only one.
 * `useFavorites.tableMap` has no guide table and `user_place_marks` CHECKs
 * `venue|event|village|country|city`, so bookmarking a route is a migration
 * either way — and copy-into-a-trip is the stronger thing to build, because it
 * persists CONTENT the reader can then reorder and annotate rather than a
 * pointer to someone else's list.
 *
 * Three rules, each of which is a decision rather than an implementation
 * detail:
 *
 *  1. **All stops land on ONE day, unscheduled.** No auto-scheduling. The route
 *     states an order, not a timetable, and inventing arrival times would be
 *     the fabrication this codebase refuses elsewhere (`best_time_to_visit`).
 *  2. **Unresolved stops are EXCLUDED AND COUNTED, never silently dropped.**
 *     The caller reports "7 added, 2 couldn't be mapped" — a silently shortened
 *     route is a wrong route presented as a right one.
 *  3. **Idempotent.** Copying twice yields the same set, so a double-tap or a
 *     retry after a network blip does not duplicate every stop.
 */

/** What the caller needs to tell the reader, beside the rows. */
export interface RouteToTripResult {
  /** Ready for `addPlacesBulk`. Ordered by the route's own stop position. */
  rows: ReturnType<typeof tripPlaceRowFromGeo>[];
  /** Stops that could not be copied, with the reason, for the toast. */
  skipped: { name: string; position: number; reason: string }[];
}

/**
 * `resolveEntityGeo` handles venue and event ONLY (its `EntityRef.type` is
 * `'venue' | 'event'`), and `trip_places` has `venue_id` / `event_id` /
 * `hotel_id` columns — so a city, country or village route stop has no column
 * to land in. Those are EXCLUDED with a stated reason rather than coerced into
 * a custom place, because a trip stop called "Berlin" is not what the reader
 * asked to copy.
 */
const COPYABLE: ReadonlySet<GuideEntityType> = new Set(['venue', 'event']);

export function isCopyableStop(entityType: GuideEntityType): boolean {
  return COPYABLE.has(entityType);
}

/**
 * The PURE half: given resolved geo, produce the rows and the skip list.
 *
 * Pure so the three rules above are testable without a database — the
 * `guideRouteChecks` reasoning, one layer on.
 */
export function routeToTripPlaces(
  classified: readonly ClassifiedStop[],
  geo: Map<string, EntityGeo>,
  opts: { dayId?: string | null; existingKeys?: ReadonlySet<string> } = {},
): RouteToTripResult {
  const rows: ReturnType<typeof tripPlaceRowFromGeo>[] = [];
  const skipped: RouteToTripResult['skipped'] = [];
  const existing = opts.existingKeys ?? new Set<string>();
  // Within one call too: a route that lists the same venue twice (a loop that
  // returns to its start) must not insert it twice.
  const seen = new Set<string>(existing);

  for (const stop of classified) {
    const name = stop.display?.name ?? `Stop ${stop.pick.position}`;
    const position = stop.pick.position;

    if (!isCopyableStop(stop.pick.entity_type)) {
      skipped.push({
        name,
        position,
        reason: `A ${stop.pick.entity_type} stop has no place to land in a trip.`,
      });
      continue;
    }
    if (stop.state !== 'resolved') {
      skipped.push({ name, position, reason: stop.reason ?? 'Could not be mapped.' });
      continue;
    }

    const resolved = geo.get(stop.pick.entity_id);
    if (!resolved) {
      // Resolved for the MAP (the pick adapter saw coordinates) but not for the
      // TRIP (resolveEntityGeo could not read the row). Those are two different
      // reads under two different RLS paths, so they can genuinely disagree —
      // and saying "could not be mapped" here would be a wrong diagnosis.
      skipped.push({
        name,
        position,
        reason: 'The place could not be read for your trip — it may be restricted.',
      });
      continue;
    }

    // IDEMPOTENCE, keyed on the entity rather than on the pick: copying the
    // same route twice, or two routes that share a venue, must not duplicate
    // the stop.
    const key = `${resolved.type}:${resolved.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      ...tripPlaceRowFromGeo(resolved),
      // ONE day, and `sort_order` carries the route's own order so the
      // itinerary reads in the sequence the editor wrote.
      day_id: opts.dayId ?? null,
      sort_order: rows.length,
      // The stop's editorial note travels with it. This is the one piece of the
      // route's own prose that belongs on a trip place.
      notes: stop.pick.note ?? null,
    });
  }

  return { rows, skipped };
}

/**
 * The I/O half: resolve geo for the copyable stops, then hand off to the pure
 * mapper. One batched read regardless of route length.
 */
export async function routeToTrip(
  classified: readonly ClassifiedStop[],
  opts: { dayId?: string | null; existingKeys?: ReadonlySet<string> } = {},
): Promise<RouteToTripResult> {
  const refs: EntityRef[] = classified
    .filter((s) => s.state === 'resolved' && isCopyableStop(s.pick.entity_type))
    .map((s) => ({
      type: s.pick.entity_type as 'venue' | 'event',
      id: s.pick.entity_id,
    }));

  // Nothing copyable: skip the round-trip entirely and let the pure mapper
  // produce the skip list, so the caller still gets a reason per stop.
  const geo = refs.length ? await resolveEntityGeo(refs) : new Map<string, EntityGeo>();
  return routeToTripPlaces(classified, geo, opts);
}

/**
 * The toast line. Named rather than built at the call site, because "7 added"
 * with the two failures unmentioned is the silent-drop this module exists to
 * avoid, and a caller that forgets the second half produces exactly that.
 */
export function routeCopySummary(result: RouteToTripResult): string {
  const added = result.rows.length;
  const n = result.skipped.length;
  if (n === 0) return `${added} added`;
  return `${added} added, ${n} couldn't be mapped`;
}
