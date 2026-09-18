import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Badge } from '@/components/ui/badge';
import { COMMUNITY_OWNED_OPTIONS } from './marketplaceFilterOptions';
import { BrandMark } from './BrandMark';
import type { DirectoryBrand } from '@/hooks/useMarketplaceBrands';

const OWNERSHIP_LABEL = new Map(COMMUNITY_OWNED_OPTIONS.map((o) => [o.value, o.label]));

/**
 * One maker in the directory's long tail — a ruled index row, not a card.
 *
 * 885 brands will not read as a grid of cards, and the measurements say why:
 * only 118 have a logo and 24 have any prose, so a card grid at that scale is
 * ~850 near-identical boxes of white space that a reader has to scan
 * two-dimensionally. A ruled list is the shape a catalogue index has always
 * had — one column, a fixed rhythm, the eye running down the names and the
 * counts in their own aligned column — and it fits four times as many makers on
 * a screen. The head of the catalogue gets the imagery instead (`BrandPlate`).
 *
 * The name is `text-title font-bold` (Space Grotesk) and NOT the display face.
 * Rank 4 must stay Space Grotesk and `rankFourFace.test.ts` scans for the
 * pairing; Anton is legal from rank 3, which is what the letter headings above
 * these rows use.
 *
 * Hover tints, and deliberately does not lift: `.card-lift` translates its
 * subject by 3px, which on a ruled list would break the rules either side of
 * the row the reader is pointing at. A row is not a card.
 *
 * The link is an absolute overlay SIBLING, for the same reason it is on
 * `BrandPlate`: the ownership badges live inside this row, and an `<a>` wrapped
 * around them is `nested-interactive` (axe serious, WCAG 4.1.2). `no-underline`
 * is load-bearing — without it the global `li a` rule gives the overlay
 * `position: relative` and collapses it to nothing.
 */
export function BrandIndexRow({ brand }: { brand: DirectoryBrand }) {
  const tags = (brand.ownership_tags ?? []).filter((t) => OWNERSHIP_LABEL.has(t));
  const count = brand.product_count ?? 0;

  return (
    <div className="group relative -mx-2 flex items-center gap-4 border-b border-border-hairline px-2 py-2 transition-colors duration-fast hover:bg-surface-container-low">
      <BrandMark
        name={brand.display_name}
        logoUrl={brand.logo_url}
        onInk={brand.logo_on_ink ?? false}
        className="h-10 w-10 rounded-element"
        monogramClassName="text-13 font-bold"
        padding="p-1"
      />

      <span className="min-w-0 flex-1 truncate text-title font-bold leading-tight">
        {brand.display_name}
      </span>

      {tags.length > 0 && (
        <span className="hidden shrink-0 flex-wrap gap-1.5 sm:flex">
          {tags.map((t) => (
            <Badge key={t} variant="soft">
              {OWNERSHIP_LABEL.get(t)}
            </Badge>
          ))}
        </span>
      )}

      <span className="shrink-0 text-13 tabular-nums text-muted-foreground">
        {count.toLocaleString()}
        {/* The column header is implied by alignment, which a screen reader
            cannot see — so each figure carries its own unit. */}
        <span className="sr-only"> listings</span>
      </span>

      <LocalizedLink
        to={`/marketplace/brands/${brand.slug}`}
        aria-label={brand.display_name}
        className="absolute inset-0 no-underline"
      />
    </div>
  );
}
