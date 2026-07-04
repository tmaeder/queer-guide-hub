import { Badge } from '@/components/ui/badge';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
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
 * Quiet brand-story band on the listing detail page. Renders only when
 * the listing's brand has an approved row with a story.
 */
export function BrandStoryBlock({ listing }: { listing: MarketplaceListing }) {
  const slug = brandSlug(listing.brand);
  const { data: brand } = useMarketplaceBrand(slug ?? undefined);

  if (!brand || !brand.story) return null;

  const ownership = (brand.ownership_tags ?? []).filter((t) => OWNERSHIP_LABELS[t]);

  return (
    <section
      aria-labelledby="brand-story"
      className="rounded-container bg-muted p-8 lg:p-12"
    >
      <div className="max-w-prose">
        <p className="mb-4 text-2xs uppercase tracking-wider text-muted-foreground">
          About the brand
        </p>
        <div className="mb-4 flex items-center gap-4">
          {brand.logo_url ? (
            <img
              src={brand.logo_url}
              alt=""
              className="h-10 w-10 rounded-element border border-border bg-background object-contain p-1"
            />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-element border border-border bg-background font-display text-title">
              {brand.display_name.charAt(0).toUpperCase()}
            </span>
          )}
          <h2 id="brand-story" className="font-display text-headline tracking-tight">
            {brand.display_name}
          </h2>
        </div>
        {ownership.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {ownership.map((t) => (
              <Badge key={t} variant="outline">
                {OWNERSHIP_LABELS[t]}
              </Badge>
            ))}
          </div>
        )}
        <p className="text-sm leading-relaxed text-muted-foreground">{brand.story}</p>
        <LocalizedLink
          to={`/marketplace/brands/${brand.slug}`}
          className="mt-6 inline-flex items-center gap-2 text-sm font-medium underline underline-offset-4 hover:no-underline"
        >
          Visit brand page →
        </LocalizedLink>
      </div>
    </section>
  );
}
