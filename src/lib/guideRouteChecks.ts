import type { GuideEntityType, PickEntityDisplay } from '@/lib/guidePickAdapters';
import {
  ENTITY_BULLET,
  areaColor,
  lineColor,
  lineFor,
  type MapRouteStop,
} from '@/components/map/mapDomain';
import type { LayerType } from '@/hooks/useExploreMapData';
import { calculateDistanceKm } from '@/utils/calculateDistance';

/**
 * The pure half of "a guide is a route": ordering, stop classification, and
 * what blocks publication.
 *
 * PURE on purpose. Every rule here is a judgement a reviewer argues with, and
 * a judgement that can only be exercised by mounting an admin panel against a
 * live database is a judgement nobody re-checks. The panel renders what this
 * returns; it decides nothing itself.
 */

// ── Stop state ───────────────────────────────────────────────────────────────

/**
 * THREE states, not two, and the distinction is load-bearing.
 *
 *  - `resolved`   — has coordinates. Draws.
 *  - `unresolved` — the target EXISTS and has no lat/lng. **BLOCKS** publication:
 *                   a gap in the line is a broken line, and the editor can fix
 *                   it by geocoding the target.
 *  - `missing`    — the adapter returned nothing: the target was deleted, or it
 *                   is RLS-gated for THIS session. **WARNS only.** Blocking
 *                   would make a route unpublishable because the *editor's*
 *                   session cannot see a safety-gated venue — punishing the
 *                   reviewer for the gate working.
 *  - `ineligible` — the target has no geometry by construction (a marketplace
 *                   listing). Not a gap; shown as an off-map pick.
 *
 * Collapsing `missing` into `unresolved` is the tempting simplification and it
 * is wrong in exactly the case that matters: `GuideEntityType` has 11 members
 * and `ADAPTERS` implements 6, so `personality`, `news`, `milestone`, `group`
 * and `organization` resolve to nothing today and would block every route
 * carrying one.
 */
export type StopState = 'resolved' | 'unresolved' | 'missing' | 'ineligible';

export interface RoutePickInput {
  id: string;
  entity_type: GuideEntityType;
  entity_id: string;
  position: number;
  /** Per-stop editorial copy; `guide_picks.rationale_md` today. */
  note?: string | null;
  access_note?: string | null;
  safety_note?: string | null;
  is_orphaned?: boolean | null;
}

export interface ClassifiedStop {
  pick: RoutePickInput;
  state: StopState;
  display: PickEntityDisplay | null;
  /** Why it is not `resolved`. Shown to the editor verbatim. */
  reason: string | null;
}

/** `${entity_type}:${entity_id}` — the key `fetchPickEntities` returns. */
export const pickKey = (p: { entity_type: string; entity_id: string }) =>
  `${p.entity_type}:${p.entity_id}`;

/**
 * Stable order by `position`, with an EXPLICIT tiebreak, because duplicate
 * positions are REAL rather than theoretical: `GuidePicksPanel.move()` swaps
 * two positions with two independent mutations, so a failed second one leaves
 * two rows on the same position permanently. Unordered output there would make
 * a route's stop numbers flicker between renders.
 */
export function orderStops(picks: readonly RoutePickInput[]): RoutePickInput[] {
  return [...picks].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

export function classifyStop(
  pick: RoutePickInput,
  display: PickEntityDisplay | null | undefined,
): ClassifiedStop {
  if (!display) {
    return {
      pick,
      state: 'missing',
      display: null,
      reason: pick.is_orphaned
        ? 'Target was deleted (tombstoned by the nightly janitor).'
        : 'Target not visible — deleted, unpublished, or safety-gated for this session.',
    };
  }
  // `undefined` is INELIGIBLE (no geometry by construction); `'none'` is a
  // resolved target that genuinely has no coordinates.
  if (display.geo === undefined) {
    return { pick, state: 'ineligible', display, reason: 'This kind of pick has no location.' };
  }
  if (display.lat == null || display.lng == null) {
    return { pick, state: 'unresolved', display, reason: 'Target has no coordinates yet.' };
  }
  return { pick, state: 'resolved', display, reason: null };
}

export function classifyStops(
  picks: readonly RoutePickInput[],
  entities: Map<string, PickEntityDisplay>,
): ClassifiedStop[] {
  return orderStops(picks).map((p) => classifyStop(p, entities.get(pickKey(p))));
}

// ── Stops → map ──────────────────────────────────────────────────────────────

/**
 * Resolved stops only, as `MapRouteStop`s.
 *
 * **Stop numbers are the pick's own `position`, and survivors are NEVER
 * renumbered.** A route with stops 1, 2, 4, 5 *shows* a missing 3. A silently
 * closed gap is a wrong route presented as a right one — the exact failure
 * `guide_picks.is_orphaned` tombstones exist to prevent, one layer up.
 */
export function routeStopsFromPicks(classified: readonly ClassifiedStop[]): MapRouteStop[] {
  const out: MapRouteStop[] = [];
  for (const c of classified) {
    if (c.state !== 'resolved' || !c.display || c.display.lat == null || c.display.lng == null) {
      continue;
    }
    const layer = ENTITY_LAYER[c.pick.entity_type];
    if (!layer) continue;
    const line = lineFor(layer, c.display.categoryLabel ?? undefined);
    out.push({
      position: c.pick.position,
      note: c.pick.note ?? undefined,
      station: {
        id: `${layer}-${c.pick.entity_id}`,
        // The data path is still LAYER-keyed, so this is retained alongside
        // `line` — two axes, not one.
        type: layer,
        entity: ENTITY_BULLET[layer],
        /**
         * `null` is CORRECT and is kept, not coalesced.
         *
         * `lineFor` returns null for every AREA layer, because geography is a
         * VIEW and not a line (invariant B) — and `MapStation.line` is
         * `MapLine | null` precisely so an area entity rendered as a pin can
         * say so. A draft coalesced this to `'M'` to make the stroke resolve,
         * which would have published a city stop as a venue-line station.
         */
        line,
        lng: c.display.lng,
        lat: c.display.lat,
        name: c.display.name,
        subtitle: c.display.metaLine ?? undefined,
        linkTo: c.display.href,
        category: c.display.categoryLabel ?? undefined,
        featured: false,
        live: false,
        // A pin with no line takes the AREA colour (ink), never a track — the
        // same rule the boundary layers already follow.
        color: line ? lineColor(line) : areaColor(),
      },
    });
  }
  return out;
}

/** The pick vocabulary → the map LAYER vocabulary. Two namespaces. */
const ENTITY_LAYER: Partial<Record<GuideEntityType, LayerType>> = {
  venue: 'venues',
  event: 'events',
  city: 'cities',
  country: 'countries',
  queer_village: 'neighbourhoods',
};

// ── Publication gates ────────────────────────────────────────────────────────

export interface RouteMeta {
  route_kind?: string | null;
  is_route?: boolean | null;
}

/** A `walk` route with a leg this long is almost certainly mis-ordered. */
export const WALK_LEG_WARN_KM = 40;

/**
 * What must be true before `is_route` may be flipped on.
 *
 * Blockers mirror a hard DB constraint wherever one exists, so the editor gets
 * the friendly copy rather than a Postgres error — but the constraint stays,
 * because this module cannot be the only thing standing between a half-built
 * route and a reader.
 */
export function publishBlockers(classified: readonly ClassifiedStop[], meta: RouteMeta): string[] {
  const out: string[] = [];
  const resolved = classified.filter((c) => c.state === 'resolved');
  const unresolved = classified.filter((c) => c.state === 'unresolved');

  if (resolved.length < 2) {
    out.push(`A route needs at least 2 mappable stops (${resolved.length} resolved).`);
  }
  if (unresolved.length > 0) {
    out.push(
      `${unresolved.length} stop${unresolved.length === 1 ? '' : 's'} ${
        unresolved.length === 1 ? 'has' : 'have'
      } no coordinates — a gap in the line is a broken line.`,
    );
  }
  if (!meta.route_kind) {
    out.push('Pick a route kind (walk, cycle, transit, drive or mixed).');
  }
  return out;
}

/** Worth knowing before publishing; never blocks. */
export function publishWarnings(classified: readonly ClassifiedStop[], meta: RouteMeta): string[] {
  const out: string[] = [];
  const missing = classified.filter((c) => c.state === 'missing');
  if (missing.length > 0) {
    out.push(
      `${missing.length} stop${missing.length === 1 ? '' : 's'} could not be loaded. ` +
        'A safety-gated target is invisible to you and to anonymous readers — ' +
        'they will see the gap.',
    );
  }
  const ineligible = classified.filter((c) => c.state === 'ineligible');
  if (ineligible.length > 0) {
    out.push(`${ineligible.length} pick(s) have no location and will not draw on the map.`);
  }

  if (meta.route_kind === 'walk') {
    const stops = routeStopsFromPicks(classified);
    for (let i = 1; i < stops.length; i += 1) {
      const a = stops[i - 1].station;
      const b = stops[i].station;
      const km = calculateDistanceKm(a.lat, a.lng, b.lat, b.lng);
      if (km > WALK_LEG_WARN_KM) {
        out.push(
          `Stop ${stops[i - 1].position} → ${stops[i].position} is ${Math.round(km)} km — ` +
            'too far to walk. Check the order or the route kind.',
        );
      }
    }
  }
  return out;
}

/** One summary the panel header can render without recomputing anything. */
export function routeReadiness(classified: readonly ClassifiedStop[], meta: RouteMeta) {
  const blockers = publishBlockers(classified, meta);
  return {
    blockers,
    warnings: publishWarnings(classified, meta),
    canPublish: blockers.length === 0,
    counts: {
      resolved: classified.filter((c) => c.state === 'resolved').length,
      unresolved: classified.filter((c) => c.state === 'unresolved').length,
      missing: classified.filter((c) => c.state === 'missing').length,
      ineligible: classified.filter((c) => c.state === 'ineligible').length,
      total: classified.length,
    },
  };
}
