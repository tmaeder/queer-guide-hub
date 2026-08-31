import { useTranslation } from 'react-i18next';
import { NextLegFromHere } from './NextLegFromHere';

interface Props {
  cityId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Editorial "Nearby" band: cross-link rail for destination pages.
 *
 * One panel now, not three. `OftenVisitedTogether` was never built (it needs a
 * real co-visit signal from `trip_destinations`), and `CompareRightsSideBySide`
 * — a peer table whose only column besides the country name was
 * `equality_score` — was removed on 2026-08-30 with the rest of the composite
 * 0-100 figure. Dropping just the number would have left four country names
 * ordered by a quantity the page no longer shows, which asserts a ranking
 * without stating its basis; the section went instead.
 *
 * That also took the country props: this component is city-anchored now, and
 * `CountryDetail` — which passed only country props and would therefore render
 * an empty band — no longer mounts it at all.
 */
export function NearbyTriptych({ cityId, latitude, longitude }: Props) {
  const { t } = useTranslation();

  if (!cityId || latitude == null || longitude == null) return null;

  return (
    <div className="flex flex-col gap-12">
      <section aria-labelledby="nearby-next-leg-heading">
        <h3 id="nearby-next-leg-heading" className="mb-6 text-title font-bold tracking-tight">
          {t('discovery.nextLeg.heading', 'Next leg from here')}
        </h3>
        <NextLegFromHere cityId={cityId} latitude={latitude} longitude={longitude} />
      </section>
    </div>
  );
}
