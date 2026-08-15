import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMeta } from '@/hooks/useMeta';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { PageContainer } from '@/components/layout/PageContainer';
import { MarketplaceMasthead } from '@/components/marketplace/MarketplaceMasthead';
import { BrandPlate } from '@/components/marketplace/BrandPlate';
import { COMMUNITY_OWNED_OPTIONS } from '@/components/marketplace/marketplaceFilterOptions';
import { useMarketplaceBrandsDirectory } from '@/hooks/useMarketplaceBrands';
import { FilterChip } from '@/components/transit/FilterChip';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { CoverageNote } from '@/components/intent/CoverageNote';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';

/**
 * The makers directory — /marketplace/brands.
 *
 * This route did not exist. `/marketplace/brands/:slug` did, so a reader who
 * trimmed the URL (or any crawler that did) fell through to the
 * `marketplace/:slug` catch-all and was told the ITEM was not found — a 200
 * page lying about what it could not find. The brand pages themselves were
 * reachable only from links buried in cards and spotlight blocks.
 *
 * Ownership chips are a widening OR (see `useMarketplaceBrandsDirectory`), and
 * the CoverageNote renders whenever one is active. That is a content-safety
 * contract, not decoration: filtering to "Queer-owned" produces a page that
 * looks like an exhaustive list of the queer-owned brands we carry, and it is
 * nothing of the kind — under 1% of brands carry any ownership tag at all.
 * Without the note the page silently overstates the catalogue.
 */
export default function MarketplaceBrands() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [ownership, setOwnership] = useState<string[]>([]);
  const [page, setPage] = useState(0);

  const { data, isLoading } = useMarketplaceBrandsDirectory({ search, ownership, page });
  const brands = data?.brands ?? [];
  const total = data?.total ?? 0;

  useMeta({
    title: 'Makers — Marketplace',
    description: 'Brands and makers listed on the Queer Guide marketplace.',
    canonicalPath: '/marketplace/brands',
  });

  useBreadcrumbs([
    { label: t('breadcrumb.marketplace', 'Marketplace'), href: '/marketplace' },
    { label: t('marketplace.makers', 'Makers') },
  ]);

  const toggleOwnership = (value: string) => {
    setPage(0);
    setOwnership((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  const canLoadMore = brands.length > 0 && brands.length < total;

  return (
    <div className="min-h-screen">
      <MarketplaceMasthead
        eyebrow="Marketplace · Makers"
        title={t('marketplace.makersTitle', 'Makers.')}
        lede={t(
          'marketplace.makersLede',
          'Every brand with something listed on the marketplace.',
        )}
        count={
          isLoading && total === 0
            ? t('common.counting', 'Counting…')
            : t('marketplace.brandsInView', {
                defaultValue: '{{count}} brands in view',
                count: total,
              })
        }
      />

      {/* Control band — same grammar as the hub's, one row shorter. */}
      <section className="border-b-4 border-foreground bg-surface-container-low">
        <PageContainer flush className="flex flex-col gap-4 py-4 md:py-6">
          <label className="flex h-12 items-center gap-2 border-[3px] border-foreground bg-background px-4 shadow-hard">
            <TransitIcon name="search" size={20} />
            <span className="sr-only">{t('marketplace.searchMakers', 'Search makers')}</span>
            <input
              value={search}
              onChange={(e) => {
                setPage(0);
                setSearch(e.target.value);
              }}
              placeholder={t('marketplace.searchMakers', 'Search makers')}
              className="h-full min-w-0 flex-1 bg-transparent text-15 outline-none"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {COMMUNITY_OWNED_OPTIONS.map((o) => (
              <FilterChip
                key={o.value}
                active={ownership.includes(o.value)}
                label={o.label}
                onClick={() => toggleOwnership(o.value)}
              />
            ))}
          </div>
        </PageContainer>
      </section>

      <PageContainer>
        {ownership.length > 0 && (
          <CoverageNote>
            Ownership is recorded for a small fraction of the brands we list — most carry no
            ownership information either way, and we do not claim it for them. This filter shows
            only the brands where someone checked.
          </CoverageNote>
        )}

        {isLoading && brands.length === 0 ? (
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <li
                key={i}
                aria-hidden="true"
                className="h-[152px] animate-pulse border-[3px] border-foreground/20 bg-muted"
              />
            ))}
          </ul>
        ) : brands.length === 0 ? (
          <p className="text-muted-foreground">
            {t('marketplace.noMakers', 'No makers match that.')}{' '}
            <LocalizedLink to="/marketplace" className="underline underline-offset-4">
              {t('marketplace.browseAll', 'Browse the marketplace')}
            </LocalizedLink>
          </p>
        ) : (
          <>
            <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {brands.map((b) => (
                <li key={b.slug}>
                  <BrandPlate brand={b} />
                </li>
              ))}
            </ul>
            {canLoadMore && (
              <div className="mt-10 flex items-center justify-center">
                <Button variant="outline" size="lg" onClick={() => setPage((p) => p + 1)}>
                  {t('common.loadMore', 'Load more')}
                </Button>
              </div>
            )}
          </>
        )}
      </PageContainer>
    </div>
  );
}
