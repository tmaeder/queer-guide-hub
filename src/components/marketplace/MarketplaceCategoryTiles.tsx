import { LocalizedLink } from '@/components/routing/LocalizedLink';
import {
  ArrowUpRight,
  Heart,
  Shirt,
  Sparkles,
  Tag,
  Lock,
  Droplets,
  BookOpen,
  Wrench,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import { useMarketplaceSubcategoryTiles } from '@/hooks/useMarketplaceQueries';
import { DEPARTMENT_ORDER, departmentLabel, departmentOf } from '@/lib/marketplaceTaxonomy';

// Tiles are the department umbrellas (not the 16 fine buckets) so the default
// browse isn't dominated by the three adult toy categories — SFW departments
// lead, intimacy/bdsm_fetish sit last in DEPARTMENT_ORDER.
const DEPARTMENT_ICONS: Record<string, LucideIcon> = {
  apparel: Shirt,
  underwear: Shirt,
  swimwear: Waves,
  jewelry: Sparkles,
  books_art: BookOpen,
  hygiene: Droplets,
  intimacy: Heart,
  bdsm_fetish: Lock,
  services: Wrench,
};

function iconFor(slug: string): LucideIcon {
  return DEPARTMENT_ICONS[slug] ?? Tag;
}

export function MarketplaceCategoryTiles() {
  const { data: subcats, loading } = useMarketplaceSubcategoryTiles(null);

  const counts = new Map<string, number>();
  for (const t of subcats) {
    const d = departmentOf(t.slug);
    counts.set(d, (counts.get(d) ?? 0) + t.count);
  }
  const tiles = DEPARTMENT_ORDER
    .filter((d) => d !== 'other' && (counts.get(d) ?? 0) > 0)
    .map((d) => ({ slug: d, count: counts.get(d) ?? 0 }));

  if (!loading && tiles.length === 0) return null;

  return (
    <section aria-labelledby="category-tiles" className="mb-12">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 id="category-tiles" className="text-2xl font-bold tracking-tight">
            Browse by department
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Jump straight to what you're looking for.</p>
        </div>
        <LocalizedLink
          to="/marketplace/categories"
          className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 hidden md:inline"
        >
          See all categories
        </LocalizedLink>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                aria-hidden="true"
                className="rounded-container border border-border bg-muted/30 min-h-[120px] animate-pulse"
              />
            ))
          : tiles.map((tile) => {
              const Icon = iconFor(tile.slug);
              return (
                <LocalizedLink
                  key={tile.slug}
                  to={`/marketplace/category/${tile.slug}`}
                  className="group relative flex flex-col justify-between rounded-container border border-border bg-card p-4 sm:p-6 min-h-[120px] hover:bg-muted transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Icon style={{ width: 22, height: 22 }} className="text-foreground" aria-hidden="true" />
                    <ArrowUpRight size={14}
                      className="text-muted-foreground group-hover:text-foreground transition-colors"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="flex flex-col gap-1 mt-4">
                    <span className="text-sm font-semibold leading-tight text-balance">{departmentLabel(tile.slug)}</span>
                    <span className="text-xs2 uppercase tracking-[0.14em] text-muted-foreground">
                      {tile.count.toLocaleString()} listing{tile.count !== 1 ? 's' : ''}
                    </span>
                  </div>
                </LocalizedLink>
              );
            })}
      </div>
    </section>
  );
}
