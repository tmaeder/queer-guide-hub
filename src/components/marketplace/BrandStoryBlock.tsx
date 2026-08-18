import { Badge } from '@/components/ui/badge';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { NestedEntityCard } from '@/components/transit/NestedEntityCard';
import { useMarketplaceBrand } from '@/hooks/useMarketplaceBrands';
import { brandSlug } from '@/lib/marketplaceTaxonomy';
import type { Database } from '@/integrations/supabase/types';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];

const OWNERSHIP_LABELS: Record<string, string> = {
  queer_owned: 'Queer-owned',
  trans_owned: 'Trans-owned',
  bipoc_owned: 'BIPOC-owned',
  women_owned: 'Women-owned',
  disabled_owned: 'Disabled-owned',
  nonprofit: 'Non-profit',
};

/**
 * Module 08 — the nested entity. The spec's own example for this module is
 * "the maker on a listing", so it is REQUIRED on the marketplace single.
 *
 * It used to render only when the brand had a `story`, which meant the module
 * was absent from most listings: the maker appeared nowhere in the content
 * column, only as small type in the card meta line. Rule 2 ("a module with no
 * data does not render") does not apply there — a brand row with a name, a
 * product count and a page IS the data. So the story is now the RICH form and
 * NestedEntityCard is the floor, which is also what makes rule 4 hold on this
 * page: a cross-type link carries the other type's bullet and colour.
 *
 * Both forms still require an approved `marketplace_brands` row. `listing.brand`
 * is free text and its slug may resolve to no brand page at all, so rendering
 * from it would manufacture a dead link.
 */
export function BrandStoryBlock({ listing }: { listing: MarketplaceListing }) {
  const slug = brandSlug(listing.brand);
  const { data: brand } = useMarketplaceBrand(slug ?? undefined);

  if (!brand) return null;

  const ownership = (brand.ownership_tags ?? []).filter((t) => OWNERSHIP_LABELS[t]);

  if (!brand.story) {
    return (
      <NestedEntityCard
        type="marketplace"
        eyebrow="About the brand"
        name={brand.display_name}
        description={
          brand.product_count
            ? `${brand.product_count.toLocaleString()} product${brand.product_count !== 1 ? 's' : ''}`
            : null
        }
        href={brand.slug ? `/marketplace/brands/${brand.slug}` : undefined}
        actionLabel="Visit brand page"
      />
    );
  }

  return (
    <section aria-labelledby="brand-story" className="bg-muted rounded-container p-8 lg:p-12">
      <div className="max-w-prose">
        <p className="mb-4 text-2xs font-bold uppercase tracking-label text-muted-foreground">
          About the brand
        </p>
        {/* Monogram fallback: ink border, and Space Grotesk at rank 4 — #2744
            unified `text-title` on font-bold, so Anton stops at rank 3. */}
        <div className="mb-4 flex items-center gap-4">
          {brand.logo_url ? (
            <img
              src={brand.logo_url}
              alt=""
              className="h-10 w-10 bg-card object-contain p-1 rounded-container shadow-soft"
            />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center bg-surface-container text-title font-bold">
              {brand.display_name.charAt(0).toUpperCase()}
            </span>
          )}
          <h2 id="brand-story" className="font-display text-headline tracking-tight">
            {brand.display_name}
          </h2>
        </div>
        {ownership.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {ownership.map((t) => (
              // `soft`, never a track colour: ownership is an attribute, and
              // track colours are wayfinding, never a state.
              <Badge key={t} variant="soft">
                {OWNERSHIP_LABELS[t]}
              </Badge>
            ))}
          </div>
        )}
        <p className="text-sm leading-relaxed text-muted-foreground">{brand.story}</p>
        <LocalizedLink
          to={`/marketplace/brands/${brand.slug}`}
          className="mt-6 inline-flex items-center gap-2 text-sm font-bold underline underline-offset-4 hover:no-underline"
        >
          Visit brand page →
        </LocalizedLink>
      </div>
    </section>
  );
}
