import { MapShell } from '@/components/map/MapShell';
import type { MapShellConfig } from '@/components/map/MapShell.types';
import { Compass, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';

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
  const { t } = useTranslation();

  return (
    <div
      data-testid="people-connection-map"
      className="overflow-hidden rounded-container bg-surface-container"
    >
      <div className="flex flex-col gap-4 bg-surface-container px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div
          className="inline-flex w-fit bg-surface-container p-1"
          role="tablist"
          aria-label={t('people.map.modeLabel', 'Map mode')}
        >
          <span
            role="tab"
            aria-selected="true"
            className="inline-flex min-h-10 items-center gap-2 bg-foreground px-4 text-sm font-semibold text-background"
          >
            <Compass className="h-4 w-4" aria-hidden />
            {t('people.map.communityMode', 'Community')}
          </span>
          <LocalizedLink
            to="/people/dating?panel=spots&layers=spots"
            role="tab"
            aria-selected="false"
            className="inline-flex min-h-10 items-center gap-2 px-4 text-sm font-semibold text-foreground no-underline hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MapPin className="h-4 w-4" aria-hidden />
            {t('people.map.cruisingMode', 'Cruising')}
            <span className="text-2xs text-muted-foreground">18+</span>
          </LocalizedLink>
        </div>
        <p className="max-w-md text-13 text-muted-foreground sm:text-right">
          {t(
            'people.map.communityPrivacy',
            'Public places and events only. Member locations stay private.',
          )}
        </p>
      </div>
      <MapShell
        surface="city"
        configOverride={PEOPLE_MAP_CONFIG}
        height="clamp(22rem, 58vh, 32rem)"
        className="[&_.border-border-hairline]:!border-0"
        cooperativeGestures
      />
    </div>
  );
}

export default PeopleConnectionMap;
