import type { RightSection, RightTopic } from './rightsCatalog';
import { classifyCountryRight, type RightsLens } from './rightsClassify';
import { deathPenaltyRisk } from '@/utils/equalityScore';

/**
 * The shared view model between `RightsMapControls` (this tree) and the
 * choropleth map (built in parallel — see
 * `docs/plans/2026-08-22-rights-world-map-design.md`). Both read
 * `classifyCountryRight` and must never disagree about what a country's
 * value means, so `mapClassFor` is the ONE place that turns a `StatusKind`
 * into the seven paint classes the map and the route-strip legend share.
 *
 * `MapClass` is a strict superset of `StatusKind` for the criminalisation
 * topic only: `'severe'` there is split further into `'death'` /
 * `'deathPossible'` / `'criminalised'` because the printed ILGA map's whole
 * point is that distinction, and folding it back into one bucket would lose
 * the fact this page exists to surface (see rightsScopeBar's death-penalty
 * tile for the same split done at the summary level).
 */

type CountryRow = Record<string, unknown>;

export type MapClass =
  'protected' | 'partial' | 'restricted' | 'criminalised' | 'death' | 'deathPossible' | 'nodata';

/**
 * Which subway line a rights family rides.
 *
 * Five families, four track colours (locked palette — CLAUDE.md § Design):
 * `identity` reuses blue rather than inventing a fifth hue, the same way the
 * homepage city-network diagrams assign colour by rank instead of by a 1:1
 * category count (see CLAUDE.md's "City network diagrams" exception).
 */
export const SECTION_TRACK: Record<RightSection, 'pink' | 'blue' | 'green' | 'yellow'> = {
  criminalisation: 'pink',
  antiDiscrimination: 'blue',
  criminalJustice: 'yellow',
  family: 'green',
  identity: 'blue',
};

/**
 * Most-restrictive → most-protective, for the route-strip legend. `nodata`
 * runs last, off the continuum on purpose — a gap in the data is not a point
 * between "restricted" and "protected", and ordering it there would visually
 * imply a severity reading for countries with no reading at all.
 */
export const MAP_CLASS_ORDER: readonly MapClass[] = [
  'death',
  'deathPossible',
  'criminalised',
  'restricted',
  'partial',
  'protected',
  'nodata',
];

export const MAP_CLASS_LABEL: Record<MapClass, string> = {
  death: 'Death penalty',
  deathPossible: 'Death penalty possible',
  criminalised: 'Criminalised',
  restricted: 'Not protected',
  partial: 'Partial protection',
  protected: 'Protected',
  nodata: 'No data',
};

/**
 * Fill alpha for the monochrome ink ramp (`hsl(var(--foreground) / alpha)`).
 * `death` and `deathPossible` paint `--destructive` instead of ink — the
 * alpha here still describes their intensity (0.9 confirmed vs 0.62
 * possible+hatch, mirroring the design doc's own table) so a consumer can
 * reuse ONE lookup for "how strong is this fill" regardless of which colour
 * channel actually renders it. `nodata` carries no fill at all — it is a
 * hatch on the page surface, never an ink alpha — so its entry is `0` and
 * must not be read as "very light ink".
 */
export const MAP_CLASS_INK: Record<MapClass, number> = {
  protected: 0.12,
  partial: 0.34,
  restricted: 0.58,
  criminalised: 0.62,
  death: 0.9,
  deathPossible: 0.62,
  nodata: 0,
};

/**
 * Country + topic + lens → the class the map paints.
 *
 * Safety-critical: `'nodata'` must never be produced for a country that has
 * a real reading (`classifyCountryRight` returning anything but `'none'`),
 * and a real reading must never be silently downgraded into `'nodata'`. The
 * criminalisation split is the one place this function does more than
 * relabel `StatusKind` — everywhere else it is a straight rename.
 */
export function mapClassFor(
  country: CountryRow,
  topic: RightTopic,
  lens: RightsLens = 'all',
): MapClass {
  const kind = classifyCountryRight(country, topic, lens);

  if (topic.slug === 'criminalisation' && kind === 'severe') {
    const risk = deathPenaltyRisk(
      country?.lgbti_criminalization as Record<string, unknown> | null | undefined,
    );
    if (risk === 'confirmed') return 'death';
    if (risk === 'possible') return 'deathPossible';
    return 'criminalised';
  }

  switch (kind) {
    case 'yes':
      return 'protected';
    case 'partial':
      return 'partial';
    case 'no':
      return 'restricted';
    case 'severe':
      return 'criminalised';
    case 'none':
    default:
      return 'nodata';
  }
}

/** Counts per class across all countries, for the route-strip legend. */
export function summariseMapClasses(
  countries: readonly CountryRow[],
  topic: RightTopic,
  lens: RightsLens = 'all',
): Record<MapClass, number> {
  const counts: Record<MapClass, number> = {
    protected: 0,
    partial: 0,
    restricted: 0,
    criminalised: 0,
    death: 0,
    deathPossible: 0,
    nodata: 0,
  };
  for (const country of countries) {
    counts[mapClassFor(country, topic, lens)] += 1;
  }
  return counts;
}
