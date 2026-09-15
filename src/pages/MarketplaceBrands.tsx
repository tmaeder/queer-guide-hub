import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMeta } from '@/hooks/useMeta';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { PageContainer } from '@/components/layout/PageContainer';
import { MarketplaceMasthead } from '@/components/marketplace/MarketplaceMasthead';
import { BrandPlate } from '@/components/marketplace/BrandPlate';
import { BrandIndexRow } from '@/components/marketplace/BrandIndexRow';
import { COMMUNITY_OWNED_OPTIONS } from '@/components/marketplace/marketplaceFilterOptions';
import {
  useMarketplaceBrandsDirectory,
  useMarketplaceBrandCovers,
} from '@/hooks/useMarketplaceBrands';
import { FilterChip } from '@/components/transit/FilterChip';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { StickyLetterBar } from '@/components/ui/StickyLetterBar';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { CoverageNote } from '@/components/intent/CoverageNote';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';

/** How many makers the featured band asks for. The RPC clamps at 24. */
const FEATURED_COUNT = 12;

/** Index rows rendered before "Show more". Client-side — no network. */
const FLOOR_STEP = 120;

/**
 * The letter bucket a maker files under.
 *
 * Diacritics are folded first, so "Éclat" indexes at E where a naive
 * `charAt(0)` would drop it into the "#" bucket alongside the fifteen brands
 * whose names genuinely begin with a digit or a symbol.
 */
function initialOf(name: string): string {
  const first = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .charAt(0)
    .toUpperCase();
  return /^[A-Z]$/.test(first) ? first : '#';
}

/**
 * The makers directory — /marketplace/brands.
 *
 * This route did not exist. `/marketplace/brands/:slug` did, so a reader who
 * trimmed the URL (or any crawler that did) fell through to the
 * `marketplace/:slug` catch-all and was told the ITEM was not found — a 200
 * page lying about what it could not find.
 *
 * It then spent its life as one flat grid of 885 near-empty cards, 48 at a time
 * behind a "Load more", while the maker DETAIL page it feeds had bands, an ink
 * banner and a closing block. The rebuild is four bands, and the split between
 * the first and the third is the whole idea:
 *
 *   1. THE COUNTER — twelve makers with three product covers each. Measured, the
 *      catalogue has `story` on 24 brands and a logo on 118, but SFW listing
 *      imagery on 671 of 885. The goods were the one rich signal on hand and
 *      the page had never asked for them.
 *   2. CONTROLS — search, ownership, and a sort that decides band 3's shape.
 *   3. THE FLOOR — every other maker as a ruled index. 885 cards is not a grid,
 *      it is a wall; 885 ruled rows is a catalogue index, which is a form that
 *      has worked for as long as catalogues have existed.
 *   4. END OF LINE — the ink block, borrowed from the maker page.
 *
 * Ownership chips are a widening OR, and the CoverageNote renders whenever one
 * is active. That is a content-safety contract, not decoration: filtering to
 * "Queer-owned" produces a page that looks like an exhaustive list of the
 * queer-owned brands we carry, and it is nothing of the kind — 37 of 885 brands
 * carry any ownership tag at all. Without the note the page silently overstates
 * the catalogue.
 *
 * Filtering runs in memory over the whole catalogue (17 kB, one request) rather
 * than against PostgREST. See `useMarketplaceBrandsDirectory` for why.
 */
export default function MarketplaceBrands() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [ownership, setOwnership] = useState<string[]>([]);
  const [sort, setSort] = useState<'count' | 'az'>('count');
  const [letter, setLetter] = useState<string | null>(null);
  const [shown, setShown] = useState(FLOOR_STEP);

  const { data: all, isLoading } = useMarketplaceBrandsDirectory();
  const { data: featured } = useMarketplaceBrandCovers(FEATURED_COUNT);
  const brands = useMemo(() => all ?? [], [all]);
  const featuredBrands = useMemo(() => featured ?? [], [featured]);

  useMeta({
    title: 'Makers — Marketplace',
    description: 'Brands and makers listed on the Queer Guide marketplace.',
    canonicalPath: '/marketplace/brands',
  });

  useBreadcrumbs([
    { label: t('breadcrumb.marketplace', 'Marketplace'), href: '/marketplace' },
    { label: t('marketplace.makers', 'Makers') },
  ]);

  /**
   * The counter is the head of the CATALOGUE, not of the RESULTS. Showing it
   * above a filtered index would put twelve unrelated makers at the top of a
   * search for "rodeo" and read as though they were the answer.
   */
  const isFiltering = search.trim() !== '' || ownership.length > 0;
  const showCounter = !isFiltering && featuredBrands.length > 0;

  const floor = useMemo(() => {
    const needle = search.trim().toLowerCase();
    // Only skip the featured twelve when they are actually on screen above.
    const skip = showCounter ? new Set(featuredBrands.map((b) => b.slug)) : new Set<string>();

    const rows = brands.filter((b) => {
      if (skip.has(b.slug)) return false;
      if (needle && !b.display_name.toLowerCase().includes(needle)) return false;
      if (ownership.length > 0 && !(b.ownership_tags ?? []).some((tg) => ownership.includes(tg))) {
        return false;
      }
      // A letter bucket only means anything against an alphabetical ordering.
      if (sort === 'az' && letter && initialOf(b.display_name) !== letter) return false;
      return true;
    });

    // `brands` already arrives ordered by product_count, so only A–Z re-sorts.
    // localeCompare so "Ålesund" files next to "Alexander", not after "Zebra".
    return sort === 'az'
      ? [...rows].sort((a, b) => a.display_name.localeCompare(b.display_name))
      : rows;
  }, [brands, featuredBrands, showCounter, search, ownership, sort, letter]);

  const visible = floor.slice(0, shown);

  /** Reset the slice on any control change — never in an effect. */
  const withReset =
    <T,>(fn: (value: T) => void) =>
    (value: T) => {
      setShown(FLOOR_STEP);
      fn(value);
    };

  const toggleOwnership = withReset((value: string) =>
    setOwnership((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    ),
  );

  const setSortMode = withReset((next: 'count' | 'az') => {
    setSort(next);
    // A letter filter that survives into the count ordering is invisible: the
    // bar that set it is gone and the rows it removed never come back.
    if (next === 'count') setLetter(null);
  });

  const total = isFiltering ? floor.length : brands.length;

  return (
    <div className="min-h-screen">
      <MarketplaceMasthead
        eyebrow="Marketplace · Makers"
        title={t('marketplace.makersTitle', 'Makers.')}
        lede={t('marketplace.makersLede', 'Every brand with something listed on the marketplace.')}
        count={
          isLoading && brands.length === 0
            ? t('common.counting', 'Counting…')
            : t('marketplace.brandsInView', {
                defaultValue: '{{count}} brands in view',
                count: total,
              })
        }
      />

      {/* ── 1. The counter ───────────────────────────────────────────────── */}
      {showCounter && (
        <section
          aria-labelledby="makers-counter"
          className="border-b border-border-hairline bg-surface-container-low"
        >
          <PageContainer flush className="py-8 md:py-12">
            <SectionHeader
              id="makers-counter"
              eyebrow={t('marketplace.makersCounterEyebrow', 'The counter')}
              // "Most listings" and never "Featured" — the ordering is
              // product_count DESC and nothing has curated it. A curation word
              // here would be a claim about the catalogue we have not earned.
              title={t('marketplace.makersCounterTitle', 'Most listings')}
              subtitle={t(
                'marketplace.makersCounterSubtitle',
                'The makers with the most on the shelf right now.',
              )}
            />
            <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {featuredBrands.map((b) => (
                <li key={b.slug}>
                  <BrandPlate brand={b} />
                </li>
              ))}
            </ul>
          </PageContainer>
        </section>
      )}

      {/* ── 2. Controls ──────────────────────────────────────────────────── */}
      <section className="border-b border-border-hairline">
        <PageContainer flush className="flex flex-col gap-4 py-4 md:py-6">
          <label className="flex h-12 items-center gap-2 bg-card px-4 shadow-soft rounded-container">
            <TransitIcon name="search" size={20} />
            <span className="sr-only">{t('marketplace.searchMakers', 'Search makers')}</span>
            <input
              value={search}
              onChange={(e) => {
                setShown(FLOOR_STEP);
                setSearch(e.target.value);
              }}
              placeholder={t('marketplace.searchMakers', 'Search makers')}
              className="h-full min-w-0 flex-1 bg-transparent text-15 outline-none"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            {COMMUNITY_OWNED_OPTIONS.map((o) => (
              <FilterChip
                key={o.value}
                active={ownership.includes(o.value)}
                label={o.label}
                onClick={() => toggleOwnership(o.value)}
              />
            ))}

            <span aria-hidden="true" className="mx-2 h-6 w-px shrink-0 bg-border" />

            <div role="group" aria-label={t('marketplace.sortMakers', 'Sort makers')}>
              <span className="sr-only">{t('marketplace.sortMakers', 'Sort makers')}</span>
              <span className="flex gap-2">
                <FilterChip
                  active={sort === 'count'}
                  label={t('marketplace.sortByListings', 'Most listings')}
                  onClick={() => setSortMode('count')}
                />
                <FilterChip
                  active={sort === 'az'}
                  label={t('marketplace.sortAz', 'A–Z')}
                  onClick={() => setSortMode('az')}
                />
              </span>
            </div>
          </div>
        </PageContainer>
      </section>

      {/* ── 3. The floor ─────────────────────────────────────────────────── */}
      <PageContainer>
        {ownership.length > 0 && (
          <CoverageNote>
            Ownership is recorded for a small fraction of the brands we list — most carry no
            ownership information either way, and we do not claim it for them. This filter shows
            only the brands where someone checked.
          </CoverageNote>
        )}

        {/* The bar filters rather than jumps, so it is only coherent while the
            rows beneath it are in alphabetical order. */}
        {sort === 'az' && (
          <StickyLetterBar
            letter={letter}
            onChange={(next) => {
              setShown(FLOOR_STEP);
              setLetter(next);
            }}
          />
        )}

        {isLoading && brands.length === 0 ? (
          <div className="flex flex-col gap-2" aria-hidden="true">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse bg-muted rounded-element" />
            ))}
          </div>
        ) : floor.length === 0 ? (
          <p className="text-muted-foreground">
            {t('marketplace.noMakers', 'No makers match that.')}{' '}
            <LocalizedLink to="/marketplace" className="underline underline-offset-4">
              {t('marketplace.browseAll', 'Browse the marketplace')}
            </LocalizedLink>
          </p>
        ) : (
          <>
            {showCounter && (
              <SectionHeader
                id="makers-floor"
                eyebrow={t('marketplace.makersFloorEyebrow', 'The floor')}
                title={t('marketplace.makersFloorTitle', 'Every other maker')}
              />
            )}

            <ul className="m-0 list-none p-0">
              {visible.map((b, i) => {
                const bucket = initialOf(b.display_name);
                const showHeading =
                  sort === 'az' && (i === 0 || bucket !== initialOf(visible[i - 1].display_name));
                return (
                  <li key={b.slug}>
                    {showHeading && (
                      <h3
                        className="mt-8 border-b-2 border-foreground pb-1 font-display text-headline leading-none first:mt-0"
                        aria-label={
                          bucket === '#'
                            ? t(
                                'marketplace.makersNonAlpha',
                                'Makers filed under numbers and symbols',
                              )
                            : undefined
                        }
                      >
                        {bucket}
                      </h3>
                    )}
                    <BrandIndexRow brand={b} />
                  </li>
                );
              })}
            </ul>

            {floor.length > visible.length && (
              <div className="mt-10 flex items-center justify-center">
                <Button variant="outline" size="lg" onClick={() => setShown((n) => n + FLOOR_STEP)}>
                  {t('marketplace.showMoreMakers', {
                    defaultValue: 'Show {{count}} more',
                    count: Math.min(FLOOR_STEP, floor.length - visible.length),
                  })}
                </Button>
              </div>
            )}
          </>
        )}
      </PageContainer>

      {/* ── 4. End of line ───────────────────────────────────────────────── */}
      <div className="border-t border-border-hairline">
        <PageContainer flush className="py-12 md:py-16">
          <section
            aria-labelledby="makers-end-of-line"
            className="bg-foreground p-6 text-background md:p-8"
          >
            <p className="text-2xs font-bold uppercase tracking-label text-background/70">
              {t('marketplace.endOfLine', 'End of line')}
            </p>
            <h2 id="makers-end-of-line" className="mt-1 font-display text-headline leading-tight">
              {t('marketplace.everythingOnTheLine', 'Everything on the line')}
            </h2>
            <LocalizedLink
              to="/marketplace"
              className="border mt-4 inline-flex items-center gap-2 border-background px-4 py-2 text-13 font-bold text-background no-underline transition-colors hover:bg-background hover:text-foreground"
            >
              {t('marketplace.browseAll', 'Browse the marketplace')} →
            </LocalizedLink>
          </section>
        </PageContainer>
      </div>
    </div>
  );
}
