import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { ArrowUpRight } from 'lucide-react';
import { useMarketplaceSubcategoryTiles } from '@/hooks/useMarketplaceQueries';

function prettify(slug: string): string {
  return slug
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function MarketplaceCategoryTiles() {
  const { data: tiles, loading } = useMarketplaceSubcategoryTiles();

  if (!loading && tiles.length === 0) return null;

  return (
    <section aria-labelledby="category-tiles" className="mb-12">
      <div className="mb-4">
        <h2 id="category-tiles" className="text-2xl font-bold tracking-tight">
          Browse by category
        </h2>
        <p className="text-sm text-muted-foreground mt-1">Jump straight to what you're looking for.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                aria-hidden="true"
                className="rounded-2xl border border-border bg-muted/30 min-h-[120px] animate-pulse"
              />
            ))
          : tiles.map((tile) => (
              <LocalizedLink
                key={tile.slug}
                to={`/marketplace/category/${tile.slug}`}
                className="group relative flex flex-col justify-between rounded-2xl border border-border bg-card p-4 sm:p-5 min-h-[120px] hover:bg-muted transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold leading-tight text-balance">{prettify(tile.slug)}</span>
                  <ArrowUpRight
                    style={{ width: 14, height: 14 }}
                    className="text-muted-foreground group-hover:text-foreground transition-colors"
                    aria-hidden="true"
                  />
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    {tile.count} listing{tile.count !== 1 ? 's' : ''}
                  </span>
                </div>
              </LocalizedLink>
            ))}
      </div>
    </section>
  );
}
