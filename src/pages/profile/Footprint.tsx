import { useMemo, useRef, useState } from 'react';
import { Loader2, MapPin, Share2, Calendar, Building2, Mountain } from 'lucide-react';
import { useMeta } from '@/hooks/useMeta';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { EntityMap, type EntityMapMarker } from '@/components/map/EntityMap';
import { useAuth } from '@/hooks/useAuth';
import {
  useMyPlaceMarks,
  useFootprintEntities,
  useFootprintCityTotals,
  type PlaceMark,
  type PlaceMarkKind,
} from '@/hooks/usePlaceMarks';
import { useToast } from '@/hooks/use-toast';
import { useTrips } from '@/hooks/useTrips';

interface ResolvedMark extends PlaceMark {
  name: string;
  slug: string | null;
  lat: number | null;
  lng: number | null;
  city_name?: string | null;
}

interface CityCompletion {
  city_id: string;
  city_name: string;
  city_slug: string | null;
  visited: number;
  saved: number;
  total: number;
  pct: number;
}

const KINDS: PlaceMarkKind[] = ['visited', 'saved', 'contributed'];

export default function Footprint() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: marks, isLoading } = useMyPlaceMarks();
  const { data: trips = [] } = useTrips();
  const [filters, setFilters] = useState<PlaceMarkKind[]>(['visited', 'saved', 'contributed']);
  const shareRef = useRef<HTMLDivElement | null>(null);
  useMeta({ title: 'Footprint — queer.guide', noIndex: true });

  const ids = useMemo(() => {
    const out = { venue: [] as string[], event: [] as string[], village: [] as string[] };
    (marks || []).forEach((m) => out[m.entity_type].push(m.entity_id));
    return out;
  }, [marks]);

  const cityIds = useMemo(() => {
    const s = new Set<string>();
    (marks || []).forEach((m) => m.city_id && s.add(m.city_id));
    return Array.from(s);
  }, [marks]);

  const { data: entityRows } = useFootprintEntities(ids);
  const { data: cityTotals } = useFootprintCityTotals(cityIds);

  const resolved: ResolvedMark[] = useMemo(() => {
    if (!marks || !entityRows) return [];
    const lookup = (m: PlaceMark) => {
      if (m.entity_type === 'venue') {
        const r = entityRows.venue.find((x) => x.id === m.entity_id);
        return r ? { name: r.name, slug: r.slug, lat: r.latitude, lng: r.longitude, city_name: r.cities?.name } : null;
      }
      if (m.entity_type === 'event') {
        const r = entityRows.event.find((x) => x.id === m.entity_id);
        return r ? { name: r.title, slug: r.slug, lat: r.latitude, lng: r.longitude, city_name: r.cities?.name } : null;
      }
      const r = entityRows.village.find((x) => x.id === m.entity_id);
      return r ? { name: r.name, slug: r.slug, lat: r.latitude, lng: r.longitude, city_name: r.cities?.name } : null;
    };
    return marks
      .map((m) => {
        const ext = lookup(m);
        if (!ext) return null;
        return { ...m, ...ext } as ResolvedMark;
      })
      .filter((x): x is ResolvedMark => !!x);
  }, [marks, entityRows]);

  const filtered = resolved.filter((m) => filters.includes(m.mark_type));

  const stats = useMemo(() => {
    const venues = resolved.filter((m) => m.entity_type === 'venue' && m.mark_type === 'visited');
    const events = resolved.filter((m) => m.entity_type === 'event' && m.mark_type === 'visited');
    const cities = new Set(resolved.filter((m) => m.mark_type === 'visited').map((m) => m.city_id).filter(Boolean));
    return {
      venues: venues.length,
      events: events.length,
      cities: cities.size,
      saved: resolved.filter((m) => m.mark_type === 'saved').length,
    };
  }, [resolved]);

  const byYear = useMemo(() => {
    const m = new Map<number, ResolvedMark[]>();
    resolved
      .filter((r) => r.mark_type === 'visited')
      .forEach((r) => {
        const y = new Date(r.marked_at).getFullYear();
        if (!m.has(y)) m.set(y, []);
        m.get(y)!.push(r);
      });
    return Array.from(m.entries()).sort((a, b) => b[0] - a[0]);
  }, [resolved]);

  const cityCompletions: CityCompletion[] = useMemo(() => {
    const byCity = new Map<string, CityCompletion>();
    resolved.forEach((m) => {
      if (!m.city_id || !m.city_name) return;
      let row = byCity.get(m.city_id);
      if (!row) {
        row = {
          city_id: m.city_id,
          city_name: m.city_name,
          city_slug: null,
          visited: 0,
          saved: 0,
          total: cityTotals?.[m.city_id] ?? 0,
          pct: 0,
        };
        byCity.set(m.city_id, row);
      }
      if (m.mark_type === 'visited') row.visited += 1;
      if (m.mark_type === 'saved') row.saved += 1;
    });
    byCity.forEach((row) => {
      row.pct = row.total > 0 ? Math.min(100, Math.round((row.visited / row.total) * 100)) : 0;
    });
    return Array.from(byCity.values()).sort((a, b) => b.visited - a.visited);
  }, [resolved, cityTotals]);

  const recommendation = useMemo(() => {
    const top = cityCompletions.find((c) => c.pct >= 60);
    if (top) return `You've completed ${top.pct}% of ${top.city_name}. Try a city nearby next.`;
    if (cityCompletions[0]) {
      return `${cityCompletions[0].visited} visited in ${cityCompletions[0].city_name} — keep going.`;
    }
    return 'Mark venues, events, and villages you visit. Your private passport builds from here.';
  }, [cityCompletions]);

  const mapMarkers: EntityMapMarker[] = useMemo(() => {
    return filtered
      .filter((m) => m.lat != null && m.lng != null)
      .map((m) => ({
        id: `${m.entity_type}-${m.id}`,
        lat: m.lat!,
        lng: m.lng!,
        name: m.name,
        subtitle: `${m.mark_type} · ${m.city_name ?? ''}`,
        type: m.entity_type === 'event' ? 'events' : 'venues',
        linkTo:
          m.slug && m.entity_type === 'venue'
            ? `/venues/${m.slug}`
            : m.slug && m.entity_type === 'event'
            ? `/events/${m.slug}`
            : m.slug
            ? `/villages/${m.slug}`
            : undefined,
      }));
  }, [filtered]);

  const center: [number, number] = useMemo(() => {
    if (mapMarkers.length === 0) return [10, 50];
    const lat = mapMarkers.reduce((a, m) => a + m.lat, 0) / mapMarkers.length;
    const lng = mapMarkers.reduce((a, m) => a + m.lng, 0) / mapMarkers.length;
    return [lng, lat];
  }, [mapMarkers]);

  const handleShare = async () => {
    const year = new Date().getFullYear();
    const text = `${year} in ${stats.venues} venues, ${stats.cities} cities, ${stats.events} events. — my queer.guide footprint`;
    try {
      const blob = await renderRecapImage(stats, year);
      if (blob && navigator.canShare?.({ files: [new File([blob], 'footprint.png', { type: 'image/png' })] })) {
        await navigator.share({
          text,
          files: [new File([blob], 'footprint.png', { type: 'image/png' })],
        });
        return;
      }
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `queer-guide-footprint-${year}.png`;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: 'Image downloaded', description: 'Saved to your device.' });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copied', description: text });
    } catch {
      /* user cancelled */
    }
  };

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

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Footprint</h1>
        <p className="text-muted-foreground mt-1">
          Your private passport. Visited, saved, contributed — only you can see this.
        </p>
      </header>

      {isLoading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : resolved.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No marks yet. Visit a venue page and tap “Mark visited” to begin.
          </CardContent>
        </Card>
      ) : (
        <>
          <div ref={shareRef} className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatCard icon={<Building2 className="h-4 w-4" />} label="Venues" value={stats.venues} />
            <StatCard icon={<Calendar className="h-4 w-4" />} label="Events" value={stats.events} />
            <StatCard icon={<MapPin className="h-4 w-4" />} label="Cities" value={stats.cities} />
            <StatCard icon={<Mountain className="h-4 w-4" />} label="Saved" value={stats.saved} />
          </div>

          <div className="mb-4 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex gap-1">
              {KINDS.map((k) => {
                const active = filters.includes(k);
                return (
                  <Button
                    key={k}
                    type="button"
                    size="sm"
                    variant={active ? 'default' : 'outline'}
                    className="capitalize"
                    aria-pressed={active}
                    onClick={() => {
                      const next = active
                        ? filters.filter((x) => x !== k)
                        : [...filters, k];
                      if (next.length) setFilters(next);
                    }}
                  >
                    {k}
                  </Button>
                );
              })}
            </div>
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 className="h-4 w-4 mr-2" />
              Share recap
            </Button>
          </div>

          <Card className="mb-6 overflow-hidden">
            <EntityMap
              center={center}
              zoom={mapMarkers.length > 1 ? 4 : 12}
              height={420}
              markers={mapMarkers}
              scrollZoom
            />
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">{recommendation}</CardTitle>
            </CardHeader>
          </Card>

          {(() => {
            const tripById = new Map(trips.map((t) => [t.id, t]));
            const fromTrips = resolved.filter((m) => m.trip_id && tripById.has(m.trip_id!)).slice(0, 8);
            if (fromTrips.length === 0) return null;
            return (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="text-base">From your trips</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {fromTrips.map((m) => {
                    const trip = tripById.get(m.trip_id!);
                    return (
                      <div key={m.id} className="flex items-baseline justify-between gap-3">
                        <span className="text-sm truncate">
                          <span className="capitalize text-muted-foreground mr-1">{m.mark_type}</span>
                          {m.name}
                        </span>
                        <LocalizedLink
                          to={`/trips/${m.trip_id}`}
                          className="text-xs text-muted-foreground underline truncate flex-shrink-0"
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

          {cityCompletions.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base">Cities</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {cityCompletions.map((c) => (
                  <div key={c.city_id} className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{c.city_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.visited} visited · {c.saved} saved
                        {c.total > 0 && ` · ${c.pct}% of ${c.total}`}
                      </div>
                      {c.total > 0 && (
                        <div className="h-1 mt-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-foreground"
                            style={{ width: `${c.pct}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <Badge variant="outline">{c.pct}%</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {byYear.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By year</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {byYear.map(([year, items]) => (
                  <div key={year} className="flex items-baseline justify-between">
                    <span className="font-semibold">{year}</span>
                    <span className="text-muted-foreground text-sm">
                      {items.length} visited ·{' '}
                      {new Set(items.map((i) => i.city_id).filter(Boolean)).size} cities
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

async function renderRecapImage(
  stats: { venues: number; events: number; cities: number; saved: number },
  year: number,
): Promise<Blob | null> {
  const W = 1200;
  const H = 630;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Canvas2D requires literal color strings — CSS vars can't be used here.
  // Share image is rendered monochrome to match the brand palette.
  /* eslint-disable no-restricted-syntax */
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';

  ctx.font = '600 28px Inter, system-ui, sans-serif';
  ctx.fillText('queer.guide', 64, 84);

  ctx.font = '700 96px Inter, system-ui, sans-serif';
  ctx.fillText(`${year}`, 64, 220);

  ctx.font = '500 44px Inter, system-ui, sans-serif';
  const line = `${stats.venues} venues · ${stats.cities} cities · ${stats.events} events`;
  ctx.fillText(line, 64, 300);

  ctx.font = '400 28px Inter, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('My footprint', 64, 360);

  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(64, H - 96);
  ctx.lineTo(W - 64, H - 96);
  ctx.stroke();

  ctx.font = '400 22px Inter, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('queer.guide/profile/footprint', 64, H - 56);
  /* eslint-enable no-restricted-syntax */

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}
