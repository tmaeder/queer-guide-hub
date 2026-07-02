import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Badge } from '@/components/ui/badge';
import { useSpotlightBrands, type SpotlightBrand } from '@/hooks/useMarketplaceBrands';

/**
 * Monochrome brand tile — monogram (no fake imagery until logos are
 * enriched), name, ownership badge, product count.
 */
function BrandCard({ brand }: { brand: SpotlightBrand }) {
  const queerOwned = brand.ownership_tags.some((t) => t === 'queer_owned' || t === 'trans_owned');
  return (
    <LocalizedLink
      to={`/marketplace/brands/${brand.slug}`}
      className="flex w-44 shrink-0 flex-col gap-2 rounded-element border border-border p-4 transition-colors hover:border-foreground/40"
    >
      {brand.logo_url ? (
        <img
          src={brand.logo_url}
          alt=""
          className="h-12 w-12 rounded-element object-contain"
          loading="lazy"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-12 w-12 items-center justify-center rounded-element bg-muted font-display text-title"
        >
          {brand.display_name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="truncate text-15 font-medium">{brand.display_name}</span>
      <span className="flex items-center gap-2">
        {queerOwned && <Badge variant="outline">Queer-owned</Badge>}
        <span className="text-2xs text-muted-foreground tabular-nums">
          {brand.product_count.toLocaleString()} items
        </span>
      </span>
    </LocalizedLink>
  );
}

/** Horizontal-scroll rail of approved queer/trans-owned brands. */
export function BrandRail() {
  const { data: brands = [] } = useSpotlightBrands(8);
  if (brands.length === 0) return null;

  return (
    <section aria-label="Queer-owned brands" className="mb-10">
      <h2 className="mb-4 text-title font-semibold">Queer-owned brands</h2>
      <div className="-mx-4 overflow-x-auto">
        <ul className="flex min-w-max gap-4 px-4 pb-2">
          {brands.map((b) => (
            <li key={b.slug}>
              <BrandCard brand={b} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
