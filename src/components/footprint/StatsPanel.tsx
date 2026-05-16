import { Card, CardContent } from '@/components/ui/card';
import type { FootprintStats } from './deriveBadges';

interface Props {
  stats: FootprintStats;
  visible?: {
    countries?: boolean;
    cities?: boolean;
    venues?: boolean;
    events?: boolean;
    villages?: boolean;
    continents?: boolean;
    pride?: boolean;
  };
}

export function StatsPanel({ stats, visible }: Props) {
  const v = {
    countries: visible?.countries ?? true,
    cities: visible?.cities ?? true,
    venues: visible?.venues ?? true,
    events: visible?.events ?? true,
    villages: visible?.villages ?? true,
    continents: visible?.continents ?? true,
    pride: visible?.pride ?? true,
  };
  const tiles: Array<{ key: string; label: string; value: string }> = [];
  if (v.countries)
    tiles.push({
      key: 'countries',
      label: 'Countries visited',
      value:
        stats.total_countries > 0
          ? `${stats.countries_visited} / ${stats.total_countries}`
          : `${stats.countries_visited}`,
    });
  if (v.cities) tiles.push({ key: 'cities', label: 'Cities visited', value: `${stats.cities_visited}` });
  if (v.venues) tiles.push({ key: 'venues', label: 'Venues visited', value: `${stats.venues_visited}` });
  if (v.events) tiles.push({ key: 'events', label: 'Events attended', value: `${stats.events_visited}` });
  if (v.villages)
    tiles.push({ key: 'villages', label: 'Queer villages visited', value: `${stats.villages_visited}` });
  if (v.continents)
    tiles.push({ key: 'continents', label: 'Continents touched', value: `${stats.continents_touched}` });
  if (v.pride) tiles.push({ key: 'pride', label: 'Pride events', value: `${stats.pride_events}` });

  if (tiles.length === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="footprint-stats">
      {tiles.map((t) => (
        <Card key={t.key}>
          <CardContent className="py-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{t.label}</div>
            <div className="text-2xl font-semibold mt-1">{t.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
