import { LocalizedLink } from '@/components/routing/LocalizedLink';
import {
  ArrowUpRight,
  Heart,
  Shirt,
  Sparkles,
  Tag,
  Lock,
  HeartHandshake,
  PartyPopper,
  Stethoscope,
  BookOpen,
  Wrench,
  Image as ImageIcon,
  type LucideIcon,
} from 'lucide-react';
import { useMarketplaceSubcategoryTiles } from '@/hooks/useMarketplaceQueries';

function prettify(slug: string): string {
  return slug
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const SUBCATEGORY_ICONS: Record<string, LucideIcon> = {
  sex_toys: Heart,
  fetish_gear: Lock,
  underwear: Shirt,
  personal_care: Sparkles,
  personal_training: HeartHandshake,
  event_planning: PartyPopper,
  mental_health: Stethoscope,
  books: BookOpen,
  jewelry: Sparkles,
  'jewelry_&_pins': Sparkles,
  'prints_&_posters': ImageIcon,
  services: Wrench,
};

function iconFor(slug: string): LucideIcon {
  const key = slug.toLowerCase().replace(/[\s-]+/g, '_');
  return SUBCATEGORY_ICONS[key] ?? Tag;
}

export function MarketplaceCategoryTiles() {
  const { data: tiles, loading } = useMarketplaceSubcategoryTiles();

  if (!loading && tiles.length === 0) return null;

  return (
    <section aria-labelledby="category-tiles" className="mb-12">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 id="category-tiles" className="text-2xl font-bold tracking-tight">
            Browse by category
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                  className="group relative flex flex-col justify-between rounded-container border border-border bg-card p-4 sm:p-5 min-h-[120px] hover:bg-muted transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Icon style={{ width: 22, height: 22 }} className="text-foreground" aria-hidden="true" />
                    <ArrowUpRight
                      style={{ width: 14, height: 14 }}
                      className="text-muted-foreground group-hover:text-foreground transition-colors"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="flex flex-col gap-1 mt-3">
                    <span className="text-sm font-semibold leading-tight text-balance">{prettify(tile.slug)}</span>
                    <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
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
