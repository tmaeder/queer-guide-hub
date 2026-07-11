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
import { Image } from '@/components/ui/Image';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { useDepartmentCovers, useMarketplaceDepartmentCounts } from '@/hooks/useMarketplaceQueries';
import { useAdultAcknowledgement } from '@/hooks/useAdultContent';
import { ADULT_DEPARTMENTS, DEPARTMENT_ORDER, departmentLabel } from '@/lib/marketplaceTaxonomy';

// Umbrella departments, SFW-first (intimacy/bdsm_fetish sit last in
// DEPARTMENT_ORDER) — same ordering contract as the old uniform tiles.
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

/**
 * Asymmetric department bento: the two strongest departments lead as
 * tall image tiles, the rest follow as compact icon tiles. Breaks the
 * uniform 8-tile grid without leaving the 8pt rhythm.
 */
export function DepartmentBento() {
  // Count what the visitor will actually see: gated to their 18+ state, so a tile's
  // number always matches the grid it opens. Adult-only departments stay hidden until
  // the visitor has opted in (their category pages are age-gated anyway).
  const { acknowledged } = useAdultAcknowledgement();
  const { data: departments, loading } = useMarketplaceDepartmentCounts(acknowledged);
  const { data: covers } = useDepartmentCovers();

  const counts = new Map(departments.map((d) => [d.slug, d.count]));
  const tiles = DEPARTMENT_ORDER
    .filter((d) => d !== 'other' && (counts.get(d) ?? 0) > 0)
    .filter((d) => acknowledged || !ADULT_DEPARTMENTS.has(d))
    .map((d) => ({ slug: d, count: counts.get(d) ?? 0 }));

  if (!loading && tiles.length === 0) return null;

  // The two leading departments that have a cover image become feature tiles.
  const featured: typeof tiles = [];
  const compact: typeof tiles = [];
  for (const tile of tiles) {
    if (featured.length < 2 && covers.get(tile.slug)) featured.push(tile);
    else compact.push(tile);
  }

  return (
    <section aria-labelledby="category-tiles" className="mb-16 lg:mb-24">
      <SectionHeader
        id="category-tiles"
        eyebrow="Browse"
        title="Departments"
        seeAllHref="/marketplace/categories"
        seeAllLabel="See all categories"
      />
      {loading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              aria-hidden="true"
              className={`min-h-[120px] animate-pulse rounded-container border border-border bg-muted/30 ${
                i < 2 ? 'md:col-span-3 md:min-h-[280px]' : 'md:col-span-2'
              }`}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
          {featured.map((tile) => {
            const cover = covers.get(tile.slug)!;
            return (
              <LocalizedLink
                key={tile.slug}
                to={`/marketplace/category/${tile.slug}`}
                className="group col-span-2 flex flex-col rounded-container border border-border bg-card p-2 transition-colors hover:bg-muted md:col-span-3"
              >
                <div className="overflow-hidden rounded-element bg-muted">
                  <Image src={cover} alt="" aspect="card" rounded="element" />
                </div>
                <div className="flex items-end justify-between gap-2 p-4">
                  <div className="flex flex-col gap-1">
                    <span className="font-display text-title leading-tight">
                      {departmentLabel(tile.slug)}
                    </span>
                    <span className="text-xs2 uppercase tracking-[0.14em] text-muted-foreground">
                      {tile.count.toLocaleString()} listing{tile.count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <ArrowUpRight
                    size={16}
                    className="mb-1 text-muted-foreground transition-colors group-hover:text-foreground"
                    aria-hidden="true"
                  />
                </div>
              </LocalizedLink>
            );
          })}
          {compact.map((tile) => {
            const Icon = iconFor(tile.slug);
            return (
              <LocalizedLink
                key={tile.slug}
                to={`/marketplace/category/${tile.slug}`}
                className="group relative flex min-h-[120px] flex-col justify-between rounded-container border border-border bg-card p-4 transition-colors hover:bg-muted md:col-span-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <Icon style={{ width: 22, height: 22 }} className="text-foreground" aria-hidden="true" />
                  <ArrowUpRight
                    size={14}
                    className="text-muted-foreground transition-colors group-hover:text-foreground"
                    aria-hidden="true"
                  />
                </div>
                <div className="mt-4 flex flex-col gap-1">
                  <span className="text-sm font-semibold leading-tight text-balance">
                    {departmentLabel(tile.slug)}
                  </span>
                  <span className="text-xs2 uppercase tracking-[0.14em] text-muted-foreground">
                    {tile.count.toLocaleString()} listing{tile.count !== 1 ? 's' : ''}
                  </span>
                </div>
              </LocalizedLink>
            );
          })}
        </div>
      )}
    </section>
  );
}
