import { ArrowRight } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import {
  useLocalSupporterCities,
  type LocalSupporterCity,
} from '@/hooks/useLocalSupporter';

const TIER_DESCRIPTION: Record<LocalSupporterCity['tier'], string> = {
  Visitor: 'Start saving queer-owned spots here.',
  Local: "You're showing up — keep going.",
  'Local Supporter': 'Real support, consistently.',
  Champion: 'Top-tier local advocate.',
};

function CityRow({ city }: { city: LocalSupporterCity }) {
  return (
    <li className="border-t border-border first:border-t-0 py-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-title leading-tight">{city.city_name}</p>
        <p className="text-13 uppercase tracking-[0.1em] text-muted-foreground mt-1">
          {city.tier} · {TIER_DESCRIPTION[city.tier]}
        </p>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <span className="font-mono text-display tabular-nums">{city.score}</span>
        <LocalizedLink
          to={`/cities/${encodeURIComponent(city.city_name.toLowerCase().replace(/\s+/g, '-'))}`}
          className="inline-flex items-center gap-1 text-13 text-muted-foreground hover:text-foreground"
        >
          City
          <ArrowRight size={14} aria-hidden />
        </LocalizedLink>
      </div>
    </li>
  );
}

/** Per-city Local Supporter score. Moved from MarketplaceMissions. */
export function LocalSupporterBlock() {
  const { data: cities = [], isLoading } = useLocalSupporterCities();
  return (
    <section className="rounded-container border border-border p-6 bg-card">
      <header className="flex items-center justify-between gap-4 mb-2">
        <p className="text-13 uppercase tracking-[0.1em] text-muted-foreground">
          Local Supporter
        </p>
        <p className="text-2xs uppercase tracking-[0.1em] text-muted-foreground">
          0 — 100 per city
        </p>
      </header>
      <p className="text-13 text-muted-foreground mb-4">
        +5 per saved queer-owned spot · +10 per review · +2 per completed guide pick
        in that city. Decays −1/week for inactivity.
      </p>
      {isLoading ? (
        <p className="text-13 text-muted-foreground">Loading…</p>
      ) : cities.length === 0 ? (
        <p className="text-13 text-muted-foreground">
          No city activity yet. Save a queer-owned venue or finish a city-scoped
          guide to start a score.
        </p>
      ) : (
        <ul>
          {cities
            .slice()
            .sort((a, b) => b.score - a.score)
            .map((c) => (
              <CityRow key={c.city_id} city={c} />
            ))}
        </ul>
      )}
    </section>
  );
}
