import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { EntityMap, type EntityMapMarker } from '@/components/map/EntityMap';
import { untypedSupabase } from '@/integrations/supabase/untyped';
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
import { deriveBadges, type FootprintStats } from '@/components/footprint/deriveBadges';
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
import { TripsSummaryCard } from '@/components/profile/travel/TripsSummaryCard';
import { FavoritesSummaryCard } from '@/components/profile/travel/FavoritesSummaryCard';
import { AtlasMap } from '@/components/footprint/AtlasMap';

interface TravelTabProps {
  userId: string;
  isOwnProfile: boolean;
}

export function TravelTab({ userId, isOwnProfile }: TravelTabProps) {
  return isOwnProfile ? <OwnTravel /> : <PublicTravel userId={userId} />;
}

/* ---------- public lens: footprint_public_stats honoring per-stat share flags ---------- */

interface PublicRow extends FootprintStats {
  share_countries: boolean;
  share_cities: boolean;
  share_venues: boolean;
  share_events: boolean;
  share_villages: boolean;
}

function PublicTravel({ userId }: { userId: string }) {
  const [row, setRow] = useState<PublicRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await untypedSupabase.rpc('footprint_public_stats', { p_user_id: userId });
      const r = Array.isArray(data) ? data[0] : data;
      if (cancelled) return;
      if (!r) {
        setRow(null);
        setLoading(false);
        return;
      }
      const rec = r as Record<string, unknown>;
      const n = (k: string) => Number(rec[k] ?? 0) || 0;
      setRow({
        countries_visited: n('countries_visited'),
        total_countries: n('total_countries'),
        cities_visited: n('cities_visited'),
        venues_visited: n('venues_visited'),
        events_visited: n('events_visited'),
        villages_visited: n('villages_visited'),
        continents_touched: n('continents_touched'),
        pride_events: n('pride_events'),
        share_countries: !!rec.share_countries,
        share_cities: !!rec.share_cities,
        share_venues: !!rec.share_venues,
        share_events: !!rec.share_events,
        share_villages: !!rec.share_villages,
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) {
    return (
      <div className="py-12 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const anyShared =
    row &&
    (row.share_countries ||
      row.share_cities ||
      row.share_venues ||
      row.share_events ||
      row.share_villages);

  if (!row || !anyShared) {
    return <p className="py-8 text-center text-muted-foreground">This footprint is private.</p>;
  }

  return (
    <StatsPanel
      stats={row}
      visible={{
        countries: row.share_countries,
        continents: row.share_countries,
        cities: row.share_cities,
        venues: row.share_venues,
        events: row.share_events,
        pride: row.share_events,
        villages: row.share_villages,
      }}
    />
  );
}

/* ---------- own lens: full footprint + trips/favorites summaries ---------- */

function OwnTravel() {
  const { data: marks = [], isLoading } = useMyPlaceMarks();
  const { data: stats } = useFootprintStats();
  const { data: nudge } = useFootprintReturnNudge();
  const { data: prefs } = useFootprintSharePrefs();
  const { data: trips = [] } = useTrips();

  const ids = useMemo(() => {
    const out = { venue: [] as string[], event: [] as string[], village: [] as string[] };
    // country/city marks belong to the Atlas, not the entity fetcher.
    marks.forEach((m) => {
      if (m.entity_type in out) out[m.entity_type as keyof typeof out].push(m.entity_id);
    });
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
    const collect = (
      rows: Array<{ city_id: string | null; cities: { name: string; slug: string } | null }>,
    ) =>
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
    const cities = new Set<string>();
    thisYear.forEach((m) => {
      if (m.city_id) cities.add(m.city_id);
    });
    return {
      year,
      countries: cities.size,
      topCity: topId ? (cityNameById.get(topId)?.name ?? null) : null,
      venues: thisYear.filter((m) => m.entity_type === 'venue').length,
      events: thisYear.filter((m) => m.entity_type === 'event').length,
    };
  }, [marks, cityNameById]);

  if (isLoading) {
    return (
      <div className="py-12 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
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
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2">
        <TripsSummaryCard />
        <FavoritesSummaryCard />
      </div>

      <StatsPanel stats={effectiveStats} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Atlas</CardTitle>
        </CardHeader>
        <CardContent>
          <AtlasMap />
        </CardContent>
      </Card>

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
        const recent = marks.filter((m) => m.trip_id && tripById.has(m.trip_id!)).slice(0, 8);
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
                  <div key={m.id} className="flex items-baseline justify-between gap-4">
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

      <p className="text-13 text-muted-foreground">
        Only the stats you share in the controls above are visible to others.
      </p>
    </div>
  );
}
