import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useMeta } from '@/hooks/useMeta';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { EntityMap, type EntityMapMarker } from '@/components/map/EntityMap';
import { useAuth } from '@/hooks/useAuth';
import { useTrips } from '@/hooks/useTrips';
import {
  useMyPlaceMarks,
  useFootprintEntities,
  useFootprintCityTotals,
  type PlaceMark,
} from '@/hooks/usePlaceMarks';
import {
  useFootprintStats,
  useFootprintReturnNudge,
  useFootprintSharePrefs,
} from '@/hooks/useFootprintStats';
import { deriveBadges } from '@/components/footprint/deriveBadges';
import { StatsPanel } from '@/components/footprint/StatsPanel';
import { YearHeatmap } from '@/components/footprint/YearHeatmap';
import { BadgeRow } from '@/components/footprint/BadgeRow';
import {
  CityCompletionList,
  type CityCompletionRow,
} from '@/components/footprint/CityCompletionList';
import { YearInReview, type YearReviewData } from '@/components/footprint/YearInReview';
import { ReturnNudge } from '@/components/footprint/ReturnNudge';
import { ShareControls } from '@/components/footprint/ShareControls';

export default function Footprint() {
  const { user } = useAuth();
  useMeta({ title: 'Footprint — queer.guide', noIndex: true });

  const { data: marks = [], isLoading } = useMyPlaceMarks();
  const { data: stats } = useFootprintStats();
  const { data: nudge } = useFootprintReturnNudge();
  const { data: prefs } = useFootprintSharePrefs();
  const { data: trips = [] } = useTrips();

  const ids = useMemo(() => {
    const out = { venue: [] as string[], event: [] as string[], village: [] as string[] };
    marks.forEach((m) => out[m.entity_type].push(m.entity_id));
    return out;
  }, [marks]);
  const cityIds = useMemo(() => {
    const s = new Set<string>();
    marks.forEach((m) => m.city_id && s.add(m.city_id));
    return Array.from(s);
  }, [marks]);

  const { data: entityRows } = useFootprintEntities(ids);
  const { data: cityTotals } = useFootprintCityTotals(cityIds);

  const cityNameById = useMemo(() => {
    const m = new Map<string, { name: string; slug: string | null }>();
    if (!entityRows) return m;
    const collect = (rows: Array<{ city_id: string | null; cities: { name: string; slug: string } | null }>) =>
      rows.forEach((r) => {
        if (r.city_id && r.cities && !m.has(r.city_id))
          m.set(r.city_id, { name: r.cities.name, slug: r.cities.slug ?? null });
      });
    collect(entityRows.venue);
    collect(entityRows.event);
    collect(entityRows.village);
    return m;
  }, [entityRows]);

  const cityRows: CityCompletionRow[] = useMemo(() => {
    const byCity = new Map<string, CityCompletionRow>();
    marks
      .filter((m) => m.mark_type === 'visited' && m.entity_type === 'venue' && m.city_id)
      .forEach((m) => {
        const cid = m.city_id!;
        const meta = cityNameById.get(cid);
        const row = byCity.get(cid) ?? {
          city_id: cid,
          city_name: meta?.name ?? 'Unknown city',
          city_slug: meta?.slug ?? null,
          visited: 0,
          total_venues: cityTotals?.[cid] ?? 0,
        };
        row.visited += 1;
        byCity.set(cid, row);
      });
    return Array.from(byCity.values()).sort((a, b) => b.visited - a.visited);
  }, [marks, cityNameById, cityTotals]);

  const mapMarkers: EntityMapMarker[] = useMemo(() => {
    if (!entityRows) return [];
    const out: EntityMapMarker[] = [];
    const resolve = (m: PlaceMark) => {
      if (m.entity_type === 'venue') {
        const r = entityRows.venue.find((x) => x.id === m.entity_id);
        return r
          ? { name: r.name, lat: r.latitude, lng: r.longitude, slug: r.slug, type: 'venues' as const }
          : null;
      }
      if (m.entity_type === 'event') {
        const r = entityRows.event.find((x) => x.id === m.entity_id);
        return r
          ? { name: r.title, lat: r.latitude, lng: r.longitude, slug: r.slug, type: 'events' as const }
          : null;
      }
      const r = entityRows.village.find((x) => x.id === m.entity_id);
      return r
        ? { name: r.name, lat: r.latitude, lng: r.longitude, slug: r.slug, type: 'venues' as const }
        : null;
    };
    marks
      .filter((m) => m.mark_type === 'visited')
      .forEach((m) => {
        const e = resolve(m);
        if (!e || e.lat == null || e.lng == null) return;
        out.push({
          id: `${m.entity_type}-${m.id}`,
          lat: e.lat,
          lng: e.lng,
          name: e.name,
          type: e.type,
          linkTo: e.slug
            ? m.entity_type === 'event'
              ? `/events/${e.slug}`
              : m.entity_type === 'village'
              ? `/villages/${e.slug}`
              : `/venues/${e.slug}`
            : undefined,
        });
      });
    return out;
  }, [marks, entityRows]);

  const center: [number, number] = useMemo(() => {
    if (mapMarkers.length === 0) return [10, 50];
    const lat = mapMarkers.reduce((a, m) => a + m.lat, 0) / mapMarkers.length;
    const lng = mapMarkers.reduce((a, m) => a + m.lng, 0) / mapMarkers.length;
    return [lng, lat];
  }, [mapMarkers]);

  const yearReview: YearReviewData | null = useMemo(() => {
    if (new Date().getMonth() !== 11) return null;
    const year = new Date().getFullYear();
    const thisYear = marks.filter(
      (m) => m.mark_type === 'visited' && new Date(m.marked_at).getFullYear() === year,
    );
    if (thisYear.length === 0) return null;
    const cityCount = new Map<string, number>();
    thisYear.forEach((m) => {
      if (!m.city_id) return;
      cityCount.set(m.city_id, (cityCount.get(m.city_id) ?? 0) + 1);
    });
    const topId = Array.from(cityCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
    const countries = new Set<string>();
    thisYear.forEach((m) => {
      if (!m.city_id) return;
      // we don't have country lookup client-side; defer to a coarse "cities" proxy.
      countries.add(m.city_id);
    });
    return {
      year,
      countries: countries.size,
      topCity: topId ? cityNameById.get(topId)?.name ?? null : null,
      venues: thisYear.filter((m) => m.entity_type === 'venue').length,
      events: thisYear.filter((m) => m.entity_type === 'event').length,
    };
  }, [marks, cityNameById]);

  if (!user) {
    return (
      <div className="container mx-auto py-16 px-4 text-center">
        <h1 className="text-2xl font-semibold mb-2">Footprint</h1>
        <p className="text-muted-foreground mb-6">Sign in to see your private map.</p>
        <Button asChild>
          <LocalizedLink to="/auth">Sign in</LocalizedLink>
        </Button>
      </div>
    );
  }

  const effectiveStats = stats ?? {
    countries_visited: 0,
    total_countries: 0,
    cities_visited: 0,
    venues_visited: 0,
    events_visited: 0,
    villages_visited: 0,
    continents_touched: 0,
    pride_events: 0,
  };
  const badges = deriveBadges(effectiveStats, trips.length);

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Footprint</h1>
        <p className="text-muted-foreground mt-1">
          Your private passport. Only you can see this.
        </p>
      </header>

      {isLoading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          <StatsPanel stats={effectiveStats} />

          {badges.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Badges</CardTitle>
              </CardHeader>
              <CardContent>
                <BadgeRow badges={badges} />
              </CardContent>
            </Card>
          )}

          {nudge && nudge.new_venues > 0 && <ReturnNudge nudge={nudge} />}

          {yearReview && <YearInReview data={yearReview} />}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Year heatmap</CardTitle>
            </CardHeader>
            <CardContent>
              <YearHeatmap marks={marks} />
            </CardContent>
          </Card>

          {mapMarkers.length > 0 && (
            <Card className="overflow-hidden">
              <EntityMap
                center={center}
                zoom={mapMarkers.length > 1 ? 3 : 12}
                height={420}
                markers={mapMarkers}
                scrollZoom
              />
            </Card>
          )}

          {(() => {
            const tripById = new Map(trips.map((t) => [t.id, t]));
            const recent = marks
              .filter((m) => m.trip_id && tripById.has(m.trip_id!))
              .slice(0, 8);
            if (recent.length === 0) return null;
            return (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">From your trips</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {recent.map((m) => {
                    const trip = tripById.get(m.trip_id!);
                    return (
                      <div key={m.id} className="flex items-baseline justify-between gap-3">
                        <span className="text-sm capitalize">
                          {m.mark_type} · {m.entity_type}
                        </span>
                        <LocalizedLink
                          to={`/trips/${m.trip_id}`}
                          className="text-xs text-muted-foreground underline truncate"
                        >
                          from trip: {trip?.title ?? 'Trip'}
                        </LocalizedLink>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })()}

          {cityRows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">City completion</CardTitle>
              </CardHeader>
              <CardContent>
                <CityCompletionList rows={cityRows} />
              </CardContent>
            </Card>
          )}

          {prefs && <ShareControls prefs={prefs} />}
        </>
      )}
    </div>
  );
}
