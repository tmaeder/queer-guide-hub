import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Image } from '@/components/ui/Image';
import { Badge } from '@/components/ui/badge';
import { COMMUNITY_OWNED_OPTIONS } from './marketplaceFilterOptions';
import { BrandMark } from './BrandMark';
import type { DirectoryBrand } from '@/hooks/useMarketplaceBrands';

const OWNERSHIP_LABEL = new Map(COMMUNITY_OWNED_OPTIONS.map((o) => [o.value, o.label]));

/**
 * One maker in the gallery — a single product photograph and a mark.
 *
 * The directory's long tail used to be text only, for a good reason: a card
 * grid over the whole catalogue is ~850 near-identical boxes of white space,
 * because only 118 makers have a logo and 24 have any prose. `BrandIndexRow`
 * still exists and is still correct for that data.
 *
 * What changed is that the data layer can now answer a question it could not
 * before — `get_marketplace_brand_directory` returns ONE SFW cover per maker —
 * and measured, 657 of 871 makers have one. So the tail is no longer uniformly
 * prose-shaped: two thirds of it has a photograph, which is the signal a
 * gallery is built on. The 214 that do not are NOT given a tile with a hole in
 * it; they stay in the index. The page picks the form per maker.
 *
 * Deliberately NOT `BrandPlate`. That tile carries THREE covers and requires a
 * logo, which is what makes the highlight band read as a band — and only 94
 * makers can fill it. Reusing it here would have silently cut the gallery from
 * 657 makers to 94 while looking like a styling decision.
 *
 * The cover is `aspect-square` rather than the product's own ratio: a grid of
 * mixed ratios has a ragged baseline, and the mark that sits beneath each
 * cover would stop lining up across a row.
 *
 * The link is an absolute overlay SIBLING of the content, never a wrapper —
 * the ownership badges sit inside this tile, and an `<a>` around them is
 * `nested-interactive` (axe serious, WCAG 4.1.2). `no-underline` is
 * load-bearing: without it the global `li a` rule gives the overlay
 * `position: relative` and collapses it to nothing.
 */
export function BrandGalleryTile({ brand }: { brand: DirectoryBrand }) {
  const tags = (brand.ownership_tags ?? []).filter((t) => OWNERSHIP_LABEL.has(t));
  const count = brand.product_count ?? 0;

  return (
    <div className="card-lift group relative flex h-full flex-col overflow-hidden bg-card shadow-soft rounded-container">
      <div className="bg-surface-container">
        <Image
          imageUrl={brand.cover_url}
          thumbnailUrl={brand.cover_thumb}
          preferThumb
          // Decorative: the tile is labelled by the maker's name below it and
          // by the overlay link's aria-label. A product title read out here
          // would bury the name the reader is actually scanning for.
          alt=""
          aspect="square"
          rounded="none"
          fit="cover"
          imageRole="thumb"
          // A tile is at most ~240px wide at the widest breakpoint; the default
          // `thumb` sizes assume a card-width image and over-fetch roughly 2x
          // — across 120 tiles that is the difference between a page and a
          // download.
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px"
          // NEVER `priority`. The 8s stall guard inside <Image> is armed only
          // for priority images, so a still-offscreen tile could be
          // force-failed into the fallback texture while it waits its turn.
          fallbackEntityType="marketplace"
          fallbackKey={brand.slug}
        />
      </div>

      <div className="flex flex-1 items-start gap-4 p-4">
        <BrandMark
          name={brand.display_name}
          logoUrl={brand.logo_url}
          onInk={brand.logo_on_ink ?? false}
          // Punched up through the cover's bottom edge. The plate is opaque,
          // so it reads as cut into the photograph rather than laid on top.
          className="-mt-8 h-11 w-11 rounded-element"
          /* Rank 4 is Space Grotesk, never the display face —
             `rankFourFace.test.ts` scans for the pairing. */
          monogramClassName="text-13 font-bold"
          padding="p-1"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-15 font-bold leading-tight">{brand.display_name}</p>
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
