import {
  mapClassFor,
  MAP_CLASS_ORDER,
  MAP_CLASS_LABEL,
  type MapClass,
} from '@/lib/rights/rightsMapModel';
import type { RightTopic } from '@/lib/rights/rightsCatalog';
import type { RightsLens } from '@/lib/rights/rightsClassify';
import type { RightsCountry } from '@/hooks/useIntentData';

/**
 * The pure half of `RightsWorldMap` — the join, the tally and the aria label.
 * It lives beside the component rather than inside it so the component module
 * exports a component and nothing else: `react-refresh/only-export-components`
 * disables fast refresh for a whole file that mixes the two, which on a 400-line
 * MapLibre component means a full reload on every edit.
 */

export type RightsFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Geometry,
  GeoJSON.GeoJsonProperties
>;

/** What `WorldChoropleth` consumes: features carrying some class key. */
export type ClassifiedFeatureCollection = RightsFeatureCollection;

/**
 * Join boundary polygons to a country lookup by `ISO_A2` ⇄ `code` and stamp
 * each feature with a class under `classProperty`.
 *
 * The generic core of `classifyBoundaries`, extracted when /rights/trans added
 * a second choropleth over the same polygons with a different vocabulary. A
 * boundary feature with no matching country row takes `emptyClass` — never
 * silently dropped, never guessed into a measured class.
 */
export function classifyBoundariesBy<T extends { code?: string | null }>(
  boundaries: GeoJSON.FeatureCollection,
  countries: readonly T[],
  classProperty: string,
  classOf: (country: T) => string,
  emptyClass: string,
): ClassifiedFeatureCollection {
  const byCode = new Map<string, T>();
  for (const c of countries) {
    if (c.code) byCode.set(c.code.toUpperCase(), c);
  }
  return {
    ...boundaries,
    features: boundaries.features.map((feature) => {
      const iso = String(feature.properties?.ISO_A2 ?? '').toUpperCase();
      const country = byCode.get(iso);
      return {
        ...feature,
        properties: {
          ...feature.properties,
          [classProperty]: country ? classOf(country) : emptyClass,
        },
      };
    }),
  };
}

/** Tally any class property across already-joined features. */
export function tallyFeatureClasses(
  features: readonly GeoJSON.Feature[],
  classProperty: string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of features) {
    const cls = f.properties?.[classProperty] as string | undefined;
    if (cls) counts[cls] = (counts[cls] ?? 0) + 1;
  }
  return counts;
}

export const EMPTY_CLASS_COUNTS: Record<MapClass, number> = {
  protected: 0,
  partial: 0,
  restricted: 0,
  criminalised: 0,
  death: 0,
  deathPossible: 0,
  nodata: 0,
};

/**
 * Join boundary polygons to `countries` by `ISO_A2` ⇄ `code` (uppercased both
 * sides) and stamp each feature's classification for the current topic/lens
 * as `rightsClass`. A boundary feature with no matching country row reads
 * `'nodata'` — never silently dropped, never guessed into a measured class.
 *
 * Pure and exported so the join/classification behaviour — the part that
 * must never disagree with what the map paints — can be unit-tested without
 * constructing a MapLibre instance (jsdom has no WebGL).
 */
export function classifyBoundaries(
  boundaries: GeoJSON.FeatureCollection,
  countries: readonly RightsCountry[],
  topic: RightTopic,
  lens: RightsLens,
): RightsFeatureCollection {
  return classifyBoundariesBy(
    boundaries,
    countries,
    'rightsClass',
    (country) => mapClassFor(country as unknown as Record<string, unknown>, topic, lens),
    'nodata' satisfies MapClass,
  );
}

/** Tally `rightsClass` across already-joined features — what the fill layer
 *  is actually painting, as opposed to a count over the raw country list
 *  (which can diverge when a country has no boundary geometry or vice versa). */
export function summariseFeatureClasses(
  features: readonly GeoJSON.Feature[],
): Record<MapClass, number> {
  const counts: Record<MapClass, number> = { ...EMPTY_CLASS_COUNTS };
  for (const f of features) {
    const cls = f.properties?.rightsClass as MapClass | undefined;
    if (cls && cls in counts) counts[cls] += 1;
  }
  return counts;
}

/**
 * "World map: {topic}. {n} protected, {n} partial, …" — every non-zero class
 * in `MAP_CLASS_ORDER` (most-restrictive first), so the announced summary can
 * never drift from what `MAP_CLASS_ORDER`/`MAP_CLASS_LABEL` say the map means.
 * Exported for direct testing and reused for both the live map and every
 * fallback state — a reader must get the same information whichever renders.
 */
export function buildMapAriaLabel(topicLabel: string, counts: Record<MapClass, number>): string {
  const parts = MAP_CLASS_ORDER.filter((cls) => counts[cls] > 0).map(
    (cls) => `${counts[cls]} ${MAP_CLASS_LABEL[cls].toLowerCase()}`,
  );
  const body = parts.length > 0 ? parts.join(', ') : 'no countries measured yet';
  return `World map: ${topicLabel}. ${body}.`;
}
