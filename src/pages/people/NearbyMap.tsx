import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Heart, List, MapPin, Search, Users } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useMyIntimateProfile } from '@/hooks/useIntimateProfile';
import {
  useCruisingMapSpots,
  useCruisingPresenceAreas,
  useCruisingSpotsList,
  useNearbyPresenceAreas,
  type CruisingBounds,
  type CruisingPresenceArea,
  type CruisingSpot,
} from '@/hooks/useCruisingGuide';
import type { AreaKind } from '@/components/cruising/CruisingMap';
import { parseLayers, serializeLayers, type LayerKey } from '@/lib/nearbyLayers';
import { CruisingMapPanel } from '@/components/cruising/CruisingMapPanel';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 40;
/**
 * The one live map: members live near you (People), opted-in members live for
 * dating (Dating, 18+ only) and listed cruising places (Spots). Counts per
 * city only; nobody is ever drawn at their own position.
 */
export function NearbyMap() {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const [params, setParams] = useSearchParams();
  const { data: intimateProfile } = useMyIntimateProfile();
  const optedIn = !!intimateProfile?.opted_in_at;
  const layers = parseLayers(params.get('layers'), optedIn);

  const [search, setSearch] = useState(params.get('q') ?? '');
  const deferredSearch = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const [mapBounds, setMapBounds] = useState<CruisingBounds | null>(null);
  const [selectedSpot, setSelectedSpot] = useState<CruisingSpot | null>(null);

  const peopleQuery = useNearbyPresenceAreas(layers.people);
  const datingQuery = useCruisingPresenceAreas(layers.dating);
  const mapQuery = useCruisingMapSpots(layers.spots, deferredSearch, mapBounds);
  const listQuery = useCruisingSpotsList(layers.spots, deferredSearch, page, PAGE_SIZE);

  const toggle = (key: LayerKey) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set('layers', serializeLayers({ ...layers, [key]: !layers[key] }));
        return next;
      },
      { replace: true },
    );

  // A dating area opens the dating profiles for that city; a people area has
  // no page of its own (the list below is the people near you).
  const selectArea = useCallback(
    (area: CruisingPresenceArea, kind: AreaKind) => {
      if (kind === 'dating')
        navigate(`/meet/dating?city=${area.city_id}&in=${encodeURIComponent(area.city_name)}`);
    },
    [navigate],
  );

  const spots = useMemo(() => listQuery.data?.spots ?? [], [listQuery.data?.spots]);
  const totalPages = Math.max(1, Math.ceil((listQuery.data?.total ?? 0) / PAGE_SIZE));
  const selectedSpotInPanel =
    selectedSpot && !spots.some((spot) => spot.id === selectedSpot.id) ? selectedSpot : null;

  const chips: { key: LayerKey; label: string; icon: typeof Users; available: boolean }[] = [
    { key: 'people', label: t('nearby.layers.people', 'People'), icon: Users, available: true },
    {
      key: 'dating',
      label: t('nearby.layers.dating', 'Dating'),
      icon: Heart,
      available: optedIn,
    },
    { key: 'spots', label: t('nearby.layers.spots', 'Spots'), icon: MapPin, available: true },
  ];

  return (
    <section aria-label={t('nearby.map.label', 'Live map')} className="flex flex-col gap-4">
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label={t('cruising.layers.label', 'Map layers')}
      >
        {chips
          .filter((c) => c.available)
          .map(({ key, label, icon: Icon }) => (
            <Button
              key={key}
              size="sm"
              variant={layers[key] ? 'default' : 'outline'}
              aria-pressed={layers[key]}
              onClick={() => toggle(key)}
            >
              <Icon size={14} aria-hidden />
              {label}
            </Button>
          ))}
        {!optedIn && (
          <LocalizedLink to="/meet/dating" className="text-13 text-muted-foreground">
            {t('nearby.layers.datingLocked', 'Dating layer: set up a dating profile (18+)')}
          </LocalizedLink>
        )}
      </div>

      <div
        className={cn(
          'grid grid-cols-1 gap-4 overflow-hidden rounded-container bg-surface-container p-2 lg:p-4',
          layers.spots && 'lg:grid-cols-[minmax(0,1.6fr)_minmax(22rem,.8fr)]',
        )}
      >
        <div className="relative h-[56dvh] min-h-[28rem] lg:h-[calc(100dvh-16rem)] lg:min-h-[36rem]">
          <CruisingMapPanel
            spots={layers.spots ? (mapQuery.data ?? []) : []}
            datingAreas={datingQuery.data ?? []}
            peopleAreas={peopleQuery.data ?? []}
            layers={layers}
            focusSpot={selectedSpot}
            onSelectSpot={setSelectedSpot}
            onSelectArea={selectArea}
            onSearchArea={setMapBounds}
          />
          {mapQuery.isError ? (
            <div
              role="alert"
              className="pointer-events-none absolute inset-x-4 bottom-14 z-20 bg-destructive px-4 py-4 text-sm text-destructive-foreground shadow-sm"
            >
              {t('cruising.results.error')}
            </div>
          ) : null}
        </div>

        {layers.spots && (
          <aside className="min-h-[24rem] rounded-element bg-background px-4 py-4 md:px-6 lg:max-h-[calc(100dvh-16rem)] lg:overflow-y-auto">
            <label htmlFor="cruising-search" className="sr-only">
              {t('cruising.search.label')}
            </label>
            <div className="relative mb-4">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                size={16}
                aria-hidden
              />
              <Input
                id="cruising-search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder={t('cruising.search.placeholder')}
                className="pl-10"
              />
            </div>

            <div className="mb-4 flex items-baseline justify-between gap-4 text-13">
              <p className="font-semibold">
                {t('cruising.count.spots', { count: listQuery.data?.total ?? 0 })}
              </p>
              <p className="text-muted-foreground">
                {t('cruising.count.map', { count: mapQuery.data?.length ?? 0 })}
              </p>
            </div>

            {listQuery.isLoading ? (
              <PageLoadingState count={6} variant="list" label={t('cruising.results.loading')} />
            ) : listQuery.isError ? (
              <p role="alert" className="py-8 text-sm text-destructive">
                {t('cruising.results.error')}
              </p>
            ) : spots.length === 0 ? (
              <p className="py-8 text-sm text-muted-foreground">{t('cruising.results.empty')}</p>
            ) : (
              <div className="space-y-2">
                {selectedSpotInPanel ? (
                  <SpotRow spot={selectedSpotInPanel} selected onFocusMap={setSelectedSpot} />
                ) : null}
                {spots.map((spot) => (
                  <SpotRow
                    key={spot.id}
                    spot={spot}
                    selected={selectedSpot?.id === spot.id}
                    onFocusMap={setSelectedSpot}
                  />
                ))}
              </div>
            )}

            <div className="mt-6 flex items-center justify-between gap-4">
              <Button
                variant="soft"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                {t('cruising.pagination.previous')}
              </Button>
              <span className="text-xs text-muted-foreground">
                {t('cruising.pagination.page', { page, totalPages })}
              </span>
              <Button
                variant="soft"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              >
                {t('cruising.pagination.next')}
              </Button>
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}

function SpotRow({
  spot,
  selected,
  onFocusMap,
}: {
  spot: CruisingSpot;
  selected: boolean;
  onFocusMap: (spot: CruisingSpot) => void;
}) {
  const { t } = useTranslation();
  const location = [spot.city, spot.state, spot.country].filter(Boolean).join(', ');
  const mapped = typeof spot.latitude === 'number' && typeof spot.longitude === 'number';
  return (
    <article
      className={cn('rounded-element bg-surface-container px-4 py-4', selected && 'bg-muted')}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-bold leading-snug">{spot.name}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {location || t('cruising.spot.locationIncomplete')}
          </p>
        </div>
        {spot.verified ? (
          <span className="shrink-0 text-2xs font-bold uppercase tracking-wide">
            {t('cruising.spot.verified')}
          </span>
        ) : null}
      </div>
      {spot.description ? (
        <p className="mt-2 line-clamp-2 text-13 text-muted-foreground">{spot.description}</p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {mapped ? (
          <Button variant="soft" size="sm" onClick={() => onFocusMap(spot)}>
            <MapPin size={14} aria-hidden />
            {t('cruising.spot.showOnMap')}
          </Button>
        ) : (
          <span className="inline-flex min-h-10 items-center gap-2 text-xs text-muted-foreground">
            <List size={14} aria-hidden /> {t('cruising.spot.noCoordinates')}
          </span>
        )}
        <Button variant="ghost" size="sm" asChild>
          <LocalizedLink to={`/venues/${spot.slug}`}>{t('cruising.spot.details')}</LocalizedLink>
        </Button>
      </div>
    </article>
  );
}
