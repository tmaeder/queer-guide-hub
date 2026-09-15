import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Image } from '@/components/ui/Image';
import { Badge } from '@/components/ui/badge';
import { COMMUNITY_OWNED_OPTIONS } from './marketplaceFilterOptions';
import { BrandMark } from './BrandMark';
import type { BrandWithCovers } from '@/hooks/useMarketplaceBrands';

const OWNERSHIP_LABEL = new Map(COMMUNITY_OWNED_OPTIONS.map((o) => [o.value, o.label]));

/**
 * One maker at the head of the directory — the page's only image-bearing tile.
 *
 * This used to be the tile for ALL 885 makers, and it was built around prose:
 * a mark, a name, a count and a two-line `story`. Measured on prod, `story` is
 * present on 24 brands and `ownership_tags` on 37, so 97% of the grid was a
 * 56px square and two lines of text inside a card stretched by `h-full` to
 * match whichever rare sibling in its row had a paragraph. That dead air was
 * the page's whole visual problem, and no amount of restyling fixes a card
 * shaped for data that does not exist.
 *
 * So the layout is now built on the signal the catalogue actually has: its
 * goods. Three SFW product covers run edge to edge across the top, and the
 * maker's mark punches up through the strip's bottom edge, which is what keeps
 * a row of logos reading as one grid even though the photographs behind them
 * are all different colours. The long tail of the catalogue is served by
 * `BrandIndexRow` instead — a ruled index row, no images, no prose-shaped hole.
 *
 * The strip is `bg-surface-container` behind a `gap-0.5` grid, so the seams
 * between covers are a ruled line rather than a gap onto paper, and a cover
 * that fails to load leaves a tone rather than a hole.
 *
 * The link is an absolute overlay SIBLING of the content, not a wrapper: the
 * ownership badges sit inside this card, and an `<a>` around them is
 * `nested-interactive` (axe serious, WCAG 4.1.2). `no-underline` is required or
 * the global `li a` rule gives the overlay `position: relative` and collapses
 * it to nothing.
 */
export function BrandPlate({ brand }: { brand: BrandWithCovers }) {
  const tags = (brand.ownership_tags ?? []).filter((t) => OWNERSHIP_LABEL.has(t));
  const count = brand.product_count ?? 0;
  const covers = brand.covers.slice(0, 3);

  return (
    <div className="card-lift group relative flex h-full flex-col overflow-hidden bg-card shadow-soft rounded-container">
      {covers.length > 0 && (
        <div aria-hidden="true" className="grid grid-cols-3 gap-0.5 bg-surface-container">
          {covers.map((cover, i) => (
            <Image
              key={`${cover.url}-${i}`}
              imageUrl={cover.url}
              thumbnailUrl={cover.thumb}
              preferThumb
              // Decorative: the tile is already labelled by the maker's name and
              // the overlay link's aria-label, and three product titles read out
              // before it would bury that.
              alt=""
              aspect="square"
              rounded="none"
              fit="cover"
              imageRole="thumb"
              // The default `thumb` sizes assume a card-width image; each of
              // these is a third of a tile that is at most ~380px wide, so the
              // default over-fetches by roughly 2x.
              sizes="(max-width: 640px) 33vw, 120px"
              // NEVER `priority` here. The 8s stall guard inside <Image> is
              // armed only for priority images, so a still-offscreen cover
              // could be force-failed into the fallback texture while it waits.
              fallbackEntityType="marketplace"
              fallbackKey={`${brand.slug}-${i}`}
            />
          ))}
        </div>
      )}

      <div className="flex flex-1 items-start gap-4 p-4">
        <BrandMark
          name={brand.display_name}
          logoUrl={brand.logo_url}
          onInk={brand.logo_on_ink ?? false}
          // Pulled up through the strip's bottom edge. The plate is opaque, so
          // it reads as punched through rather than laid on top.
          className={`h-14 w-14 rounded-container ${covers.length > 0 ? '-mt-10' : ''}`}
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

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-4">
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
