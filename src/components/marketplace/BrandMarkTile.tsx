import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Badge } from '@/components/ui/badge';
import { COMMUNITY_OWNED_OPTIONS } from './marketplaceFilterOptions';
import { BrandMark } from './BrandMark';
import type { DirectoryBrand } from '@/hooks/useMarketplaceBrands';

const OWNERSHIP_LABEL = new Map(COMMUNITY_OWNED_OPTIONS.map((o) => [o.value, o.label]));

/**
 * One maker in the gallery's ADULT section — the mark, not a photograph.
 *
 * Why this exists. The directory picks one cover per maker, and only from
 * listings rated `sfw` or `suggestive`, because `/marketplace/brands` is an
 * ungated page. Measured on prod (2026-10-31): of the 259 makers that come back
 * with no cover, **259 have adult/explicit listings and 253 list nothing
 * else**. They were never "makers we have no photograph of" — we hold their
 * photographs and deliberately keep them off this page. The section that used
 * to say otherwise was wrong about the data, and a reader could not make sense
 * of it, because it described our pipeline instead of the makers.
 *
 * So the section is named for what it is, and each maker gets a tile in the
 * gallery's visual language — same card, radius and name/count line —
 * but compact: mark beside name, no empty photo well. A well sized for a
 * photograph holding a 56px logo is mostly blank paper (tried on the first cut
 * and it read as broken), so these tiles are short and sit up to four across.
 *
 * Deliberately no per-tile "Adult" badge: the section header says it once, and
 * a badge repeated on every tile is noise that crowds out the name.
 *
 * The link is an absolute overlay SIBLING (ownership badges sit inside the
 * tile; an `<a>` around them is `nested-interactive`). `no-underline` is
 * load-bearing — the global `li a` rule would otherwise collapse the overlay.
 */
export function BrandMarkTile({ brand }: { brand: DirectoryBrand }) {
  const tags = (brand.ownership_tags ?? []).filter((t) => OWNERSHIP_LABEL.has(t));
  const count = brand.product_count ?? 0;

  return (
    <div className="card-lift group relative flex h-full flex-col bg-card shadow-soft rounded-container">
      <div className="flex min-w-0 flex-1 items-center gap-4 p-4">
        <BrandMark
          name={brand.display_name}
          logoUrl={brand.logo_url}
          onInk={brand.logo_on_ink ?? false}
          className="h-14 w-14 rounded-element"
          /* Rank 4 is Space Grotesk, never the display face —
             `rankFourFace.test.ts` scans for the pairing. */
          monogramClassName="text-15 font-bold"
          padding="p-1.5"
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
