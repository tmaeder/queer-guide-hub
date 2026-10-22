import { useTranslation } from 'react-i18next';
import {
  SHARED_MOBILITY_STALE_MIN,
  snapshotAgeMinutes,
  useSharedMobilityNear,
} from '@/hooks/useSharedMobility';

/**
 * "About N within 300 m" — rideable shared bikes & e-scooters near a venue.
 * Null unless the area is covered by the feed AND the snapshot is fresh: an
 * uncovered or stale zero would be a false claim about how to get home.
 * FactGrid drops a null value, so the whole fact disappears.
 */
export function useSharedMobilityValue(lat?: number | null, lng?: number | null) {
  const { t } = useTranslation();
  const { data } = useSharedMobilityNear(lat, lng);
  const age = snapshotAgeMinutes(data?.generated_at);
  if (!data?.covered || age == null || age > SHARED_MOBILITY_STALE_MIN) return null;
  return (
    <span>
      {t('venues.detail.sharedMobilityValue', 'About {{count}} within {{radius}} m', {
        count: data.count,
        radius: data.radius_m,
      })}
      <span className="block text-xs2 font-normal text-muted-foreground">
        {t('venues.detail.sharedMobilityAge', '{{minutes}} min ago · {{source}}', {
          minutes: age,
          source: data.attribution,
        })}
      </span>
    </span>
  );
}
