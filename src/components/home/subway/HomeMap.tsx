import { useTranslation } from 'react-i18next';
import { Band } from '@/components/home/Band';
import { useHomeRegionContext } from '@/components/home/homeRegionContext';
import { useCityCentre } from '@/hooks/regionOverride';
import ExploreMap from '@/components/map/ExploreMap';
import type { LayerType } from '@/hooks/useExploreMapData';

const LAYERS: LayerType[] = ['venues', 'events'];

/** The /map community map, scoped to the homepage's city when there is one. */
export default function HomeMap() {
  const { t } = useTranslation();
  const region = useHomeRegionContext();
  const { data: centre, isLoading } = useCityCentre(region.cityId);
  const center: [number, number] | undefined = centre
    ? [centre.longitude, centre.latitude]
    : undefined;
  const mapHref = centre ? `/map?lat=${centre.latitude}&lng=${centre.longitude}&z=12` : '/map';

  return (
    <Band
      title={t('home.map.title', 'Map')}
      seeAllHref={mapHref}
      seeAllLabel={t('home.discovery.openMap', 'Open the map')}
    >
      <div className="overflow-hidden rounded-panel">
        {region.loading || (region.cityId && isLoading) ? (
          <div className="h-[420px] bg-muted" aria-hidden="true" />
        ) : (
          // Keyed on the city: ExploreMap reads its centre once, at mount.
          <ExploreMap
            key={region.cityId ?? 'world'}
            height={420}
            defaultLayers={LAYERS}
            initialCenter={center}
            initialZoom={center ? 12 : undefined}
            skipAutoFly
            cooperativeGestures
          />
        )}
      </div>
    </Band>
  );
}
