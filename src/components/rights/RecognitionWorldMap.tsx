import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ink, paper } from '@/lib/mapTokens';
import { RECOGNITION_REGIMES, regimeOf, type RegimeId } from '@/lib/rights/recognitionPerspective';
import type { TransRightsCountry } from '@/hooks/useIntentData';
import { WorldChoropleth } from './WorldChoropleth';
import { classifyBoundariesBy } from './rightsWorldMapModel';
import { REGIME_LABEL_FALLBACK } from './recognitionRegimeLabels';

/**
 * Legal gender recognition, painted on the world.
 *
 * Two things make this honest rather than decorative, and both are structural:
 *
 * 1. **It classifies with `regimeOf`** — the same function behind the
 *    `HumanityBand` and the ledger beside it. The map is a second VIEW of one
 *    classification, never a second classification, so it cannot quietly
 *    disagree with the numbers printed under it. That is the rule
 *    `rightsClassify.ts` was extracted to enforce for /rights, applied here.
 *
 * 2. **It ships directly above the band, on purpose.** A choropleth is
 *    area-weighted, which under-represents exactly the fact this page exists
 *    to state: the countries demanding sterilisation are not many and not
 *    large in area, they are POPULOUS. Read alone, the map makes the
 *    sterilisation regime look like a minor speckle; India and China are 41%
 *    of humanity between the rest. Area next to population, so neither reading
 *    stands unqualified.
 *
 * Ink weights come from `RECOGNITION_REGIMES[].weight` rather than a second
 * table here, so the band and the map darken together if that ramp is ever
 * retuned.
 *
 * `--destructive` never appears: it is reserved for criminalisation, and a
 * sterilisation requirement — however grave — is not that. Track colours never
 * appear either; this is a rights surface.
 */

const EMPTY_CLASS: RegimeId = 'no-record';

export interface RecognitionWorldMapProps {
  countries: TransRightsCountry[];
  /** Dims every other regime. Null shows all. */
  activeRegime: RegimeId | null;
  onCountrySelect: (iso: string) => void;
}

export function RecognitionWorldMap({
  countries,
  activeRegime,
  onCountrySelect,
}: RecognitionWorldMapProps) {
  const { t } = useTranslation();

  const classify = useCallback(
    (boundaries: GeoJSON.FeatureCollection) =>
      classifyBoundariesBy(
        boundaries,
        countries,
        'recognitionClass',
        (country) => regimeOf(country as unknown as Record<string, unknown>),
        EMPTY_CLASS,
      ),
    [countries],
  );

  const buildAriaLabel = useCallback(
    (counts: Record<string, number>) => {
      const parts = RECOGNITION_REGIMES.filter((r) => (counts[r.id] ?? 0) > 0).map(
        (r) =>
          `${counts[r.id]} ${t(
            `rights.trans.regime.${r.key}.label`,
            REGIME_LABEL_FALLBACK[r.key],
          ).toLowerCase()}`,
      );
      const body = parts.length > 0 ? parts.join(', ') : 'no countries measured yet';
      return `World map: legal gender recognition. ${body}.`;
    },
    [t],
  );

  return (
    <WorldChoropleth
      classify={classify}
      classProperty="recognitionClass"
      emptyClass={EMPTY_CLASS}
      buildAriaLabel={buildAriaLabel}
      activeClass={activeRegime}
      onFeatureSelect={onCountrySelect}
      fillMatch={[
        // Flattened [class, colour, …] pairs, then the fallback. `no-record`
        // is deliberately NOT a branch: it falls through to paper and takes
        // the denser hairline instead, so an unmeasured country can never read
        // as the palest measured one.
        ...RECOGNITION_REGIMES.filter((r) => r.id !== EMPTY_CLASS).flatMap((r) => [
          r.id as string,
          ink(r.weight),
        ]),
        paper(),
      ]}
    />
  );
}

export default RecognitionWorldMap;
