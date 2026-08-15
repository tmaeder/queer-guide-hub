import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMeta } from '@/hooks/useMeta';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { MarketplaceFilteredView } from '@/components/marketplace/MarketplaceFilteredView';
import { brandMonogram } from '@/components/marketplace/BrandPlate';
import { COMMUNITY_OWNED_OPTIONS } from '@/components/marketplace/marketplaceFilterOptions';
import { MarketplaceLineArt } from '@/components/marketplace/MarketplaceLineArt';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { FactGrid } from '@/components/transit/FactGrid';
import { DeadEndTrack } from '@/components/transit/DeadEndTrack';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Image } from '@/components/ui/Image';
import { useMarketplaceBrand } from '@/hooks/useMarketplaceBrands';
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
  const { slug } = useParams<{ slug: string }>();
  const { data: brand, isLoading } = useMarketplaceBrand(slug);

  useMeta({
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
          {t(
            'marketplace.noMakerLede',
            'This brand is not listed, or its page has been retired.',
          )}
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

  return (
    <div className="min-h-screen">
      <header className="border-b-4 border-foreground">
        {/* The banner is the line running behind the maker's mark — the one
            place this page shows track colour. Ink ground, so the yellow is
            already border-gated by the band's own edges. */}
        <div className="relative border-b-4 border-foreground bg-foreground">
          <PageContainer flush className="py-4">
            <MarketplaceLineArt tone="ink" className="ml-auto max-w-[420px]" />
          </PageContainer>
        </div>

        <PageContainer flush className="pb-8 pt-8 md:pb-12">
          <div className="flex flex-wrap items-end justify-between gap-8">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-4">
                <RouteBullet type="marketplace" size={44} />
                <p className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
                  {t('marketplace.makerEyebrow', 'Marketplace · Maker')}
                </p>
              </div>

              <div className="mt-4 flex items-start gap-4">
                <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden border-[3px] border-foreground bg-background">
                  {brand.logo_url ? (
                    <Image src={brand.logo_url} alt="" aspect="square" rounded="none" />
                  ) : (
                    <span aria-hidden="true" className="font-display text-headline leading-none">
                      {brandMonogram(brand.display_name)}
                    </span>
                  )}
                </div>
                <h1 className="min-w-0 font-display text-display leading-[0.95] md:text-hero">
                  {brand.display_name}
                </h1>
              </div>

              {brand.story && (
                <p className="mt-6 max-w-reading text-body-lg">{brand.story}</p>
              )}

              {ownership.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-2">
                  {ownership.map((o) => (
                    <Badge key={o} variant="soft">
                      {OWNERSHIP_LABEL.get(o)}
                    </Badge>
                  ))}
                </div>
              )}

              <p className="mt-6 flex items-center gap-4 text-13 text-muted-foreground">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-10 shrink-0 border border-foreground bg-track-yellow"
                />
                <span className="tabular-nums">
                  {count.toLocaleString()} listing{count !== 1 ? 's' : ''}
                </span>
              </p>
            </div>

            {brand.website && (
              <Button asChild variant="outline">
                <a href={brand.website} target="_blank" rel="noopener noreferrer">
                  {t('marketplace.visitBrandSite', 'Visit brand site')}
                </a>
              </Button>
            )}
          </div>
        </PageContainer>
      </header>

      {/* FactGrid self-filters falsy values and returns null when every one is
          empty, so this is deliberately unguarded at the call site. */}
      <div className="border-b-4 border-foreground">
        <PageContainer flush className="py-8 md:py-12">
          <FactGrid
            // Ownership is deliberately NOT a fact here: it is already stated
            // as badges in the masthead above, and repeating it put the same
            // string on screen twice (caught by MarketplaceBrand.test.tsx,
            // which could no longer find a unique "Queer-owned"). The badges
            // win — they are what the maker carried in the directory the
            // reader just came from.
            facts={[
              { label: t('marketplace.facts.listings', 'Listings'), value: count || null },
              { label: t('marketplace.facts.site', 'Site'), value: hostnameOf(brand.website) },
              {
                label: t('marketplace.facts.brandKey', 'Catalogue key'),
                value: brand.brand_key,
              },
            ]}
          />
        </PageContainer>
      </div>

      <PageContainer>
        <MarketplaceFilteredView
          filters={{ brandKey: brand.brand_key }}
          surface="brand_page"
          emptyTitle={t('marketplace.noBrandListings', 'Nothing from this maker is live.')}
          emptyAction={{
            label: t('marketplace.allMakers', 'All makers'),
            to: '/marketplace/brands',
          }}
        />
      </PageContainer>

      {/* End of line: the one ink block on the page. */}
      <div className="border-t-4 border-foreground">
        <PageContainer flush className="py-12 md:py-16">
          <section
            aria-labelledby="brand-end-of-line"
            className="border-[3px] border-foreground bg-foreground p-6 text-background md:p-8"
          >
            <p className="text-2xs font-bold uppercase tracking-label text-background/70">
              {t('marketplace.endOfLine', 'End of line')}
            </p>
            <h2 id="brand-end-of-line" className="mt-1 font-display text-headline leading-tight">
              {t('marketplace.moreMakers', 'More makers on this line')}
            </h2>
            <LocalizedLink
              to="/marketplace/brands"
              className="mt-4 inline-flex items-center gap-2 border-2 border-background px-4 py-2 text-13 font-bold text-background no-underline transition-colors hover:bg-background hover:text-foreground"
            >
              {t('marketplace.allMakers', 'All makers')} →
            </LocalizedLink>
          </section>
        </PageContainer>
      </div>
    </div>
  );
}
