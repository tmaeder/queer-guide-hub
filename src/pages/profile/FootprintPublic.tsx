import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Loader2 } from 'lucide-react';
import { useMeta } from '@/hooks/useMeta';
import { untypedSupabase } from '@/integrations/supabase/untyped';
import { StatsPanel } from '@/components/footprint/StatsPanel';
import type { FootprintStats } from '@/components/footprint/deriveBadges';

interface PublicRow extends FootprintStats {
  share_countries: boolean;
  share_cities: boolean;
  share_venues: boolean;
  share_events: boolean;
  share_villages: boolean;
}

export default function FootprintPublic() {
  const { userId } = useParams<{ userId: string }>();
  const [row, setRow] = useState<PublicRow | null>(null);
  const [loading, setLoading] = useState(true);
  useMeta({ title: 'Public footprint — queer.guide', noIndex: true });

  useEffect(() => {
    if (!userId) return;
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
      <div className="py-20 flex justify-center">
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
    return (
      <div className="container mx-auto py-16 px-4 text-center">
        <h1 className="text-2xl font-semibold mb-2">Footprint</h1>
        <p className="text-muted-foreground">This footprint is private.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Public footprint</h1>
      </header>
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
    </div>
  );
}
