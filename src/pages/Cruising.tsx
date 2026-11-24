import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router';
import { Compass, List, MapPin, Search, ShieldCheck, Users } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useAuth } from '@/hooks/useAuth';
import { useMeta } from '@/hooks/useMeta';
import { useMyIntimateProfile } from '@/hooks/useIntimateProfile';
import {
  useCruisingMapSpots,
  useCruisingPresenceAreas,
  useCruisingSpotsList,
  type CruisingBounds,
  type CruisingPresenceArea,
  type CruisingSpot,
} from '@/hooks/useCruisingGuide';
import type { CruisingLayer } from '@/components/cruising/CruisingMap';
import { CruisingMapPanel } from '@/components/cruising/CruisingMapPanel';
import { LivePresenceControl } from '@/components/people/LivePresenceControl';
import IntimateDiscovery from '@/pages/intimate/IntimateDiscovery';
import { cn } from '@/lib/utils';
import { MeetNavBar } from '@/components/meet/MeetNav';
import { PageHeader } from '@/components/layout/PageHeader';

type View = 'profiles' | 'map';

const VIEW_KEY = 'meet.dating.view';

function isView(value: string | null): value is View {
  return value === 'profiles' || value === 'map';
}

/** Per-viewer convenience only; storage can throw or be empty. */
function storedView(): View | null {
  try {
    const value = localStorage.getItem(VIEW_KEY);
    return isView(value) ? value : null;
  } catch {
    return null;
  }
}

/** Old links used ?panel=people|spots before the two views existed. */
function legacyView(panel: string | null): View | null {
  return panel === 'people' ? 'profiles' : panel === 'spots' ? 'map' : null;
}

const PAGE_SIZE = 40;

function isLayer(value: string | null): value is CruisingLayer {
  return value === 'both' || value === 'people' || value === 'spots';
}

export default function Cruising() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { data: intimateProfile } = useMyIntimateProfile();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const deferredSearch = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const [mapBounds, setMapBounds] = useState<CruisingBounds | null>(null);
  const [selectedSpot, setSelectedSpot] = useState<CruisingSpot | null>(null);
  const [selectedArea, setSelectedArea] = useState<CruisingPresenceArea | null>(null);

  const rawView = params.get('view') ?? legacyView(params.get('panel'));
  const view: View = isView(rawView)
    ? rawView
    : (storedView() ?? (intimateProfile?.opted_in_at ? 'profiles' : 'map'));
  const rawLayer = params.get('layers');
  const layer: CruisingLayer = isLayer(rawLayer)
    ? rawLayer
    : intimateProfile?.opted_in_at
      ? 'both'
      : 'spots';

  useMeta({
    title: t('people.tabs.dating', 'Dating'),
    description: t('cruising.meta.description'),
    canonicalPath: '/meet/dating',
    noIndex: true,
  });

  const enabled = !!user && view === 'map';
  const listQuery = useCruisingSpotsList(enabled, deferredSearch, page, PAGE_SIZE);
  const mapQuery = useCruisingMapSpots(enabled && layer !== 'people', deferredSearch, mapBounds);
  const presenceQuery = useCruisingPresenceAreas(
    enabled && !!intimateProfile?.opted_in_at && layer !== 'spots',
  );

  useEffect(() => {
    const current = params.get('q') ?? '';
    if (current === deferredSearch) return;
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (deferredSearch) next.set('q', deferredSearch);
        else next.delete('q');
        return next;
      },
      { replace: true },
    );
  }, [deferredSearch, params, setParams]);

  const setRouteState = useCallback(
    (updates: Partial<{ view: View; layers: CruisingLayer }>) => {
      if (updates.view) {
        try {
          localStorage.setItem(VIEW_KEY, updates.view);
        } catch {
          // storage unavailable: the URL still carries the view
        }
      }
      setParams((previous) => {
        const next = new URLSearchParams(previous);
        next.delete('panel');
        if (updates.view) next.set('view', updates.view);
        if (updates.layers) next.set('layers', updates.layers);
        return next;
      });
    },
    [setParams],
  );

  // A people area on the map opens the profiles view, filtered to that city.
  const selectArea = useCallback(
    (area: CruisingPresenceArea) => {
      setSelectedArea(area);
      setRouteState({ view: 'profiles' });
    },
    [setRouteState],
  );

  const totalPages = Math.max(1, Math.ceil((listQuery.data?.total ?? 0) / PAGE_SIZE));
  const spots = useMemo(() => listQuery.data?.spots ?? [], [listQuery.data?.spots]);
  const mappedSpots = mapQuery.data ?? [];
  const presenceAreas = presenceQuery.data ?? [];

  const selectedSpotInPanel = useMemo(
    () =>
      selectedSpot && !spots.some((spot) => spot.id === selectedSpot.id) ? selectedSpot : null,
    [selectedSpot, spots],
  );

  if (authLoading) {
    return (
      <>
        <MeetNavBar />
        <PageContainer>
          <PageLoadingState count={4} label={t('cruising.loading')} />
        </PageContainer>
      </>
    );
  }
  if (!user) {
    return (
      <Navigate to="/auth" state={{ from: `${location.pathname}${location.search}` }} replace />
    );
  }

  const layerButtons = (
    <div className="flex flex-wrap gap-2" role="group" aria-label={t('cruising.layers.label')}>
      {(['both', 'people', 'spots'] as const).map((option) => (
        <Button
          key={option}
          size="sm"
          variant={layer === option ? 'default' : 'outline'}
          onClick={() => setRouteState({ layers: option })}
          className="capitalize"
        >
          {option === 'both' ? (
            <Compass size={14} aria-hidden />
          ) : option === 'people' ? (
            <Users size={14} aria-hidden />
          ) : (
            <MapPin size={14} aria-hidden />
          )}
          {t(`cruising.layers.${option}`)}
        </Button>
      ))}
    </div>
  );

  return (
    <div className="pb-12">
      <MeetNavBar />
      <PageContainer className="pb-6 pt-6 md:pt-8">
        <PageHeader
          title={t('cruising.title')}
          subtitle={t('cruising.intro')}
          actions={
            <div
              className="grid grid-cols-2 gap-1 bg-surface-container p-1"
              role="tablist"
              aria-label={t('cruising.views.label', 'Dating view')}
            >
              {(['profiles', 'map'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={view === option}
                  onClick={() => setRouteState({ view: option })}
                  className={cn(
                    'inline-flex min-h-11 items-center justify-center gap-2 px-4 text-sm font-semibold',
                    view === option && 'bg-background',
                  )}
                >
                  {option === 'profiles' ? (
                    <Users size={14} aria-hidden />
                  ) : (
                    <MapPin size={14} aria-hidden />
                  )}
                  {option === 'profiles'
                    ? t('cruising.views.profiles', 'Profiles')
                    : t('cruising.views.map', 'Map')}
                </button>
              ))}
            </div>
          }
        />

        <div className="flex items-start gap-4 bg-surface-container px-4 py-4 text-13">
          <ShieldCheck className="mt-0.5 shrink-0" size={17} aria-hidden />
          <p>
            {t('cruising.safety.body')}{' '}
            <LocalizedLink
              to="/tags/cruising"
              className="font-semibold underline underline-offset-4"
            >
              {t('cruising.safety.guide')}
            </LocalizedLink>{' '}
            {t('cruising.safety.healthLead')}{' '}
            <LocalizedLink
              to="/tags/sti-guide"
              className="font-semibold underline underline-offset-4"
            >
              {t('cruising.safety.health')}
            </LocalizedLink>
            .
          </p>
        </div>
      </PageContainer>

      {view === 'profiles' ? (
        <PageContainer className="pt-0">
          {selectedArea ? (
            <p className="mb-4 flex flex-wrap items-center gap-x-2 text-13 text-muted-foreground">
              {t('cruising.selectedArea', {
                city: selectedArea.city_name,
                count: selectedArea.active_count,
              })}
              <button
                type="button"
                className="font-bold text-foreground underline underline-offset-4"
                onClick={() => setSelectedArea(null)}
              >
                {t('cruising.views.allCities', 'Show all cities')}
              </button>
            </p>
          ) : null}
          <IntimateDiscovery embedded cityIdOverride={selectedArea?.city_id} />
        </PageContainer>
      ) : (
        <PageContainer className="pt-0">
          <div className="mb-4">{layerButtons}</div>
          <div className="grid grid-cols-1 gap-4 overflow-hidden bg-surface-container p-2 lg:min-h-[42rem] lg:grid-cols-[minmax(0,1.6fr)_minmax(22rem,.8fr)] lg:p-4">
            <div className="relative h-[56dvh] min-h-[28rem] lg:h-[calc(100dvh-13rem)] lg:min-h-[42rem]">
              <CruisingMapPanel
                spots={mappedSpots}
                presenceAreas={presenceAreas}
                layer={layer}
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

            <aside className="min-h-[30rem] bg-background px-4 py-4 md:px-6 lg:max-h-[calc(100dvh-13rem)] lg:overflow-y-auto">
              <div className="mb-6">
                <LivePresenceControl defaultAudience="dating" />
              </div>
              <div>
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
                    {t('cruising.count.map', { count: mappedSpots.length })}
                  </p>
                </div>

                {listQuery.isLoading ? (
                  <PageLoadingState
                    count={6}
                    variant="list"
                    label={t('cruising.results.loading')}
                  />
                ) : listQuery.isError ? (
                  <p role="alert" className="py-8 text-sm text-destructive">
                    {t('cruising.results.error')}
                  </p>
                ) : spots.length === 0 ? (
                  <p className="py-8 text-sm text-muted-foreground">
                    {t('cruising.results.empty')}
                  </p>
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
              </div>
            </aside>
          </div>
        </PageContainer>
      )}
    </div>
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
    <article className={cn('bg-surface-container px-4 py-4', selected && 'bg-muted')}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-bold leading-snug">{spot.name}</h2>
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
