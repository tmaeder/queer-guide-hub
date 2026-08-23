import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Badge } from '@/components/ui/badge';
import { COMMUNITY_OWNED_OPTIONS } from './marketplaceFilterOptions';
import { BrandMark } from './BrandMark';
import type { DirectoryBrand } from '@/hooks/useMarketplaceBrands';

const OWNERSHIP_LABEL = new Map(COMMUNITY_OWNED_OPTIONS.map((o) => [o.value, o.label]));

/**
 * One maker in the directory grid.
 *
 * The logo sits in its own bordered square rather than floating on the card:
 * brand logos arrive from merchant feeds at wildly different aspect ratios and
 * on assorted background colours, and a plate is the only thing that makes a
 * row of them scan as one grid. A brand with no logo gets a monogram in the
 * same square — never a placeholder image, which would read as a broken load.
 *
 * The link is an absolute overlay SIBLING of the content, not a wrapper: the
 * ownership badges sit inside this card, and an `<a>` around them is
 * `nested-interactive` (axe serious, WCAG 4.1.2). `no-underline` is required or
 * the global `li a` rule gives the overlay `position: relative` and collapses
 * it to nothing.
 */
export function BrandPlate({ brand }: { brand: DirectoryBrand }) {
  const tags = (brand.ownership_tags ?? []).filter((t) => OWNERSHIP_LABEL.has(t));
  const count = brand.product_count ?? 0;

  return (
    <div className="card-lift group relative flex h-full flex-col gap-4 bg-card p-4 shadow-soft">
      <div className="flex items-start gap-4">
        <BrandMark
          name={brand.display_name}
          logoUrl={brand.logo_url}
          onInk={brand.logo_on_ink ?? false}
          className="h-14 w-14 rounded-container"
          /* The monogram is `text-title font-bold`, not the display face: rank 4
             is Space Grotesk and `rankFourFace.test.ts` scans for the pairing.
             The 80px plate on the maker page is rank 3, where Anton is legal. */
          monogramClassName="text-title font-bold"
        />
        <div className="min-w-0 flex-1">
          <p className="text-title font-bold leading-tight text-balance">{brand.display_name}</p>
          <p className="mt-0.5 text-2xs uppercase tracking-label tabular-nums text-muted-foreground">
            {count.toLocaleString()} listing{count !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {brand.story && (
        <p className="line-clamp-2 text-13 leading-relaxed text-muted-foreground">{brand.story}</p>
      )}

      {tags.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <Badge key={t} variant="soft">
              {OWNERSHIP_LABEL.get(t)}
            </Badge>
          ))}
        </div>
      )}

      <LocalizedLink
        to={`/marketplace/brands/${brand.slug}`}
        aria-label={brand.display_name}
        className="absolute inset-0 no-underline"
      />
    </div>
  );
}
