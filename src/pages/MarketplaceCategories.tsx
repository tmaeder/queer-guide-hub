import { useMeta } from '@/hooks/useMeta';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { MarketplaceMasthead } from '@/components/marketplace/MarketplaceMasthead';
import { useMarketplaceSubcategoryTiles } from '@/hooks/useMarketplaceQueries';
import { PageContainer } from '@/components/layout/PageContainer';

function prettify(slug: string): string {
  return slug.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Every stop on the line, not just the departments the hub shows.
 *
 * Tiles match `MarketplaceLineIndex` exactly — same 3px ink border, same
 * `card-lift-sm`, same `text-title font-bold` name over a `tracking-label`
 * count. They were `rounded-container bg-card hover:bg-muted` cards carrying a
 * lucide `Tag` and an `ArrowUpRight`, which is two icon sets and a radius the
 * design system no longer has. There is no icon now: the category name does
 * the work an ambiguous generic glyph was doing badly, and it was the SAME
 * glyph on every tile, so it distinguished nothing.
 */
export default function MarketplaceCategories() {
  const { data: tiles, loading } = useMarketplaceSubcategoryTiles(null);

  useMeta({
    title: 'All categories — Marketplace',
    description: 'Browse every queer-friendly marketplace category on Queer Guide.',
    canonicalPath: '/marketplace/categories',
  });

  return (
    <div className="min-h-screen">
      <MarketplaceMasthead
        size="page"
        backTo={{ label: 'Marketplace', to: '/marketplace' }}
        eyebrow="Marketplace · Every stop"
        title="All categories."
        lede="Every queer-friendly marketplace category, ranked by active listings."
        count={
          loading
            ? 'Counting…'
            : `${tiles.length.toLocaleString()} categor${tiles.length === 1 ? 'y' : 'ies'}`
        }
      />

      <PageContainer>
        {loading ? (
          <ul className="m-0 grid list-none grid-cols-2 gap-4 p-0 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <li key={i} aria-hidden="true" className="h-[120px] animate-pulse bg-muted" />
            ))}
          </ul>
        ) : tiles.length === 0 ? (
          <p className="text-muted-foreground">
            No categories yet.{' '}
            <LocalizedLink to="/marketplace" className="underline underline-offset-4">
              Browse the marketplace
            </LocalizedLink>
          </p>
        ) : (
          <ul className="m-0 grid list-none grid-cols-2 gap-4 p-0 md:grid-cols-3 lg:grid-cols-4">
            {tiles.map((tile) => (
              <li key={tile.slug}>
                <LocalizedLink
                  to={`/marketplace/category/${tile.slug}`}
                  className="card-lift flex h-full min-h-[120px] flex-col justify-between bg-card p-4 no-underline sm:p-6 shadow-soft"
                >
                  <span className="text-title font-bold leading-tight text-balance">
                    {prettify(tile.slug)}
                  </span>
                  <span className="mt-4 text-2xs uppercase tracking-label tabular-nums text-muted-foreground">
                    {tile.count.toLocaleString()} listing{tile.count !== 1 ? 's' : ''}
                  </span>
                </LocalizedLink>
              </li>
            ))}
          </ul>
        )}
      </PageContainer>
    </div>
  );
}
