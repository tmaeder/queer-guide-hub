import { ArrowLeft, ArrowUpRight, Tag } from 'lucide-react';
import { useMeta } from '@/hooks/useMeta';
import { PageHeader } from '@/components/layout/PageHeader';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { useMarketplaceSubcategoryTiles } from '@/hooks/useMarketplaceQueries';

function prettify(slug: string): string {
  return slug.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function MarketplaceCategories() {
  const { data: tiles, loading } = useMarketplaceSubcategoryTiles(null);

  useMeta({
    title: 'All categories — Marketplace',
    description: 'Browse every queer-friendly marketplace category on Queer Guide.',
    canonicalPath: '/marketplace/categories',
  });

  return (
    <div className="min-h-screen">
      <div className="container mx-auto py-12 md:py-20 px-4">
        <div className="mb-4">
          <LocalizedLink to="/marketplace">
            <Button variant="ghost" size="sm">
              <ArrowLeft size={14} className="mr-1.5" />
              All marketplace
            </Button>
          </LocalizedLink>
        </div>
        <PageHeader
          title="All categories"
          subtitle="Every queer-friendly marketplace category, ranked by active listings."
        />

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                aria-hidden="true"
                className="rounded-container border border-border bg-muted/30 min-h-[120px] animate-pulse"
              />
            ))}
          </div>
        ) : tiles.length === 0 ? (
          <p className="text-muted-foreground">No categories yet.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {tiles.map((tile) => (
              <LocalizedLink
                key={tile.slug}
                to={`/marketplace/category/${tile.slug}`}
                className="group relative flex flex-col justify-between rounded-container border border-border bg-card p-4 sm:p-6 min-h-[120px] hover:bg-muted transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <Tag style={{ width: 22, height: 22 }} className="text-foreground" aria-hidden="true" />
                  <ArrowUpRight
                    size={14}
                    className="text-muted-foreground group-hover:text-foreground transition-colors"
                    aria-hidden="true"
                  />
                </div>
                <div className="flex flex-col gap-1 mt-4">
                  <span className="text-sm font-semibold leading-tight text-balance">{prettify(tile.slug)}</span>
                  <span className="text-xs2 uppercase tracking-[0.14em] text-muted-foreground">
                    {tile.count.toLocaleString()} listing{tile.count !== 1 ? 's' : ''}
                  </span>
                </div>
              </LocalizedLink>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
