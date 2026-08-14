import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useMeta } from '@/hooks/useMeta';
import { IntentPageLayout } from '@/components/intent/IntentPageLayout';
import { CoverageNote } from '@/components/intent/CoverageNote';
import { useVerifiedOwnedBrands } from '@/hooks/useIntentData';
import { useGuides } from '@/hooks/useGuides';
import { DepartmentBento } from '@/components/marketplace/DepartmentBento';
import { OCCASION_CHIPS, DEPARTMENT_LABELS } from '@/lib/marketplaceTaxonomy';
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

/**
 * Occasions, built from the REAL filter contract.
 *
 * The previous list linked to `?categories=books`, `?categories=art` and
 * `?categories=apparel`. `categories` is not a filter parameter — the valid keys
 * are q/dept/cat/type/loc/price/owned/tags/cur/avail/verified — so those three
 * tiles were silently dropped and landed on the UNFILTERED full catalogue while
 * presenting as curated entries. Two more pointed at `?tags=pride` and
 * `?tags=gift`; the occasion vocabulary is `occ-*` and there is no `gift` tag.
 *
 * Occasion slugs now come from OCCASION_CHIPS (the same source the marketplace
 * chips use) and department slugs from DEPARTMENT_LABELS, so a rename in the
 * taxonomy breaks the build here instead of quietly emptying a tile.
 */
const OCCASION_BLURBS: Record<string, string> = {
  'occ-pride': 'Flags, pins and what to wear',
  'occ-drag': 'Wigs, lashes, performance wear',
  'occ-wedding': 'Rings, outfits, the whole day',
  'occ-everyday': 'The things you actually use',
};

const DEPARTMENT_PICKS: { dept: keyof typeof DEPARTMENT_LABELS & string; blurb: string }[] = [
  { dept: 'books_art', blurb: 'Fiction, history, memoir, prints' },
  { dept: 'apparel', blurb: 'Everyday wear' },
];

const OCCASIONS: { label: string; blurb: string; to: string }[] = [
  ...OCCASION_CHIPS.map((c) => ({
    label: c.label,
    blurb: OCCASION_BLURBS[c.slug] ?? '',
    to: `/marketplace?tags=${encodeURIComponent(c.slug)}`,
  })),
  ...DEPARTMENT_PICKS.map((d) => ({
    label: DEPARTMENT_LABELS[d.dept],
    blurb: d.blurb,
    to: `/marketplace?dept=${encodeURIComponent(d.dept)}`,
  })),
  { label: 'Everything', blurb: 'The full catalogue', to: '/marketplace' },
];

export default function ShopIntent() {
  const { t } = useTranslation();
  const { data: brands } = useVerifiedOwnedBrands(24);
  const { data: shoppingGuides = [] } = useGuides({ entityType: 'marketplace', limit: 3 });

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
              <h3 className="text-title font-bold mb-1">
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
            fraction of everything we list — most brands carry no ownership information either way,
            so we do not claim it for them.
          </CoverageNote>
          {brands && brands.length > 0 ? (
            <ul className="list-none p-0 m-0 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {brands.map((b) => (
                <li key={b.id} className="border-2 border-foreground p-4 rounded-container">
                  <h3 className="text-title font-bold">
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
      label: 'Browse by department',
      kicker: 'What the catalogue is actually sorted into',
      // WAS: chips from `marketplace_categories` via useShopCategories, ordered
      // alphabetically and capped at 18. That table is an orphan — it appears
      // nowhere else in src/ — and its slugs are not what /marketplace/category
      // resolves. That route understands DEPARTMENT keys and fine subcategory
      // slugs, which is how listings are actually classified, so the chips
      // pointed into a taxonomy the catalogue does not use.
      //
      // DepartmentBento is the real thing, already shipping on /marketplace: it
      // orders by DEPARTMENT_ORDER, shows live per-department counts, HIDES
      // departments with zero listings (so no tile is a dead end), and respects
      // the visitor's adult opt-in. No new query, no new taxonomy.
      content: <DepartmentBento />,
      action: (
        <LocalizedLink to="/marketplace" className="text-13 no-underline hover:underline">
          All products
        </LocalizedLink>
      ),
    },
    {
      id: 'guides',
      label: 'Guides',
      kicker: 'What to buy, and why',
      // Deliberately NOT `hidden`-gated on the guide count, which is the usual
      // pattern for a self-hiding rail. After the subway rebrand the header is
      // the Intent Router — six intents, no destination links and no dropdowns
      // — and `/shop` is the only hub for the `shop` cluster, so this section
      // is the single path from desktop chrome to the guides family. Hiding it
      // on a thin result would orphan `/guides` from the site entirely (which
      // is exactly what happened: `header primary nav links to /guides` failed
      // the nightly for days). The `action` link is data-independent for the
      // same reason; only the card list reacts to the query.
      content: shoppingGuides.length ? (
        <ul className="list-none p-0 m-0 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shoppingGuides.map((g) => (
            <li key={g.id} className="border-2 border-foreground p-6 rounded-container">
              <h3 className="text-title font-bold mb-1">
                <LocalizedLink to={`/guides/${g.slug}`} className="no-underline hover:underline">
                  {g.title}
                </LocalizedLink>
              </h3>
              {g.dek ? <p className="text-13 text-muted-foreground">{g.dek}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-13 text-muted-foreground">
          Editorial lists and buying guides, written by the community.
        </p>
      ),
      action: (
        <LocalizedLink
          to="/guides?entity=marketplace"
          className="text-13 no-underline hover:underline"
        >
          All guides
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
