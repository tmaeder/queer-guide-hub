// src/components/rights/RightsWorldMap.tsx
import { useCallback, useRef, useEffect } from 'react';
import { ink, paper, tokenColor } from '@/lib/mapTokens';
import { MAP_CLASS_INK, type MapClass } from '@/lib/rights/rightsMapModel';
import type { RightTopic } from '@/lib/rights/rightsCatalog';
import type { RightsLens } from '@/lib/rights/rightsClassify';
import type { RightsCountry } from '@/hooks/useIntentData';
import { WorldChoropleth } from './WorldChoropleth';
import { buildMapAriaLabel, classifyBoundaries, EMPTY_CLASS_COUNTS } from './rightsWorldMapModel';

/**
 * The `/rights` choropleth — one of the 18 legal topics, through one identity
 * lens.
 *
 * All MapLibre plumbing now lives in `WorldChoropleth`, which /rights/trans
 * shares for its recognition map. This file is only the rights-specific half:
 * which classifier runs, which ink ramp paints it, and how the canvas is
 * announced. The public props are unchanged — `Rights.tsx` and
 * `RightsMapSection` still own topic/lens/activeClass state.
 */

export interface RightsWorldMapProps {
  countries: RightsCountry[];
  topic: RightTopic;
  lens: RightsLens;
  /** Set by clicking a route-strip legend station; dims every other class. */
  activeClass: MapClass | null;
  onCountrySelect: (country: RightsCountry) => void;
}

export function RightsWorldMap({
  countries,
  topic,
  lens,
  activeClass,
  onCountrySelect,
}: RightsWorldMapProps) {
  // Kept fresh for the click handler without re-running the layer-creation
  // effect inside WorldChoropleth (addLayer twice on one id throws).
  const byCodeRef = useRef(new Map<string, RightsCountry>());
  useEffect(() => {
    const m = new Map<string, RightsCountry>();
    for (const c of countries) if (c.code) m.set(c.code.toUpperCase(), c);
    byCodeRef.current = m;
  }, [countries]);

  const onCountrySelectRef = useRef(onCountrySelect);
  useEffect(() => {
    onCountrySelectRef.current = onCountrySelect;
  }, [onCountrySelect]);

  const classify = useCallback(
    (boundaries: GeoJSON.FeatureCollection) =>
      classifyBoundaries(boundaries, countries, topic, lens),
    [countries, topic, lens],
  );

  // Built from a tally of the painted features, so the announced summary and
  // the canvas cannot drift apart.
  const buildAriaLabel = useCallback(
    (counts: Record<string, number>) =>
      buildMapAriaLabel(topic.labelDefault, { ...EMPTY_CLASS_COUNTS, ...counts } as Record<
        MapClass,
        number
      >),
    [topic.labelDefault],
  );

  const handleSelect = useCallback((iso: string) => {
    const country = byCodeRef.current.get(iso);
    if (country) onCountrySelectRef.current(country);
  }, []);

  return (
    <WorldChoropleth
      classify={classify}
      classProperty="rightsClass"
      emptyClass="nodata"
      buildAriaLabel={buildAriaLabel}
      activeClass={activeClass}
      onFeatureSelect={handleSelect}
      fillMatch={[
        'protected',
        ink(MAP_CLASS_INK.protected),
        'partial',
        ink(MAP_CLASS_INK.partial),
        'restricted',
        ink(MAP_CLASS_INK.restricted),
        'criminalised',
        ink(MAP_CLASS_INK.criminalised),
        'death',
        tokenColor('--destructive', 0.9),
        'deathPossible',
        tokenColor('--destructive', 0.62),
        // Fallback = `nodata`. A gap in the data must never read as a filled
        // class.
        paper(),
      ]}
    />
  );
}

export default RightsWorldMap;
