import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, List, Map as MapIcon } from '@/components/icons';
import { FilterChip } from '@/components/transit/FilterChip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TransitIcon } from '@/components/transit/TransitIcon';
import type { TransitIconName } from '@/components/transit/transitIconPaths';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { VenueCard } from '@/components/venues/VenueCard';
import { OrganizationCard } from '@/components/organizations/OrganizationCard';
import ExploreMap from '@/components/map/ExploreMap';
import { iconForMarker } from '@/components/map/mapIcons';
import { venueCategoryFallbackLabel } from '@/lib/venueCategories';
import {
  ALL_PLACE_CATEGORIES,
  PLACE_FILTERS,
  PLACE_VIEWS,
  type PlaceView,
} from '@/lib/goingOutFilters';
import { useNightlifeVenues, useMeetSpaces, type InterestFilters } from '@/hooks/useIntentData';
import { useOrganizationsList } from '@/hooks/useOrganization';
import { useCityCentre } from '@/hooks/regionOverride';
import type { LayerType } from '@/hooks/useExploreMapData';

const VIEW_ICONS = { grid: LayoutGrid, list: List, map: MapIcon } as const;
const VIEW_LABELS: Record<PlaceView, string> = { grid: 'Grid', list: 'List', map: 'Map' };

interface Row {
  id: string;
  icon: TransitIconName;
  name: string;
  sub: string | null;
  href: string | null;
}

/** Compact rows for the list view (and for neighbourhoods, which have no card). */
function PlaceRows({ rows }: { rows: Row[] }) {
  return (
    <ul className="m-0 list-none space-y-2 p-0">
      {rows.map((r) => (
        <li
          key={r.id}
          className="group relative flex items-center gap-4 rounded-element bg-card px-4 py-2 shadow-soft transition-colors hover:bg-muted"
        >
          <TransitIcon name={r.icon} size={24} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold">{r.name}</span>
            {r.sub ? (
              <span className="block truncate text-13 text-muted-foreground">{r.sub}</span>
            ) : null}
          </span>
          {r.href ? (
            <LocalizedLink
              to={r.href}
              aria-label={r.name}
              className="absolute inset-0 no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-track-pink"
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * "Where to go" on /going-out: the venues, organisations or neighbourhoods
 * for the place type picked in the sticky toolbar (`PlacesMenu`), shown in the
 * view picked in the section header (`PlaceViewSwitch`). Both live in the URL
 * (?place=, ?view=) so a filtered view can be shared.
 */
export function GoingOutPlaces({
  cityId,
  countryId,
  where,
  placeId,
  view,
  empty,
  interests,
}: {
  cityId: string | null;
  countryId: string | null;
  where: string;
  placeId: string | null;
  view: PlaceView;
  /** Rendered when the unfiltered view finds nothing. */
  empty: ReactNode;
  /** Interest filters from the page; narrow venues only. */
  interests?: InterestFilters;
}) {
  const { t } = useTranslation();
  const filter = PLACE_FILTERS.find((f) => f.id === placeId) ?? null;
  const kind = filter?.kind ?? 'venues';
  const categories = filter?.kind === 'venues' ? filter.categories : ALL_PLACE_CATEGORIES;

  const venues = useNightlifeVenues(cityId, 24, categories, kind === 'venues', interests);
  const narrowed = Boolean(
    interests?.tags?.length || interests?.targetGroups?.length || interests?.access?.length,
  );
  // Organisations are country-scoped in the RPC; prefer the city's own. Ask by
  // role: unfiltered, the head is the venue-identity orgs the spine mints above
  // every venue (DE: 6,818 `venue` vs 134 `support`), i.e. venues listed twice.
  const orgsOn = kind === 'organizations' && Boolean(countryId);
  const orgOpts = { countryId: countryId ?? undefined, limit: 60, enabled: orgsOn };
  const support = useOrganizationsList({ ...orgOpts, role: 'support' });
  const advocacy = useOrganizationsList({ ...orgOpts, role: 'advocacy' });
  // No country code: neighbourhoods stay city-scoped, never a country fallback.
  const spaces = useMeetSpaces(kind === 'neighbourhoods' ? cityId : null, null, 24);
  const { data: centre } = useCityCentre(cityId);

  const allOrgs = [...(support.data ?? []), ...(advocacy.data ?? [])].filter(
    (o, i, arr) => arr.findIndex((x) => x.id === o.id) === i,
  );
  const cityOrgs = allOrgs.filter((o) => o.city_id === cityId);
  const orgRows = cityOrgs.length > 0 ? cityOrgs : allOrgs;
  const villages = (spaces.data?.spaces ?? []).filter((s) => s.kind === 'village');

  const loading =
    kind === 'venues'
      ? venues.isLoading
      : kind === 'organizations'
        ? support.isLoading || advocacy.isLoading
        : spaces.isLoading;

  let body: ReactNode;
  if (view === 'map') {
    const layer: LayerType =
      kind === 'organizations'
        ? 'organizations'
        : kind === 'neighbourhoods'
          ? 'neighbourhoods'
          : 'venues';
    const singleCategory =
      filter?.kind === 'venues' && filter.categories.length === 1 ? filter.categories[0] : null;
    body = (
      <div className="overflow-hidden rounded-panel">
        {/* Keyed on city + layer + category: ExploreMap reads these once, at mount. */}
        <ExploreMap
          key={`${cityId ?? 'world'}:${layer}:${singleCategory ?? ''}`}
          height={480}
          defaultLayers={[layer]}
          defaultFilters={singleCategory ? { category: singleCategory } : undefined}
          initialCenter={centre ? [centre.longitude, centre.latitude] : undefined}
          initialZoom={centre ? 12 : undefined}
          skipAutoFly
          cooperativeGestures
        />
      </div>
    );
  } else if (loading) {
    body = (
      <p className="text-muted-foreground">{t('goingOut.places.loading', 'Finding places…')}</p>
    );
  } else if (kind === 'organizations') {
    body =
      orgRows.length === 0 ? (
        <p className="text-muted-foreground">
          {t('goingOut.places.noOrgs', 'No organisations listed for {{where}} yet.', { where })}
        </p>
      ) : view === 'grid' ? (
        <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {orgRows.map((o) => (
            <li key={o.id}>
              <OrganizationCard org={o} />
            </li>
          ))}
        </ul>
      ) : (
        <PlaceRows
          rows={orgRows.map((o) => ({
            id: o.id,
            icon: 'info-point',
            name: o.name,
            sub: o.editorial_hook ?? o.description,
            href: `/organizations/${o.slug}`,
          }))}
        />
      );
  } else if (kind === 'neighbourhoods') {
    body =
      villages.length === 0 ? (
        <p className="text-muted-foreground">
          {t('goingOut.places.noNeighbourhoods', 'No neighbourhoods listed for {{where}} yet.', {
            where,
          })}
        </p>
      ) : (
        <PlaceRows
          rows={villages.map((v) => ({
            id: v.id,
            icon: 'pride',
            name: v.name,
            sub: v.description,
            href: v.slug ? `/villages/${v.slug}` : null,
          }))}
        />
      );
  } else {
    const rows = venues.data ?? [];
    body =
      rows.length === 0 ? (
        filter || narrowed ? (
          <p className="text-muted-foreground">
            {t(
              'goingOut.places.noneForFilter',
              'Nothing listed for {{where}} under this filter yet.',
              {
                where,
              },
            )}
          </p>
        ) : (
          empty
        )
      ) : view === 'grid' ? (
        <ul className="going-out-venues m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((v) => (
            <li key={v.id}>
              <VenueCard
                venue={v as unknown as Parameters<typeof VenueCard>[0]['venue']}
                coverAspect="hero"
              />
            </li>
          ))}
        </ul>
      ) : (
        <PlaceRows
          rows={rows.map((v) => ({
            id: v.id,
            icon: iconForMarker('venues', v.category),
            name: v.name,
            sub: [
              v.category
                ? t(`venueCategories.${v.category}`, venueCategoryFallbackLabel(v.category) ?? '')
                : null,
              v.city,
            ]
              .filter(Boolean)
              .join(' · '),
            href: v.slug ? `/venues/${v.slug}` : null,
          }))}
        />
      );
  }

  return <div className="space-y-4">{body}</div>;
}

/** "Places: Bars ▾" — the place type, for the sticky toolbar. */
export function PlacesMenu({
  placeId,
  onPlaceChange,
}: {
  placeId: string | null;
  onPlaceChange: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const filter = PLACE_FILTERS.find((f) => f.id === placeId) ?? null;
  const name = (id: string, fallback: string) => t(`goingOut.places.types.${id}`, fallback);
  const current = filter ? name(filter.id, filter.label) : t('goingOut.places.all', 'All places');
  const title = t('goingOut.places.filterLabel', 'Place type');
  const pick = (id: string | null) => {
    onPlaceChange(id);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FilterChip
          active={Boolean(filter) || open}
          aria-label={`${title}: ${current}`}
          label={
            <>
              <span className="whitespace-nowrap">{current}</span>
              <span aria-hidden>▾</span>
            </>
          }
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={16}
        className="w-[min(26rem,calc(100vw-2rem))]"
      >
        <div role="group" aria-label={title} className="flex flex-wrap gap-2">
          <FilterChip
            active={!filter}
            onClick={() => pick(null)}
            label={t('goingOut.places.all', 'All places')}
          />
          {PLACE_FILTERS.map((f) => (
            <FilterChip
              key={f.id}
              active={filter?.id === f.id}
              onClick={() => pick(f.id)}
              label={
                <>
                  <TransitIcon name={f.icon} size={16} />
                  {name(f.id, f.label)}
                </>
              }
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Grid / list / map, for the "Where to go" section header. */
export function PlaceViewSwitch({
  view,
  onViewChange,
}: {
  view: PlaceView;
  onViewChange: (view: PlaceView) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t('goingOut.places.viewLabel', 'View')}
      className="flex shrink-0 gap-1 rounded-element bg-surface-container p-1"
    >
      {PLACE_VIEWS.map((v) => {
        const Icon = VIEW_ICONS[v];
        const name = t(`goingOut.places.view.${v}`, VIEW_LABELS[v]);
        return (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            aria-label={name}
            title={name}
            onClick={() => onViewChange(v)}
            className={`grid size-11 place-items-center rounded-element transition-colors ${
              view === v
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-card hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
