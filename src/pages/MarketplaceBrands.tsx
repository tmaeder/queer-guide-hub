import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMeta } from '@/hooks/useMeta';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { PageContainer } from '@/components/layout/PageContainer';
import { MarketplaceMasthead } from '@/components/marketplace/MarketplaceMasthead';
import { BrandPlate } from '@/components/marketplace/BrandPlate';
import { BrandGalleryTile } from '@/components/marketplace/BrandGalleryTile';
import { BrandIndexRow } from '@/components/marketplace/BrandIndexRow';
import { COMMUNITY_OWNED_OPTIONS } from '@/components/marketplace/marketplaceFilterOptions';
import {
  useMarketplaceBrandsDirectory,
  useMarketplaceBrandCovers,
  type DirectoryBrand,
} from '@/hooks/useMarketplaceBrands';
import { FilterChip } from '@/components/transit/FilterChip';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { StickyLetterBar } from '@/components/ui/StickyLetterBar';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { CoverageNote } from '@/components/intent/CoverageNote';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';

/** How many makers the highlight band asks for. The RPC clamps at 24. */
const FEATURED_COUNT = 12;

/**
 * Makers rendered before "Show more". Client-side — no network.
 *
 * The gallery's step is deliberately far smaller than the index's. A ruled row
 * is ~56px and scans in ONE dimension, so 120 of them is a column a reader
 * flicks down; a tile is ~300px and scans in TWO, so 120 tiles is roughly eight
 * screens of photographs — which is the "too long, overwhelming" this rebuild
 * exists to fix, merely restated in pictures.
 */
const GALLERY_STEP = 48;
const INDEX_STEP = 120;

/**
 * The letter bucket a maker files under.
 *
 * Diacritics are folded first, so "Éclat" indexes at E where a naive
 * `charAt(0)` would drop it into the "#" bucket alongside the brands whose
 * names genuinely begin with a digit or a symbol. Measured on prod after
 * `99100101143000`, that is exactly one: "1979 SAS (Teil der Marc Dorcel
 * Group)", a real company. An EMPTY "#" bucket would mean the feed-ID
 * retirement rule had over-reached and taken it too.
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
 * Sort key for a bucket: "#" files at the END of the index, never the start.
 *
 * `localeCompare` alone puts digits and symbols before "A", so the A–Z view
 * OPENED on the "#" bucket — and at the time that bucket was 15 brands of
 * which 13 were merchant-feed ID artifacts ("12807-203758186"), carrying 143
 * listings between them. The count ordering had buried them; switching to A–Z
 * promoted the worst names in the catalogue to the first thing a reader sees.
 *
 * Filing them last is also just what a printed index does — numbers and
 * symbols are the tail, whatever the data underneath is doing.
 *
 * The data half is now fixed at the source, so this rule is no longer carrying
 * it: `99100101143000` retired the 20 feed-ID rows corpus-wide and re-keyed
 * their 190 listings onto the merchant's real brand, and
 * `marketplace_register_brands()` refuses to mint another.
 *
 * Do NOT read this ordering as a suppression mechanism, and do NOT add a
 * display filter on top of it — a filter hides rows here while leaving them in
 * search and on their own /marketplace/brands/:slug pages, which is the
 * half-fix the migration exists to avoid.
 */
function bucketRank(name: string): number {
  return initialOf(name) === '#' ? 1 : 0;
}

/**
 * The makers directory — /marketplace/brands.
 *
 * Four bands: a rotating highlight, the controls, the catalogue, and the ink
 * block. The catalogue's FORM is the part worth understanding.
 *
 * ── The highlight rotates, so it may not call itself a ranking ──────────────
 *
 * The band used to be the top twelve by `product_count` and was titled "Most
 * listings", which was exactly true. It now rotates daily over the 94 makers
 * that clear the band's gates, so that title would be a claim the page no
 * longer earns — the same defect as a comment that outlives its data, one
 * layer up. It says what it now is: a dozen makers, different each day, and
 * explicitly not a ranking.
 *
 * Rotation is the SERVER'S (the RPC seeds on its own date). Nothing here
 * animates, auto-advances or carousels: "rotating" is a different set on a
 * different day, not motion. A carousel would also put the makers it is
 * showing behind a timer the reader did not ask for.
 *
 * ── The catalogue is a GALLERY or an INDEX, and the toggle picks which ──────
 *
 * 871 makers is too many to meet as one undifferentiated run, in any form.
 * Both halves of that were measured before choosing:
 *
 *   • A gallery over everything does not work. 214 of 871 makers have no
 *     product photograph at all, so a tile each means 214 boxes with a hole in
 *     them — and 871 tiles is a bigger wall than 871 rows, not a smaller one.
 *   • An index over everything is what this page did, and it is right for
 *     LOOKING SOMETHING UP and wrong for BROWSING. 657 makers have a
 *     photograph and the page was showing none of them.
 *
 * So the view toggle chooses the form, and each form does the job it is good
 * at. Gallery: the makers with photography, biggest first, 48 at a time.
 * A–Z index: every maker as a ruled row under letter headings, which is the
 * shape a catalogue index has had for as long as catalogues have existed.
 *
 * In gallery view the 214 photograph-less makers are NOT dropped — they follow
 * in a compact index under their own heading. Dropping them would quietly
 * shrink the catalogue by a quarter, and "we have no photograph of this maker"
 * is not a reason to make it unreachable.
 *
 * ── Contracts that are not styling ─────────────────────────────────────────
 *
 * The highlight band is the head of the CATALOGUE, not of the RESULTS, so it
 * unmounts the moment the reader searches or filters — left up, it puts twelve
 * unrelated makers above a search for something else and reads as the answer.
 * Its makers then rejoin the catalogue below, or the very search meant to find
 * them could not.
 *
 * Ownership chips are a widening OR, and the CoverageNote renders whenever one
 * is active. That is a content-safety contract, not decoration: filtering to
 * "Queer-owned" produces a page that looks like an exhaustive list of the
 * queer-owned brands we carry, and it is nothing of the kind — 37 of 871
 * brands carry any ownership tag at all.
 *
 * Filtering runs in memory over the whole catalogue (one request) rather than
 * against PostgREST. See `useMarketplaceBrandsDirectory` for why.
 */
export default function MarketplaceBrands() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [ownership, setOwnership] = useState<string[]>([]);
  const [view, setView] = useState<'gallery' | 'az'>('gallery');
  const [letter, setLetter] = useState<string | null>(null);
  const [shown, setShown] = useState(GALLERY_STEP);

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

  const isFiltering = search.trim() !== '' || ownership.length > 0;
  const showHighlight = !isFiltering && featuredBrands.length > 0;

  const floor = useMemo(() => {
    const needle = search.trim().toLowerCase();
    // Only skip the highlighted makers when they are actually on screen above.
    const skip = showHighlight ? new Set(featuredBrands.map((b) => b.slug)) : new Set<string>();

    const rows = brands.filter((b) => {
      if (skip.has(b.slug)) return false;
      if (needle && !b.display_name.toLowerCase().includes(needle)) return false;
      if (ownership.length > 0 && !(b.ownership_tags ?? []).some((tg) => ownership.includes(tg))) {
        return false;
      }
      // A letter bucket only means anything against an alphabetical ordering.
      if (view === 'az' && letter && initialOf(b.display_name) !== letter) return false;
      return true;
    });

    // `brands` already arrives ordered by product_count, so only A–Z re-sorts.
    // localeCompare so "Ålesund" files next to "Alexander", not after "Zebra";
    // bucketRank first so the "#" tail cannot sort ahead of "A".
    return view === 'az'
      ? [...rows].sort(
          (a, b) =>
            bucketRank(a.display_name) - bucketRank(b.display_name) ||
            a.display_name.localeCompare(b.display_name),
        )
      : rows;
  }, [brands, featuredBrands, showHighlight, search, ownership, view, letter]);

  /**
   * The gallery/index split, computed ONCE over the filtered catalogue.
   *
   * Partitioning before the slice is what makes the two sections coherent: a
   * split computed over the visible window would move makers between the
   * gallery and the index as the reader pressed "Show more", which is the sort
   * of thing that reads as the page losing its place.
   */
  const [withCover, withoutCover] = useMemo(() => {
    if (view === 'az') return [[] as DirectoryBrand[], floor];
    const yes: DirectoryBrand[] = [];
    const no: DirectoryBrand[] = [];
    for (const b of floor) (b.cover_url ? yes : no).push(b);
    return [yes, no];
  }, [floor, view]);

  const step = view === 'az' ? INDEX_STEP : GALLERY_STEP;
  const visibleTiles = withCover.slice(0, shown);
  // The index half only starts once the gallery is exhausted — otherwise
  // "Show more" would grow two lists at once and the reader could never tell
  // which of them they were at the end of.
  const indexBudget = Math.max(0, shown - withCover.length);
  const visibleRows = view === 'az' ? floor.slice(0, shown) : withoutCover.slice(0, indexBudget);
  const renderedCount = visibleTiles.length + visibleRows.length;

  /** Reset the slice on any control change — never in an effect. */
  const withReset =
    <T,>(fn: (value: T) => void) =>
    (value: T) => {
      setShown(step);
      fn(value);
    };

  const toggleOwnership = withReset((value: string) =>
    setOwnership((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    ),
  );

  const setViewMode = (next: 'gallery' | 'az') => {
    setShown(next === 'az' ? INDEX_STEP : GALLERY_STEP);
    setView(next);
    // A letter filter that survives into the gallery is invisible: the bar
    // that set it is gone and the makers it removed never come back.
    if (next === 'gallery') setLetter(null);
  };

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

      {/* ── 1. The highlight ─────────────────────────────────────────────── */}
      {showHighlight && (
        <section
          aria-labelledby="makers-counter"
          className="border-b border-border-hairline bg-surface-container-low"
        >
          <PageContainer flush className="py-8 md:py-12">
            <SectionHeader
              id="makers-counter"
              eyebrow={t('marketplace.makersCounterEyebrow', 'The counter')}
              // NOT "Most listings" and never "Featured" or "Picks": the band
              // rotates over everyone who qualifies, so a ranking word would
              // be false and a curation word would claim an editorial judgement
              // nobody made.
              title={t('marketplace.makersCounterTitle', 'On the counter today')}
              subtitle={t(
                'marketplace.makersCounterSubtitle',
                'A different set of makers each day, drawn from everyone with photographed goods on the shelf. Not a ranking.',
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
                setShown(step);
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

            {/* Labelled "View" rather than "Sort": these do not reorder one
                list, they choose between two different presentations of the
                catalogue, and calling that a sort would mislead. */}
            <div role="group" aria-label={t('marketplace.viewMakers', 'View makers')}>
              <span className="sr-only">{t('marketplace.viewMakers', 'View makers')}</span>
              <span className="flex gap-2">
                <FilterChip
                  active={view === 'gallery'}
                  label={t('marketplace.viewGallery', 'Gallery')}
                  onClick={() => setViewMode('gallery')}
                />
                <FilterChip
                  active={view === 'az'}
                  label={t('marketplace.viewAz', 'A–Z index')}
                  onClick={() => setViewMode('az')}
                />
              </span>
            </div>
          </div>
        </PageContainer>
      </section>

      {/* ── 3. The catalogue ─────────────────────────────────────────────── */}
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
        {view === 'az' && (
          <StickyLetterBar
            letter={letter}
            onChange={(next) => {
              setShown(INDEX_STEP);
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
            {showHighlight && (
              <SectionHeader
                id="makers-floor"
                eyebrow={t('marketplace.makersFloorEyebrow', 'The floor')}
                title={t('marketplace.makersFloorTitle', 'Every other maker')}
              />
            )}

            {visibleTiles.length > 0 && (
              <ul className="m-0 grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
                {visibleTiles.map((b) => (
                  <li key={b.slug}>
                    <BrandGalleryTile brand={b} />
                  </li>
                ))}
              </ul>
            )}

            {/* Named honestly. These makers are not lesser — we simply hold no
                photograph of their goods, and saying so is more useful than a
                grid of empty tiles pretending otherwise. */}
            {view === 'gallery' && visibleRows.length > 0 && (
              <SectionHeader
                id="makers-no-photo"
                eyebrow={t('marketplace.makersNoPhotoEyebrow', 'Also on the shelf')}
                title={t('marketplace.makersNoPhotoTitle', 'Makers we have no photograph of')}
              />
            )}

            {visibleRows.length > 0 && (
              <ul className="m-0 list-none p-0">
                {visibleRows.map((b, i) => {
                  const bucket = initialOf(b.display_name);
                  const showHeading =
                    view === 'az' &&
                    (i === 0 || bucket !== initialOf(visibleRows[i - 1].display_name));
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
            )}

            {floor.length > renderedCount && (
              <div className="mt-10 flex items-center justify-center">
                <Button variant="outline" size="lg" onClick={() => setShown((n) => n + step)}>
                  {t('marketplace.showMoreMakers', {
                    defaultValue: 'Show {{count}} more',
                    count: Math.min(step, floor.length - renderedCount),
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
