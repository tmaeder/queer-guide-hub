import { useState } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useDetailMeta } from '@/hooks/useDetailMeta';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { MarketplaceFilteredView } from '@/components/marketplace/MarketplaceFilteredView';
import { AdultContentGate } from '@/components/marketplace/AdultContentGate';
import { useAdultAcknowledgement } from '@/hooks/useAdultContent';
import { BrandMark } from '@/components/marketplace/BrandMark';
import { ImageCredit } from '@/components/ui/ImageCredit';
import { COMMUNITY_OWNED_OPTIONS } from '@/components/marketplace/marketplaceFilterOptions';
import { MarketplaceLineArt } from '@/components/marketplace/MarketplaceLineArt';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { DeadEndTrack } from '@/components/transit/DeadEndTrack';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  useBrandSellers,
  useMarketplaceBrand,
  useMarketplaceBrandId,
} from '@/hooks/useMarketplaceBrands';
import { boundArticleBody } from '@/utils/htmlDecode';
import { descriptionRemainder } from '@/lib/marketplaceListingKind';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { PageContainer } from '@/components/layout/PageContainer';

const OWNERSHIP_LABEL = new Map(COMMUNITY_OWNED_OPTIONS.map((o) => [o.value, o.label]));

/**
 * `brand.website` is merchant-feed data, not a validated column — `new URL()`
 * THROWS on a bare domain ("otherwild.com") and would take the whole page down
 * with it, which is a blank screen in exchange for one fact cell.
 */
function hostnameOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * A maker's page — /marketplace/brands/:slug.
 *
 * 2026-10-31 pass: the empty ink banner, the second mark (a route bullet
 * stacked on the logo) and the FactGrid band are gone — every fact in that
 * band repeated something already on screen or was internal. The line art now
 * sits beside the mark and closes the page in the end-of-line block.
 *
 * This was the plainest page in the family: a `PageHeader`, two outline badges,
 * a paragraph and a grid. Nothing said marketplace, nothing said which line you
 * were on, and the logo we already store was never rendered.
 *
 * It is now the design project's merchant storefront: an ink banner carrying
 * the line, the maker's mark punched through the banner edge, then facts, then
 * their listings, then the way back to the rest of the makers. Band grammar
 * rather than the `SinglePage` spine on purpose — a three-up product grid
 * squeezed into a 1fr column beside a 360px rail is the wrong shape for the
 * thing this page mostly is, which is a grid.
 */
export default function MarketplaceBrand() {
  const { t } = useTranslation();
  const { acknowledged } = useAdultAcknowledgement();
  const [adultRequested, setAdultRequested] = useState(false);
  const { slug } = useParams<{ slug: string }>();
  const { data: brand, isLoading } = useMarketplaceBrand(slug);
  const { canManageContent } = useAdminRoles();
  const { data: brandId } = useMarketplaceBrandId(slug, canManageContent());
  const { data: sellers = [] } = useBrandSellers(brand?.brand_key);

  useDetailMeta({
    status: isLoading ? 'loading' : !brand ? 'notFound' : 'ready',
    notFoundTitle: t('marketplace.noMaker', 'No maker here.'),
    title: brand ? `${brand.display_name} — Marketplace` : 'Brand',
    description: brand
      ? `Products from ${brand.display_name} on Queer Guide.`
      : 'Marketplace brand on Queer Guide.',
    canonicalPath: slug ? `/marketplace/brands/${slug}` : undefined,
  });

  useBreadcrumbs(
    brand
      ? [
          { label: t('breadcrumb.marketplace', 'Marketplace'), href: '/marketplace' },
          { label: t('marketplace.makers', 'Makers'), href: '/marketplace/brands' },
          { label: brand.display_name },
        ]
      : null,
  );

  if (!isLoading && !brand) {
    return (
      <PageContainer>
        <h1 className="font-display text-display leading-[0.95]">
          {t('marketplace.noMaker', 'No maker here.')}
        </h1>
        <p className="mt-4 max-w-reading text-body-lg text-muted-foreground">
          {t('marketplace.noMakerLede', 'This brand is not listed, or its page has been retired.')}
        </p>
        <DeadEndTrack className="mt-10" label={slug ?? 'Unknown'} type="marketplace" />
        <div className="mt-8 flex flex-wrap gap-2">
          <Button asChild>
            <LocalizedLink to="/marketplace/brands" className="no-underline">
              {t('marketplace.allMakers', 'All makers')}
            </LocalizedLink>
          </Button>
        </div>
      </PageContainer>
    );
  }
  if (!brand) return null;

  const ownership = brand.ownership_tags.filter((o) => OWNERSHIP_LABEL.has(o));

  const host = hostnameOf(brand.website);
  // The story leads with ONE short paragraph; the rest moves below the
  // catalogue. Alba Optics opened with eight lines on lens manufacturing
  // before its three products.
  const summary = brand.story ? boundArticleBody(brand.story, 220) : null;
  const storyRest =
    brand.story && summary?.truncated ? descriptionRemainder(brand.story, summary.text) : null;
  // Why this maker is here, from data only: a verified ownership tag, or the
  // queer-guide sellers that carry it. Ownership and relevance are different
  // claims, so they are stated separately and an unverified one says so.
  const otherSellers = sellers.filter(
    (s) => s.name.trim().toLowerCase() !== brand.display_name.trim().toLowerCase(),
  );

  return (
    <div className="min-h-screen">
      <header className="border-b border-border-hairline">
        <PageContainer flush className="py-6 md:py-8">
          <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            {/* ONE column carries everything, actions included. The CTA used to
                sit in a `flex-1` + `flex-wrap` sibling, and a `flex-1` item
                has a 0% basis, so the row never wrapped: on a 390px phone the
                button column stole half the width and the story ran ~17
                characters to a line. */}
            <div className="min-w-0">
              <p className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
                {t('marketplace.makerEyebrow', 'Marketplace · Maker')}
              </p>

              <div className="mt-4 flex items-center gap-4 md:gap-6">
                <BrandMark
                  name={brand.display_name}
                  logoUrl={brand.logo_url}
                  onInk={brand.logo_on_ink ?? false}
                  className="h-16 w-16 shrink-0 rounded-container md:h-24 md:w-24"
                  monogramClassName="font-display text-headline"
                  padding="p-2.5"
                />
                <h1 className="min-w-0 break-words font-display text-headline leading-[0.95] md:text-display">
                  {brand.display_name}
                </h1>
              </div>

              {summary?.text && <p className="mt-6 max-w-reading text-body-lg">{summary.text}</p>}

              <dl className="mt-6 grid max-w-reading gap-2 text-13">
                <div className="flex flex-wrap items-center gap-2">
                  <dt className="font-bold">{t('marketplace.ownership', 'Ownership')}:</dt>
                  <dd className="m-0 flex flex-wrap gap-2">
                    {ownership.length > 0 ? (
                      <>
                        {ownership.map((o) => (
                          <Badge key={o} variant="soft">
                            {OWNERSHIP_LABEL.get(o)}
                          </Badge>
                        ))}
                        <span className="text-muted-foreground">
                          {t('marketplace.ownershipVerified', 'verified by Queer Guide')}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        {t('marketplace.ownershipNotVerified', 'No ownership claim verified')}
                      </span>
                    )}
                  </dd>
                </div>
                {otherSellers.length > 0 && (
                  <div className="flex flex-wrap items-baseline gap-2">
                    <dt className="font-bold">{t('marketplace.soldHereBy', 'Sold here by')}:</dt>
                    <dd className="m-0 text-muted-foreground">
                      {otherSellers
                        .slice(0, 3)
                        .map((s) => s.name)
                        .join(', ')}
                      {otherSellers.length > 3 &&
                        ` ${t('marketplace.andMoreSellers', 'and {{n}} more', { n: otherSellers.length - 3 })}`}
                    </dd>
                  </div>
                )}
              </dl>

              {/* ONE listing count on this page, and it is the grid's own
                  "24 of 452 listings" below. The masthead used to also print
                  `product_count` ("501 total listings"), which counts adult
                  listings the grid hides until the reader opts in — two
                  numbers that disagreed with no way to tell why. The site is
                  stated once, here; the FactGrid band that repeated it (and a
                  "catalogue key" that is an internal join column) is gone. */}
              {host && <p className="mt-6 text-13 text-muted-foreground">{host}</p>}

              <div className="mt-6 flex flex-wrap items-center gap-2">
                <Button asChild>
                  <a href="#maker-listings">{t('marketplace.browseListings', 'Browse listings')}</a>
                </Button>
                {brand.website && (
                  <Button asChild variant="outline">
                    <a href={brand.website} target="_blank" rel="noopener noreferrer">
                      {t('marketplace.visitBrandSite', 'Visit brand site')}
                      <span aria-hidden="true"> ↗</span>
                    </a>
                  </Button>
                )}
                {brandId && (
                  <AdminEditButton
                    contentType="marketplace_brands"
                    contentId={brandId}
                    contentName={brand.display_name}
                    onSaved={() => window.location.reload()}
                    exportable
                  />
                )}
              </div>

              {brand.logo_credit && (
                <div className="mt-4 max-w-reading">
                  {brand.logo_credit.source_url ? (
                    <a
                      href={brand.logo_credit.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2"
                    >
                      <ImageCredit
                        attribution={brand.logo_credit.attribution}
                        license={brand.logo_credit.license}
                        source={
                          hostnameOf(brand.logo_credit.source_url) === 'commons.wikimedia.org'
                            ? 'wikimedia'
                            : hostnameOf(brand.logo_credit.source_url)
                        }
                      />
                    </a>
                  ) : (
                    <ImageCredit
                      attribution={brand.logo_credit.attribution}
                      license={brand.logo_credit.license}
                    />
                  )}
                </div>
              )}
            </div>

            {/* The line, beside the mark rather than as an empty ink bar above
                it — that bar cost ~100px (most of a phone's first screen)
                before the maker's name appeared. Decorative; hidden on phones. */}
            <MarketplaceLineArt className="hidden w-[320px] md:block lg:w-[400px]" />
          </div>
        </PageContainer>
      </header>

      <PageContainer id="maker-listings">
        {!acknowledged && (
          <Button variant="outline" className="mb-6" onClick={() => setAdultRequested(true)}>
            {t('marketplace.showAdultMakerListings', 'Show adult listings (18+)')}
          </Button>
        )}
        <MarketplaceFilteredView
          filters={{ brandKey: brand.brand_key, includeAdult: acknowledged }}
          surface="brand_page"
          emptyTitle={t(
            'marketplace.noBrandListings',
            'No listings are visible with your current settings.',
          )}
          emptyAction={{
            label: t('marketplace.allMakers', 'All makers'),
            to: '/marketplace/brands',
          }}
        />
      </PageContainer>

      <AdultContentGate active={adultRequested} fallbackPath="/marketplace/brands" />

      {storyRest && (
        <PageContainer flush className="pb-12">
          <section aria-labelledby="brand-story-full" className="max-w-reading">
            <h2 id="brand-story-full" className="font-display text-headline leading-tight">
              {t('marketplace.aboutMaker', 'About {{name}}', { name: brand.display_name })}
            </h2>
            <p className="mt-4 text-body-lg leading-relaxed">{storyRest}</p>
          </section>
        </PageContainer>
      )}

      {/* No "More makers on this line" heading: there are no related makers to
          list, so the heading promised a set the page could not show. */}
      <div className="border-t border-border-hairline">
        <PageContainer flush className="py-8">
          <LocalizedLink to="/marketplace/brands" className="text-15 font-bold">
            {t('marketplace.allMakers', 'All makers')} →
          </LocalizedLink>
        </PageContainer>
      </div>
    </div>
  );
}
