import { CoverageNote } from '@/components/intent/CoverageNote';
import { RightsMapControls } from './RightsMapControls';
import { RightsWorldMap } from './RightsWorldMap';
import type { RightTopic } from '@/lib/rights/rightsCatalog';
import type { RightsLens } from '@/lib/rights/rightsClassify';
import type { MapClass } from '@/lib/rights/rightsMapModel';
import type { RightsCountry } from '@/hooks/useIntentData';

/**
 * The composed "map" section content for `/rights` — Task D of
 * docs/plans/2026-08-22-rights-world-map-design.md. Line/lens controls above
 * the choropleth, its route-strip legend, and a one-line coverage note.
 *
 * Purely presentational: `Rights.tsx` owns the topic/lens/activeClass state
 * (and the rule that a class filter resets whenever topic or lens changes —
 * a filter picked on the previous right is meaningless on a new one), plus
 * the `counts` memo and the country-click navigation. This component only
 * renders what it is handed, which is what keeps it testable without a
 * router or a real countries fetch.
 */
export interface RightsMapSectionProps {
  countries: RightsCountry[];
  topic: RightTopic;
  onTopicChange: (topic: RightTopic) => void;
  lens: RightsLens;
  onLensChange: (lens: RightsLens) => void;
  activeClass: MapClass | null;
  onActiveClassChange: (activeClass: MapClass | null) => void;
  counts: Record<MapClass, number>;
  onCountrySelect: (country: RightsCountry) => void;
}

export function RightsMapSection({
  countries,
  topic,
  onTopicChange,
  lens,
  onLensChange,
  activeClass,
  onActiveClassChange,
  counts,
  onCountrySelect,
}: RightsMapSectionProps) {
  return (
    <div>
      <RightsMapControls
        topic={topic}
        onTopicChange={onTopicChange}
        lens={lens}
        onLensChange={onLensChange}
        counts={counts}
        activeClass={activeClass}
        onActiveClassChange={onActiveClassChange}
      />
      <div className="mt-6">
        <RightsWorldMap
          countries={countries}
          topic={topic}
          lens={lens}
          activeClass={activeClass}
          onCountrySelect={onCountrySelect}
        />
      </div>
      {/* The map's counts and the table's counts are measured over different
          sets — polygons drawn vs. rows held — so they do not match, and a
          reader comparing "criminalised" here against the chips below must be
          told why rather than left to assume one of them is wrong. */}
      <CoverageNote>
        Legal status from the ILGA World Database, re-imported nightly. Countries with no recorded
        reading are shown as no data, never as safe. A few territories have no boundary to draw at
        this scale and cannot appear on the map at all — the table below holds every one of them,
        which is why its counts run slightly higher than the map’s.
      </CoverageNote>
    </div>
  );
}

export default RightsMapSection;
