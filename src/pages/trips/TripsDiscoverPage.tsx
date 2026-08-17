import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMeta } from '@/hooks/useMeta';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { PageContainer } from '@/components/layout/PageContainer';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Button } from '@/components/ui/button';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { useLoaderDelay } from '@/components/transit/useLoaderDelay';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { NestedEntityCard } from '@/components/transit/NestedEntityCard';
import { FilterChip } from '@/components/transit/FilterChip';
import { GatedContentNotice } from '@/components/safety/GatedContentNotice';
import { TripTemplates } from '@/components/trips/TripTemplates';
import { RoutePicker } from '@/components/trips/discover/RoutePicker';
import { RouteLineStage } from '@/components/trips/discover/RouteLineStage';
import { useLineStationPool } from '@/hooks/useLineStationPool';
import { useTripMutations } from '@/hooks/useTrips';
import {
  generateLine,
  lineDates,
  swapStation,
  type LineResult,
  type PaceId,
  type VibeId,
} from '@/lib/lines/generateLine';
import { seasonWindows, type SeasonId } from '@/lib/lines/seasons';

/**
 * /trips/discover — the line generator.
 *
 * This page used to browse public trips. There were none: nine trips existed,
 * zero public, zero saved, zero forked, so every filter, sort, region rail and
 * social counter on it was dead code and 100% of visitors saw an empty state.
 * The premise, not the styling, was the problem.
 *
 * What the platform actually has is places — 346 cities carrying an image,
 * prose, safety notes, coordinates and at least ten live venues. So the page
 * builds a route out of them: pick a vibe, a season and a pace, get a subway
 * line of three to five real cities, ride it into a trip you own. That last
 * step is also the only thing that will ever fill the public-trip pool this
 * page used to browse.
 *
 * Sharp split from /travel, which stays browse-and-read (rails, editorial,
 * map). This page is act-and-build. No shared sections.
 *
 * The old machinery — DiscoverFilters, DiscoverMap, PublicTripCard,
 * useDiscoverableTrips — is deliberately left on disk and simply not imported
 * here. DiscoverableTripsRail on /travel and EmptyTripsHero still use parts of
 * it, and `trips.discover.title` / `.button` are in REQUIRED_KEYS of the locale
 * coverage test. Sweeping the dead parts is a separate change.
 */

const DEFAULT_PACE: PaceId = 'steady';

export default function TripsDiscoverPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useLocalizedNavigate();
  const { createTrip, addPlacesBulk } = useTripMutations();

  useMeta({
    title: t('trips.discover.meta.title', 'Build a route | Queer Guide'),
    description: t(
      'trips.discover.meta.description',
      'Pick a vibe, a season and a pace. Get a route of real cities with venue counts, legal status and what is on while you are there.',
    ),
    canonicalPath: '/trips/discover',
  });

  const { data: pool, isLoading, isError, refetch } = useLineStationPool();

  const [vibe, setVibe] = useState<VibeId | null>(null);
  const [season, setSeason] = useState<SeasonId | null>(null);
  const [pace, setPace] = useState<PaceId>(DEFAULT_PACE);
  const [seed, setSeed] = useState(1);
  const [generation, setGeneration] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const [creating, setCreating] = useState(false);
  // A single-stop swap replaces one station and leaves the rest of the line
  // alone, so it is an OVERRIDE of the generated result rather than a new
  // generation. Keyed by generation so changing a pick or rerolling discards it
  // automatically — and so the arrival animation does not replay for a change
  // that only touched one plate.
  const [override, setOverride] = useState<{ gen: number; result: LineResult } | null>(null);
  const [swapCount, setSwapCount] = useState(0);
  // STATE, not a ref. `generateLine` reads this during render, and a ref read
  // during render is not guaranteed to be the value React rendered with — the
  // memo could recompute from a mutation it never saw, which is precisely the
  // determinism this whole module is built on. It only ever changes in an event
  // handler, so it cannot loop.
  const [recentAnchors, setRecentAnchors] = useState<string[]>([]);

  // Pinned once per mount. Reading the clock inside the memo would make the
  // line's identity depend on when React happened to re-render.
  const now = useMemo(() => new Date(), []);
  const windows = useMemo(() => seasonWindows(now), [now]);
  const activeWindow = useMemo(
    () => windows.find((w) => w.id === season) ?? null,
    [windows, season],
  );

  const generated = useMemo(() => {
    if (!pool?.length) return null;
    return generateLine(pool, {
      vibe,
      pace,
      seed,
      recentAnchorIds: recentAnchors,
    });
  }, [pool, vibe, pace, seed, recentAnchors]);

  const result = override?.gen === generation ? override.result : generated;

  const handleSwap = useCallback(
    (stationId: string) => {
      if (!result || !pool) return;
      const index = result.stations.findIndex((s) => s.id === stationId);
      if (index < 0) return;
      const swapped = swapStation(pool, result, index, seed + swapCount + 1);
      if (!swapped) {
        toast({
          title: t('trips.discover.route.noSwap', 'Nothing else fits there'),
          description: t(
            'trips.discover.route.noSwapBody',
            'No other city is the right distance from both neighbours. Draw another line instead.',
          ),
        });
        return;
      }
      setSwapCount((c) => c + 1);
      setOverride({ gen: generation, result: swapped });
    },
    [result, pool, seed, swapCount, generation, toast, t],
  );

  const bump = useCallback(() => {
    const anchorId = result?.stations[0]?.id;
    if (anchorId) setRecentAnchors((prev) => [...prev, anchorId].slice(-5));
    setSeed((s) => s + 1);
    setGeneration((g) => g + 1);
  }, [result]);

  const repick = useCallback(<T,>(setter: (v: T) => void) => {
    return (value: T) => {
      setter(value);
      setGeneration((g) => g + 1);
    };
  }, []);

  const announce = useCallback(() => {
    // Nothing to announce for the line that was already on screen when the page
    // loaded — a live region filled on first paint describes a change the
    // reader never made.
    if (generation === 0 || !result?.stations.length) return;
    setAnnouncement(
      t('trips.discover.route.announced', 'Line drawn: {{stations}}. {{count}} stops.', {
        stations: result.stations.map((s) => s.name).join(', '),
        count: result.stations.length,
      }),
    );
  }, [result, generation, t]);

  const rideThisLine = useCallback(async () => {
    if (!result?.stations.length) return;
    if (!user) {
      // Park the picks in the URL so signing in regenerates the identical line.
      const q = new URLSearchParams({ seed: String(seed), pace, ...(vibe ? { vibe } : {}) });
      navigate(`/auth?redirect=${encodeURIComponent(`/trips/discover?${q}`)}`);
      return;
    }
    const head = result.stations[0];
    const dates = lineDates(result, activeWindow?.start ?? null, now);
    setCreating(true);
    try {
      const trip = await createTrip.mutateAsync({
        title: t('trips.discover.route.tripTitle', '{{cities}} line', {
          cities: result.stations.map((s) => s.name).join(' – '),
        }),
        start_date: dates?.start,
        end_date: dates?.end,
        currency: head.currency ?? 'USD',
        cover_image_url: head.imageUrl ?? undefined,
        // NOT NULL in the DB. The old TripTemplates path omitted both and
        // raised 23502 on every click.
        primary_city_id: head.id,
        primary_country_id: head.countryId,
        primary_city_name: head.name,
        primary_country_code: head.countryCode ?? undefined,
        timezone: head.timezone ?? undefined,
        vibe_tags: [vibe ? `vibe:${vibe}` : 'vibe:any', `pace:${pace}`, `seed:${seed}`],
      });
      await addPlacesBulk.mutateAsync({
        tripId: trip.id,
        rows: result.stations.map((s, i) => ({
          day_id: null,
          venue_id: null,
          event_id: null,
          hotel_id: null,
          custom_name: s.name,
          custom_address: null,
          latitude: s.latitude,
          longitude: s.longitude,
          // Required: the trip_places backfill trigger derives geo only from
          // venue/event/hotel ids, never from a bare city row.
          city_id: s.id,
          country_id: s.countryId,
          start_time: null,
          end_time: null,
          duration_minutes: null,
          notes: s.editorialHook ?? null,
          category: 'city',
          sort_order: i,
          icon: null,
          arrive_mode: null,
        })),
      });
      navigate(`/trips/${trip.id}`);
    } catch (err) {
      toast({
        title: t('trips.discover.error.title', 'Could not build the trip'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  }, [
    result,
    user,
    seed,
    pace,
    vibe,
    navigate,
    activeWindow,
    now,
    createTrip,
    addPlacesBulk,
    t,
    toast,
  ]);

  const { visible: loaderVisible, slow } = useLoaderDelay(isLoading);
  // Memoised because `?? []` mints a new array every render, which would make
  // every downstream memo and every child prop change on each pass.
  const stations = useMemo(() => result?.stations ?? [], [result]);
  const drawable = stations.length >= 3;
  const worstCountryId = useMemo(() => {
    if (!stations.length) return null;
    return [...stations].sort((a, b) => (a.equalityScore ?? 100) - (b.equalityScore ?? 100))[0]
      .countryId;
  }, [stations]);

  return (
    <>
      {/* 1 — Masthead */}
      <header className="border-b border-border-hairline">
        <PageContainer flush className="pb-8 pt-8 md:pb-12 md:pt-16">
          <Eyebrow variant="kicker" as="div">
            {t('trips.discover.eyebrowRoute', 'Route builder')}
          </Eyebrow>
          <h1 className="mt-6 font-display text-hero leading-[0.95]">
            {t('trips.discover.titleRoute', 'Three cities. One line.')}
          </h1>
          <p className="mt-6 max-w-reading text-body-lg leading-relaxed text-muted-foreground">
            {t(
              'trips.discover.ledeRoute',
              'Tell us what you are after and how fast you move. We draw you a line through real cities — with the venue counts, the legal status and what is on while you are there.',
            )}
          </p>
        </PageContainer>
      </header>

      {/* 2 — The picker */}
      <section
        aria-labelledby="picker-h"
        className="border-b border-border-hairline bg-surface-container"
      >
        <PageContainer flush className="py-6 md:py-8">
          <h2 id="picker-h" className="font-display text-headline md:text-display">
            {t('trips.discover.picker.heading', 'Set the line')}
          </h2>
          <p className="mt-2 max-w-reading text-13 text-muted-foreground">
            {t('trips.discover.picker.hint', 'Pick a vibe, a season and a pace. The line redraws.')}
          </p>

          <div className="mt-6">
            {isLoading ? (
              <div className="flex items-center gap-4 py-8">
                {loaderVisible && (
                  <TrackLoader
                    size={22}
                    track="pink"
                    label={t('trips.discover.loading.pool', 'Loading the station list')}
                  />
                )}
                {slow && (
                  <p className="text-13 text-muted-foreground">
                    {t(
                      'trips.discover.loading.slow',
                      'Still working. The city index is slow right now.',
                    )}
                  </p>
                )}
              </div>
            ) : isError ? (
              <div className="bg-muted rounded-container p-4 md:p-6">
                <p className="text-title font-bold">
                  {t('trips.discover.error.poolTitle', 'The station list did not load.')}
                </p>
                <Button variant="outline" className="mt-4" onClick={() => void refetch()}>
                  {t('trips.discover.error.retry', 'Try again')}
                </Button>
              </div>
            ) : (
              <RoutePicker
                pool={pool ?? []}
                vibe={vibe}
                season={season}
                pace={pace}
                now={now}
                onVibe={repick(setVibe)}
                onSeason={repick(setSeason)}
                onPace={repick(setPace)}
              />
            )}
          </div>
        </PageContainer>
      </section>

      {/* 3 — The line */}
      <section aria-labelledby="route-h" className="border-b border-border-hairline">
        <PageContainer flush className="py-8 md:py-12">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h2 id="route-h" className="font-display text-headline md:text-display">
              {t('trips.discover.route.heading', 'Your line')}
            </h2>
            {!!stations.length && (
              <button
                type="button"
                onClick={bump}
                // `#route-stations` is the <ol> inside RouteLineStage, which
                // refuses to draw a line under three stops. With one or two the
                // caller renders plain cards instead, so the id is absent and a
                // static aria-controls would point at nothing (axe
                // aria-valid-attr-value, critical). Reroll still works there.
                aria-controls={drawable ? 'route-stations' : undefined}
                className="inline-flex h-10 items-center gap-2 px-4 text-15 font-bold transition-colors duration-fast hover:bg-foreground hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <TransitIcon name="route" size={18} />
                {t('trips.discover.route.reroll', 'Draw another')}
              </button>
            )}
          </div>

          {/* Live region is a SIBLING of the list. Wrapping the <ol> would make a
              screen reader re-announce every plate on every reroll. */}
          <p className="sr-only" role="status">
            {announcement}
          </p>

          {result && stations.length > 0 && (
            <>
              <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-15">
                <RouteBullet type="trip" size={30} />
                <span className="font-bold tabular-nums">
                  {t(
                    'trips.discover.route.summary',
                    '{{stops}} stops · {{km}} km · {{countries}} countries',
                    {
                      stops: stations.length,
                      km: result.totalKm.toLocaleString(),
                      countries: result.countryIds.length,
                    },
                  )}
                </span>
              </p>

              {result.anchorSnappedFrom && (
                <p className="mt-2 text-13 text-muted-foreground">
                  {t(
                    'trips.discover.route.snapped',
                    'Starting {{km}} km from {{name}} — the nearest city we have enough on.',
                    result.anchorSnappedFrom,
                  )}
                </p>
              )}

              {result.outcome === 'chain_exhausted' && (
                <p className="mt-2 text-13 text-muted-foreground">
                  {t(
                    'trips.discover.route.short',
                    'This line runs {{delivered}} stops, not {{requested}}. {{eligible}} cities match that vibe, and the rest are further apart than this pace goes.',
                    {
                      delivered: result.delivered,
                      requested: result.requested,
                      eligible: result.eligibleCount,
                    },
                  )}
                </p>
              )}
            </>
          )}

          {drawable ? (
            <RouteLineStage
              className="mt-8 lg:mt-12"
              stations={stations}
              generation={generation}
              window={activeWindow}
              onSwap={handleSwap}
              onSettled={announce}
            />
          ) : (
            !isLoading &&
            !isError && (
              <div className="mt-6">
                <div className="bg-muted rounded-container p-4 md:p-6">
                  <p className="text-title font-bold">
                    {stations.length === 0
                      ? t('trips.discover.degraded.none', 'No cities match those picks.')
                      : t('trips.discover.degraded.title', 'Only {{count}} cities match.', {
                          count: stations.length,
                        })}
                  </p>
                  <p className="mt-2 text-13 text-muted-foreground">
                    {result?.nearestRefused
                      ? t(
                          'trips.discover.degraded.terminus',
                          'The nearest match is {{name}}, {{km}} km away — further than this pace goes.',
                          result.nearestRefused,
                        )
                      : t(
                          'trips.discover.degraded.body',
                          'A line needs three stops. Clear a pick to widen it.',
                        )}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {vibe && (
                      <FilterChip
                        active={false}
                        label={t('trips.discover.degraded.clearVibe', 'Any vibe')}
                        onClick={() => repick(setVibe)(null)}
                      />
                    )}
                    {pace !== 'sprint' && (
                      <FilterChip
                        active={false}
                        label={t('trips.discover.degraded.goFurther', 'Cover more ground')}
                        onClick={() => repick(setPace)('sprint')}
                      />
                    )}
                  </div>
                </div>

                {stations.length > 0 && (
                  <ul className="m-0 mt-4 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
                    {stations.map((s) => (
                      <li key={s.id}>
                        <NestedEntityCard
                          type="city"
                          eyebrow={s.countryName}
                          name={s.name}
                          description={s.editorialHook ?? s.description}
                          href={`/city/${s.slug}`}
                        />
                      </li>
                    ))}
                  </ul>
                )}

                {stations.length === 0 && <TripTemplates />}
              </div>
            )
          )}

          {/* Anonymous readers get a smaller pool — line_station_pool() is
              SECURITY INVOKER, so the venue RLS gate drops criminalising-country
              cities out of the >= 10 venue bar on its own. Say so rather than
              letting the gap look like the whole truth. */}
          {worstCountryId && <GatedContentNotice countryId={worstCountryId} />}
        </PageContainer>
      </section>

      {/* 4 — CTA */}
      {drawable && (
        <section className="border-b border-border-hairline bg-foreground text-background">
          <PageContainer flush className="py-8 md:py-12">
            <h2 className="font-display text-headline md:text-display">
              {t('trips.discover.cta.heading', 'Ride this line.')}
            </h2>
            <p className="mt-4 max-w-reading text-body-lg text-background/80">
              {t(
                'trips.discover.cta.body',
                'Turns into a trip you own, with every stop already on it. Change anything you like afterwards.',
              )}
            </p>
            <div className="mt-6 flex flex-wrap gap-4">
              <Button
                variant="accent"
                size="lg"
                onClick={() => void rideThisLine()}
                loading={creating}
              >
                {t('trips.discover.cta.primary', 'Make it a trip')}
              </Button>
              <Button
                variant="outline"
                size="lg"
                // `bg-transparent` is load-bearing on an ink band: the outline
                // variant carries `bg-background`, so paper fill plus the paper
                // text this override sets rendered a white box with white text —
                // measured 1:1 contrast, completely invisible.
                className="border border-background bg-transparent text-background hover:bg-background hover:text-foreground"
                onClick={bump}
              >
                {t('trips.discover.cta.secondary', 'Draw another')}
              </Button>
            </div>
          </PageContainer>
        </section>
      )}
    </>
  );
}
