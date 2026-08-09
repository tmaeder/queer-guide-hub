import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useMeta } from '@/hooks/useMeta';
import { IntentPageLayout } from '@/components/intent/IntentPageLayout';
import { CoverageNote } from '@/components/intent/CoverageNote';
import { useVerifiedOwnedBrands, useShopCategories } from '@/hooks/useIntentData';
import type { SectionDef } from '@/components/entity/editorial';

/**
 * `/shop` — an editorial front door to the 57,584-listing marketplace.
 *
 * Called "Shop", not "Shop queer-owned". Ownership tags exist on 24 of 2,583
 * brands (0.93%), so a page-level ownership claim would be unverifiable for 99%
 * of the catalogue. Instead the verified brands get their own section with the
 * count stated literally, which is a claim we can actually defend — and which
 * stops being embarrassing the moment the number grows.
 *
 * The occasions grid is a pure editorial spine over existing marketplace
 * filters: no new data, no new pipeline, and it gives the page a reason to
 * exist beyond "a list of categories".
 */

const OCCASIONS: { label: string; blurb: string; to: string }[] = [
  { label: 'Pride kit', blurb: 'Flags, pins and what to wear', to: '/marketplace?tags=pride' },
  {
    label: 'A gift',
    blurb: 'For a partner, a friend, a chosen family',
    to: '/marketplace?tags=gift',
  },
  { label: 'Books', blurb: 'Fiction, history, memoir', to: '/marketplace?categories=books' },
  { label: 'Art & prints', blurb: 'For your walls', to: '/marketplace?categories=art' },
  { label: 'Apparel', blurb: 'Everyday wear', to: '/marketplace?categories=apparel' },
  { label: 'Everything', blurb: 'The full catalogue', to: '/marketplace' },
];

export default function ShopIntent() {
  const { t } = useTranslation();
  const { data: brands } = useVerifiedOwnedBrands(24);
  const { data: categories } = useShopCategories(18);

  useMeta({
    title: 'Shop — books, apparel, art and gifts',
    description:
      'Books, fashion, art and gifts for and about the LGBTQ+ community, with queer-owned brands labelled where we have verified ownership.',
    canonicalPath: '/shop',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'LGBTQ+ marketplace',
    },
  });

  const sections: SectionDef[] = [
    {
      id: 'occasions',
      label: 'What for?',
      kicker: 'Start with the occasion',
      content: (
        <ul className="list-none p-0 m-0 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {OCCASIONS.map((o) => (
            <li key={o.label} className="border-2 border-foreground p-6 rounded-container">
              <h3 className="font-display text-title mb-1">
                <LocalizedLink to={o.to} className="no-underline hover:underline">
                  {o.label}
                </LocalizedLink>
              </h3>
              <p className="text-13 text-muted-foreground">{o.blurb}</p>
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: 'verified',
      label: 'Queer-owned',
      kicker: 'Ownership we have actually checked',
      content: (
        <div>
          <CoverageNote>
            {brands?.length ?? 0} brands in our catalogue are verified queer-owned. That is a small
            fraction of the {(2583).toLocaleString()} brands we list — most carry no ownership
            information either way, so we do not claim it for them.
          </CoverageNote>
          {brands && brands.length > 0 ? (
            <ul className="list-none p-0 m-0 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {brands.map((b) => (
                <li key={b.id} className="border-2 border-foreground p-4 rounded-container">
                  <h3 className="font-display text-title">
                    {b.slug ? (
                      <LocalizedLink
                        to={`/marketplace/brands/${b.slug}`}
                        className="no-underline hover:underline"
                      >
                        {b.display_name ?? b.brand_key}
                      </LocalizedLink>
                    ) : (
                      (b.display_name ?? b.brand_key)
                    )}
                  </h3>
                  {b.product_count ? (
                    <p className="text-13 text-muted-foreground">{b.product_count} products</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ),
    },
    {
      id: 'categories',
      label: 'Categories',
      // Unguarded, this mapped an undefined-then-empty array, so EVERY first
      // paint showed <h2>Categories</h2> + "All products" + a nav anchor over
      // an empty <ul> until the query settled. Unlike the geo-dependent cases
      // this fired for every visitor. `hidden` drops the whole section — heading,
      // action and nav entry — until there is something to put in it.
      hidden: !categories || categories.length === 0,
      content: (
        <ul className="list-none p-0 m-0 flex flex-wrap gap-2">
          {(categories ?? []).map((c) => (
            <li key={c.id}>
              <LocalizedLink
                to={c.slug ? `/marketplace/category/${c.slug}` : '/marketplace'}
                className="border-2 border-foreground px-4 py-2 no-underline inline-block rounded-badge"
              >
                {c.name}
              </LocalizedLink>
            </li>
          ))}
        </ul>
      ),
      action: (
        <LocalizedLink to="/marketplace" className="text-13 no-underline hover:underline">
          All products
        </LocalizedLink>
      ),
    },
  ];

  return (
    <IntentPageLayout
      breadcrumbLabel={t('header.intents.shop.label', 'Shop')}
      breadcrumbHref="/shop"
      eyebrow="Marketplace"
      title="Shop"
      lede="Books, apparel, art and gifts for and about the community. Where we have verified a brand as queer-owned, we say so."
      sections={sections}
    />
  );
}
