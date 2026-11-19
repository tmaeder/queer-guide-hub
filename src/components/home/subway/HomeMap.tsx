import { useState } from 'react';
import { FilterChip } from '@/components/transit/FilterChip';
import { TransitIcon } from '@/components/transit/TransitIcon';
import type { TransitIconName } from '@/components/transit/transitIconPaths';
import { useTranslation } from 'react-i18next';
import { Band } from '@/components/home/Band';
import { useHomeCity } from '@/components/home/useHomeCity';
import { useCityCentre } from '@/hooks/regionOverride';
import ExploreMap from '@/components/map/ExploreMap';
import type { LayerType } from '@/hooks/useExploreMapData';

const LAYER_CHIPS: { type: LayerType; icon: TransitIconName; key: string; fallback: string }[] = [
  { type: 'venues', icon: 'nightlife', key: 'home.map.layers.venues', fallback: 'Places' },
  { type: 'events', icon: 'events', key: 'home.map.layers.events', fallback: 'Events' },
  { type: 'hotels', icon: 'housing', key: 'home.map.layers.hotels', fallback: 'Hotels & B&Bs' },
  { type: 'restrooms', icon: 'restroom', key: 'home.map.layers.restrooms', fallback: 'Restrooms' },
];

/** The /map community map, scoped to the homepage's city when there is one. */
export default function HomeMap() {
  const { t } = useTranslation();
  // Same city as the hero: the visitor's own, else the featured fallback.
  const region = useHomeCity();
  const { data: centre, isLoading } = useCityCentre(region.cityId);
  const [layers, setLayers] = useState<LayerType[]>(['venues', 'events']);
  // Toggle a layer; never leave the map with nothing on it.
  const toggle = (type: LayerType) =>
    setLayers((cur) =>
      cur.includes(type) ? (cur.length > 1 ? cur.filter((l) => l !== type) : cur) : [...cur, type],
    );
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
      <div
        role="group"
        aria-label={t('home.map.layers.label', 'Show on map')}
        className="mb-4 flex flex-wrap gap-2"
      >
        {LAYER_CHIPS.map((c) => (
          <FilterChip
            key={c.type}
            active={layers.includes(c.type)}
            onClick={() => toggle(c.type)}
            label={
              <>
                <TransitIcon name={c.icon} size={16} aria-hidden />
                {t(c.key, c.fallback)}
              </>
            }
          />
        ))}
      </div>
      <div className="overflow-hidden rounded-panel">
        {region.loading || (region.cityId && isLoading) ? (
          <div className="h-[420px] bg-muted" aria-hidden="true" />
        ) : (
          // Keyed on the city: ExploreMap reads its centre once, at mount.
          <ExploreMap
            key={region.cityId ?? 'world'}
            height={420}
            defaultLayers={layers}
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
