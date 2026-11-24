import { useState } from 'react';
import { TransitIcon } from '@/components/transit/TransitIcon';
import type { TransitIconName } from '@/components/transit/transitIconPaths';
import { useTranslation } from 'react-i18next';
import { Band } from '@/components/home/Band';
import { useHomeCity } from '@/components/home/useHomeCity';
import { useCityCentre } from '@/hooks/regionOverride';
import ExploreMap from '@/components/map/ExploreMap';
import type { LayerType } from '@/hooks/useExploreMapData';
import { SEGMENT_TRACK, segmentClass } from '@/lib/segmented';
import { cn } from '@/lib/utils';

const LAYER_CHIPS: {
  type: LayerType;
  icon: TransitIconName;
  key: string;
  fallback: string;
  /** Fits a sixth of a phone-width row. */
  short: string;
}[] = [
  {
    type: 'venues',
    icon: 'nightlife',
    key: 'home.map.layers.venues',
    fallback: 'Places',
    short: 'Places',
  },
  {
    type: 'events',
    icon: 'events',
    key: 'home.map.layers.events',
    fallback: 'Events',
    short: 'Events',
  },
  {
    type: 'cruising',
    icon: 'after-dark',
    key: 'home.map.layers.cruising',
    fallback: 'Cruising',
    short: 'Cruising',
  },
  {
    type: 'hotels',
    icon: 'housing',
    key: 'home.map.layers.hotels',
    fallback: 'Hotels & B&Bs',
    short: 'Stays',
  },
  {
    type: 'organizations',
    icon: 'community',
    key: 'home.map.layers.organizations',
    fallback: 'Organisations',
    short: 'Orgs',
  },
  {
    type: 'restrooms',
    icon: 'restroom',
    key: 'home.map.layers.restrooms',
    fallback: 'Restrooms',
    short: 'Toilets',
  },
];

/** The /map community map, scoped to the homepage's city when there is one. */
export default function HomeMap() {
  const { t } = useTranslation();
  // Same city as the hero: the visitor's own, else the featured fallback.
  const region = useHomeCity();
  const { data: centre, isLoading } = useCityCentre(region.cityId);
  const [layers, setLayers] = useState<LayerType[]>(['venues', 'events', 'cruising']);
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
      {/* One line on a phone: six equal segments, mark over a short label.
          The visible short name is the accessible name (WCAG 2.5.3); the
          full one is the tooltip. */}
      <div
        role="group"
        aria-label={t('home.map.layers.label', 'Show on map')}
        className={cn(SEGMENT_TRACK, 'mb-4 grid-cols-6')}
      >
        {LAYER_CHIPS.map((c) => {
          const on = layers.includes(c.type);
          return (
            <button
              key={c.type}
              type="button"
              aria-pressed={on}
              title={t(c.key, c.fallback)}
              onClick={() => toggle(c.type)}
              className={segmentClass(on, 'flex-col gap-0.5 py-1 text-2xs sm:text-xs2')}
            >
              <TransitIcon name={c.icon} size={18} aria-hidden />
              <span className="max-w-full truncate">{t(`${c.key}Short`, c.short)}</span>
            </button>
          );
        })}
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
            livePulse={false}
          />
        )}
      </div>
    </Band>
  );
}
