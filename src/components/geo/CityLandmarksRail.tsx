import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useCityLandmarks } from '@/hooks/useGeoPlaces';
import { landmarkKindLabel } from '@/lib/landmarkKinds';
import { LandmarkKindIcon } from '@/components/geo/LandmarkKindIcon';

/**
 * "Parks, beaches & landmarks" rail on city pages. Renders nothing while the
 * city has no approved landmarks — honest absence over empty chrome.
 */
export function CityLandmarksRail({ cityId }: { cityId: string | undefined }) {
  const { t } = useTranslation();
  const { data: landmarks } = useCityLandmarks(cityId);

  if (!landmarks || landmarks.length === 0) return null;

  return (
    <section aria-labelledby="city-landmarks-heading">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 id="city-landmarks-heading" className="text-title font-semibold">
          {t('geo.landmarks.railTitle', 'Parks, beaches & landmarks')}
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {landmarks.map((lm) => {
          const kind = lm.geo_landmark_profiles?.landmark_kind ?? 'landmark';
          return (
            <LocalizedLink
              key={lm.id}
              to={`/place/${lm.slug ?? lm.id}`}
              className="group flex items-start gap-4 rounded-element border border-border p-4 transition-colors hover:bg-accent"
            >
              <LandmarkKindIcon kind={kind} className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="min-w-0">
                <div className="font-medium group-hover:underline">{lm.name}</div>
                <div className="text-13 text-muted-foreground">{landmarkKindLabel(kind, t)}</div>
                {lm.description && (
                  <p className="mt-1 line-clamp-2 text-13 text-muted-foreground">
                    {lm.description}
                  </p>
                )}
              </div>
            </LocalizedLink>
          );
        })}
      </div>
    </section>
  );
}
