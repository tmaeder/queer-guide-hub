import { CoverageNote } from '@/components/intent/CoverageNote';
import { NestedEntityCard } from '@/components/transit/NestedEntityCard';
import { useVerifiedOwnedBrands } from '@/hooks/useMarketplaceBrands';

/**
 * Brands whose queer ownership we have actually checked — the one section of
 * the deleted `/shop` page that was not already rendered by /marketplace.
 *
 * The CoverageNote is not decoration and must not be dropped to save space.
 * Ownership tags exist on ~24 of 2,583 brands (0.93%), so a section headed
 * "Queer-owned" is only defensible while it states its own coverage in the
 * same breath; without that line it reads as a claim about the catalogue.
 * `routeMetaContract.test.ts` asserts the marketplace is never described as
 * verified queer-owned at page level, and this is the section that would break
 * that promise first. The count is rendered from the data, never hardcoded, so
 * it stops being embarrassing the moment the number grows.
 *
 * Cards are NestedEntityCard: a brand is reached through the marketplace, so
 * it carries the M-yellow bullet and the block reads as part of the same line.
 * A brand with no slug renders without an href — NestedEntityCard then drops
 * the lift rather than promising a click that does nothing.
 */
export function VerifiedOwnedBrands() {
  const { data: brands } = useVerifiedOwnedBrands(24);
  if (!brands || brands.length === 0) return null;

  return (
    <section aria-labelledby="verified-owned-brands">
      <h2 id="verified-owned-brands" className="mb-2 font-display text-headline">
        Queer-owned, verified
      </h2>
      <CoverageNote>
        {brands.length} brands in our catalogue are verified queer-owned. That is a small fraction
        of everything we list — most brands carry no ownership information either way, so we do not
        claim it for them.
      </CoverageNote>
      <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {brands.map((b) => (
          <li key={b.id}>
            <NestedEntityCard
              type="marketplace"
              eyebrow="Verified owner"
              name={b.display_name ?? b.brand_key}
              description={
                b.product_count
                  ? `${b.product_count.toLocaleString()} product${b.product_count !== 1 ? 's' : ''}`
                  : null
              }
              href={b.slug ? `/marketplace/brands/${b.slug}` : undefined}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
