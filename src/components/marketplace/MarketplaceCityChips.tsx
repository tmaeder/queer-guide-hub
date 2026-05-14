import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { MapPin } from 'lucide-react';
import { useMarketplaceTopCities } from '@/hooks/useMarketplaceQueries';

export function MarketplaceCityChips() {
  const { data: cities, loading } = useMarketplaceTopCities(10);
  if (loading || cities.length === 0) return null;
  return (
    <section aria-labelledby="city-chips" className="mb-12">
      <div className="mb-4">
        <h2 id="city-chips" className="text-2xl font-bold tracking-tight">
          Shop by city
        </h2>
        <p className="text-sm text-muted-foreground mt-1">Local makers and merchants.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {cities.map((c) =>
          c.slug ? (
            <LocalizedLink
              key={c.name}
              to={`/cities/${c.slug}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted transition-colors"
            >
              <MapPin style={{ width: 12, height: 12 }} aria-hidden="true" />
              <span>{c.name}</span>
              <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                {c.count}
              </span>
            </LocalizedLink>
          ) : (
            <span
              key={c.name}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground"
            >
              <MapPin style={{ width: 12, height: 12 }} aria-hidden="true" />
              {c.name}
              <span className="text-[11px] uppercase tracking-[0.14em]">{c.count}</span>
            </span>
          ),
        )}
      </div>
    </section>
  );
}
