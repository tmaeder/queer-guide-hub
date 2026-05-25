import { useTranslation } from 'react-i18next';
import { NextLegFromHere } from './NextLegFromHere';
import { CompareRightsSideBySide } from './CompareRightsSideBySide';

interface Props {
  cityId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  countryId?: string | null;
  countryName?: string | null;
  equalityScore?: number | null;
}

/**
 * Editorial "Nearby" band: cross-link triptych for destination pages.
 * Stacks NextLegFromHere (flight-time-bucketed neighbors) and
 * CompareRightsSideBySide (peer countries on equality_score) into one
 * section body. OftenVisitedTogether is intentionally absent until the
 * trip_destinations migration lands in prod and gives us real co-visit
 * signal — at that point a new component slots in here.
 */
export function NearbyTriptych({
  cityId,
  latitude,
  longitude,
  countryId,
  countryName,
  equalityScore,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-12">
      {cityId && latitude != null && longitude != null ? (
        <section aria-labelledby="nearby-next-leg-heading">
          <h3
            id="nearby-next-leg-heading"
            className="mb-6 text-title font-bold tracking-tight"
          >
            {t('discovery.nextLeg.heading', 'Next leg from here')}
          </h3>
          <NextLegFromHere cityId={cityId} latitude={latitude} longitude={longitude} />
        </section>
      ) : null}

      {countryId && countryName ? (
        <section aria-labelledby="nearby-compare-heading">
          <h3
            id="nearby-compare-heading"
            className="mb-2 text-title font-bold tracking-tight"
          >
            {t('discovery.compareRights.heading', 'Compare rights with neighbors')}
          </h3>
          <p className="mb-6 max-w-prose text-13 text-muted-foreground">
            {t(
              'discovery.compareRights.lede',
              'How {{country}} sits next to its closest peers on overall equality score.',
              { country: countryName },
            )}
          </p>
          <CompareRightsSideBySide
            anchorCountryId={countryId}
            anchorCountryName={countryName}
            anchorEqualityScore={equalityScore ?? null}
          />
        </section>
      ) : null}
    </div>
  );
}
