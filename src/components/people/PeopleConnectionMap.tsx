import { MapShell } from '@/components/map/MapShell';
import type { MapShellConfig } from '@/components/map/MapShell.types';

const PEOPLE_MAP_CONFIG = {
  defaultEnabledLayers: ['venues', 'events', 'neighbourhoods'],
  enableUrlState: false,
} satisfies Partial<MapShellConfig>;

/**
 * Public, place-based map for the People hub.
 *
 * It deliberately excludes member/profile locations. Approximate presence is
 * opt-in and belongs to /people/nearby; dating keeps its own consent gate.
 */
export function PeopleConnectionMap() {
  return (
    <div
      data-testid="people-connection-map"
      className="overflow-hidden rounded-container border border-border-hairline bg-surface-container"
    >
      <MapShell
        surface="city"
        configOverride={PEOPLE_MAP_CONFIG}
        height="clamp(22rem, 58vh, 32rem)"
        cooperativeGestures
      />
    </div>
  );
}

export default PeopleConnectionMap;
