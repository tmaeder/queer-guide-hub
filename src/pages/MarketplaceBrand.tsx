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
import { useMarketplaceBrand, useMarketplaceBrandId } from '@/hooks/useMarketplaceBrands';
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
  const count = brand.product_count ?? 0;

  const host = hostnameOf(brand.website);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border-hairline">
        <PageContainer flush className="pb-8 pt-8 md:pb-12 md:pt-12">
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
                <h1 className="min-w-0 break-words font-display text-display leading-[0.95] md:text-hero">
                  {brand.display_name}
                </h1>
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

              {brand.story && <p className="mt-6 max-w-reading text-body-lg">{brand.story}</p>}

              {ownership.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-2">
                  {ownership.map((o) => (
                    <Badge key={o} variant="soft">
                      {OWNERSHIP_LABEL.get(o)}
                    </Badge>
                  ))}
                </div>
              )}

              {/* The facts that used to fill a separate FactGrid band, stated
                  once: the listing total (it repeated this line verbatim), the
                  site (it repeated the button), and a "catalogue key" that is
                  an internal join column, not something a reader can use. */}
              <p className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-13 text-muted-foreground">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-10 shrink-0 border border-border-hairline bg-track-yellow"
                />
                <span className="tabular-nums">
                  {t('marketplace.totalMakerListings', {
                    count,
                    formattedCount: count.toLocaleString(),
                    defaultValue: '{{formattedCount}} total listings',
                  })}
                </span>
                {host && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{host}</span>
                  </>
                )}
              </p>

              {(brand.website || brandId) && (
                <div className="mt-6 flex flex-wrap items-center gap-2">
                  {brand.website && (
                    <Button asChild>
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
              )}
            </div>

            {/* The line, beside the mark rather than as an empty ink bar above
                it — that bar cost ~100px (most of a phone's first screen)
                before the maker's name appeared. Decorative; hidden on phones. */}
            <MarketplaceLineArt className="hidden w-[320px] md:block lg:w-[400px]" />
          </div>
        </PageContainer>
      </header>

      <PageContainer>
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

      {/* End of line: the one ink block on the page. */}
      <div className="border-t border-border-hairline">
        <PageContainer flush className="py-12 md:py-16">
          <section
            aria-labelledby="brand-end-of-line"
            className="flex flex-wrap items-end justify-between gap-6 overflow-hidden rounded-container bg-foreground p-6 text-background md:p-8"
          >
            <div>
              <p className="text-2xs font-bold uppercase tracking-label text-background/70">
                {t('marketplace.endOfLine', 'End of line')}
              </p>
              <h2 id="brand-end-of-line" className="mt-1 font-display text-headline leading-tight">
                {t('marketplace.moreMakers', 'More makers on this line')}
              </h2>
              <LocalizedLink
                to="/marketplace/brands"
                className="mt-4 inline-flex items-center gap-2 rounded-element bg-background/15 px-4 py-2 text-13 font-bold text-background no-underline transition-colors hover:bg-background hover:text-foreground"
              >
                {t('marketplace.allMakers', 'All makers')} →
              </LocalizedLink>
            </div>
            <MarketplaceLineArt tone="ink" className="hidden max-w-[360px] md:block" />
          </section>
        </PageContainer>
      </div>
    </div>
  );
}
