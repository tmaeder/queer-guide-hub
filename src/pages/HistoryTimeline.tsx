import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FilterChip } from '@/components/transit/FilterChip';
import { useMeta } from '@/hooks/useMeta';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { useMilestonesTimeline, useMilestoneYearCounts } from '@/hooks/useMilestones';
import { HISTORY_ERAS } from '@/config/historyEras';
import { groupMilestonesByEra, sumEraCounts } from '@/lib/historyEraGrouping';
import { EraLineNav } from '@/components/milestones/EraLineNav';
import { EraSection } from '@/components/milestones/EraSection';
import { OnThisDayBand } from '@/components/milestones/OnThisDayBand';
import { MILESTONE_CATEGORIES, milestoneCategoryLabelKey } from '@/types/milestone';
import { cn } from '@/lib/utils';
import { PageContainer } from '@/components/layout/PageContainer';

const IMPACTS = ['positive', 'neutral', 'negative'] as const;

/**
 * /history — the queer-history timeline as curated era chapters, drawn as the
 * pink line. One slim server-filtered spine fetch (significance>=4, ~450 rows)
 * plus a per-year histogram for era counts; each era expands on demand to its
 * full chronology.
 *
 * The page is a stack of full-bleed bands, each owning its own PageContainer —
 * the SubwayHero/CityCards idiom — rather than one container wrapping
 * everything, because the 4px ink rules between sections have to reach the
 * viewport edge while their content stays on the page cap.
 *
 * Persecution content is heavy, and the restraint that buys is structural: the
 * line renders in ink rather than pink across the four `restrained` eras, and
 * anchor cards in those chapters never take the celebratory image/poster-year
 * treatment. Hover affordances are NOT withheld — a card that refuses to
 * respond reads as broken, not as sombre.
 */
export default function HistoryTimeline() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();

  const country = params.get('country');
  const category = params.get('category');
  const impact = params.get('impact');
  // "All milestones" auto-expands every era; default shows the major spine.
  const showAll = params.get('all') === '1';

  const filters = useMemo(
    () => ({ countryLabel: country, category, impact }),
    [country, category, impact],
  );
  const { data: spine, isLoading } = useMilestonesTimeline(
    { ...filters, significanceMin: 4 },
    1000,
  );
  const { data: yearCounts } = useMilestoneYearCounts(filters);
  // Unfiltered spine feeds the country dropdown (identical query key — and thus
  // a single request — when no filters are active).
  const { data: unfilteredSpine } = useMilestonesTimeline(
    { countryLabel: null, category: null, impact: null, significanceMin: 4 },
    1000,
  );

  // Per-era manual expansion, on top of the ?all=1 bulk switch.
  const [expandedEras, setExpandedEras] = useState<Set<string>>(new Set());

  useMeta({
    title: t('milestones.metaTitle', 'Queer history timeline'),
    description: t(
      'milestones.metaDescription',
      'Milestones of LGBTQ+ history: uprisings, decriminalizations, marriage equality and setbacks — dated, sourced, worldwide.',
    ),
    canonicalPath: '/history',
  });
  // BreadcrumbBar prepends Home itself — publish the entity-only trail.
  useBreadcrumbs(useMemo(() => [{ label: t('milestones.breadcrumb', 'History') }], [t]));

  const grouped = useMemo(() => groupMilestonesByEra(spine ?? []), [spine]);
  const eraCounts = useMemo(
    () => (yearCounts ? sumEraCounts(yearCounts) : undefined),
    [yearCounts],
  );
  const totalCount = useMemo(
    () => (yearCounts ?? []).reduce((sum, c) => sum + c.n, 0),
    [yearCounts],
  );

  const countries = useMemo(() => {
    // The dropdown works on the display LABEL: bulk-imported rows may carry
    // only a free-text country_name while resolved rows key by slug — the same
    // country must be one entry and the filter must match both row shapes.
    // Built from the unfiltered spine so the list stays stable while filtering.
    const labels = new Set<string>();
    for (const m of unfilteredSpine ?? []) {
      const label = m.country?.name ?? m.country_name;
      if (label) labels.add(label);
    }
    if (country) labels.add(country);
    return [...labels].sort((a, b) => a.localeCompare(b));
  }, [unfilteredSpine, country]);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const clearFilters = () => setParams({}, { replace: true });
  const hasFilters = Boolean(country || category || impact || showAll);

  const visibleEras = HISTORY_ERAS.filter((era) => {
    const spineRows = grouped.get(era.slug) ?? [];
    const count = eraCounts?.get(era.slug);
    return spineRows.length > 0 || (count ?? 0) > 0;
  });

  return (
    <>
      <header className="border-b border-border-hairline">
        <PageContainer flush className="pb-8 pt-8 md:pb-12 md:pt-16">
          <p className="text-2xs uppercase tracking-label text-muted-foreground">
            {t('milestones.eyebrow', 'Queer history')}
          </p>
          {/* text-hero flat, no md:text-hero-xl — hero-xl is reserved for
              marketing covers, and /history is a page. */}
          <h1 className="mt-2 max-w-4xl font-display text-hero">
            {t('milestones.pageTitle', 'Queer history')}
          </h1>
          <p className="mt-4 max-w-reading text-body-lg leading-relaxed">
            {t(
              'milestones.pageDescription',
              'Milestones that shaped LGBTQ+ life — uprisings, laws, setbacks. Dated and sourced.',
            )}
          </p>
          {totalCount > 0 && (
            <p className="mt-6 flex items-center gap-2 text-13 text-muted-foreground">
              {/* The one place on the page that NAMES the line — which is what
                  earns the pink here rather than it being decoration. */}
              <span
                aria-hidden
                className="inline-block h-2 w-6 shrink-0 rounded-full bg-track-pink"
              />
              {t('milestones.stats', '{{count}} milestones across {{eras}} eras', {
                count: totalCount,
                eras: visibleEras.length,
              })}
            </p>
          )}
        </PageContainer>
      </header>

      <OnThisDayBand />

      <section
        aria-label={t('milestones.filter.heading', 'Filter the timeline')}
        className="border-b border-border-hairline bg-surface-container"
      >
        <PageContainer flush className="flex flex-col gap-4 py-4 md:py-6">
          <div
            role="group"
            aria-label={t('milestones.filter.categoryGroup', 'Category')}
            className="flex flex-wrap gap-2"
          >
            {MILESTONE_CATEGORIES.filter((c) => c !== 'other').map((c) => (
              <FilterChip
                key={c}
                active={category === c}
                label={t(milestoneCategoryLabelKey(c))}
                onClick={() => setParam('category', category === c ? null : c)}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label={t('milestones.filter.scopeGroup', 'Depth')}
              className="flex gap-2"
            >
              {/* Both chips used to call the same toggle, so clicking the
                  already-active "Major" chip switched the page to "All". They
                  set their own state now. */}
              <FilterChip
                active={!showAll}
                label={t('milestones.filter.major', 'Major milestones')}
                onClick={() => setParam('all', null)}
              />
              <FilterChip
                active={showAll}
                label={t('milestones.filter.showAll', 'All milestones')}
                onClick={() => setParam('all', '1')}
              />
            </div>

            <span aria-hidden className="h-8 w-0.5 shrink-0 bg-foreground/15" />

            <div
              role="group"
              aria-label={t('milestones.filter.impactGroup', 'Impact')}
              className="flex flex-wrap gap-2"
            >
              {/* Text only. The impact marker's job is the timeline; inside an
                  ink-filled active chip the destructive glyph would need an
                  invert hack to stay visible. */}
              {IMPACTS.map((i) => (
                <FilterChip
                  key={i}
                  active={impact === i}
                  label={t(`milestones.impact.${i}`)}
                  onClick={() => setParam('impact', impact === i ? null : i)}
                />
              ))}
            </div>

            {/* Native select, restyled to the chip's DNA. The pre-rebrand-token
                objection this used to carry is resolved — `ui/select.tsx` is on
                `border-input` + `bg-muted` now — but the native picker stays: it
                is still the better control for ~100 countries on a phone. */}
            <select
              value={country ?? ''}
              onChange={(e) => setParam('country', e.target.value || null)}
              aria-label={t('milestones.filter.country', 'Country')}
              className={cn(
                'h-8 bg-muted rounded-element px-2 text-13 font-bold',
                '[&>option]:bg-background [&>option]:text-foreground',
                country ? 'bg-foreground text-background' : 'bg-background text-foreground',
              )}
            >
              <option value="">{t('milestones.filter.allCountries', 'All countries')}</option>
              {countries.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>

            {hasFilters && (
              <Button variant="link" size="sm" onClick={clearFilters}>
                <X className="me-1 h-3 w-3" aria-hidden />
                {t('milestones.filter.clear', 'Clear filters')}
              </Button>
            )}
          </div>
        </PageContainer>
      </section>

      <EraLineNav counts={eraCounts} />

      <PageContainer>
        {isLoading ? (
          <HistorySkeleton />
        ) : visibleEras.length === 0 ? (
          <div className="bg-muted rounded-container p-8 text-center">
            <p className="font-display text-headline">
              {t('milestones.emptyTitle', 'No service on this stretch of the line')}
            </p>
            <p className="mx-auto mt-2 max-w-reading text-15 text-muted-foreground">
              {t('milestones.empty', 'No milestones match these filters.')}
            </p>
            {hasFilters && (
              <Button variant="outline" size="sm" className="mt-6" onClick={clearFilters}>
                {t('milestones.filter.clear', 'Clear filters')}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-12">
            {visibleEras.map((era) => (
              <EraSection
                key={era.slug}
                era={era}
                spineRows={grouped.get(era.slug) ?? []}
                totalCount={eraCounts?.get(era.slug)}
                filters={filters}
                expanded={showAll || expandedEras.has(era.slug)}
                onToggleExpanded={(next) => {
                  if (showAll) {
                    // Leaving bulk mode from one era: drop ?all and keep others expanded.
                    setParam('all', null);
                    setExpandedEras(
                      new Set(visibleEras.filter((e) => e.slug !== era.slug).map((e) => e.slug)),
                    );
                    return;
                  }
                  setExpandedEras((prev) => {
                    const copy = new Set(prev);
                    if (next) copy.add(era.slug);
                    else copy.delete(era.slug);
                    return copy;
                  });
                }}
              />
            ))}
          </div>
        )}
      </PageContainer>
    </>
  );
}

/**
 * Outlined pulse plates rather than filled grey blocks, and the track stays
 * drawn throughout — the page's spine should never blink out from under the
 * reader while a filter re-runs.
 */
function HistorySkeleton() {
  const { t } = useTranslation();
  return (
    <div className="space-y-12" role="status" aria-label={t('common.loading', 'Loading…')}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i}>
          <div className="border-t border-border-hairline pt-8">
            <div className="h-3 w-24 animate-pulse bg-muted" />
            <div className="mt-2 h-12 w-80 max-w-full animate-pulse bg-muted" />
            <div className="mt-4 h-4 w-full max-w-reading animate-pulse bg-muted" />
          </div>
          <div className="mt-8 grid gap-8 md:grid-cols-2">
            {Array.from({ length: 2 }).map((_, j) => (
              <div key={j} className="h-56 animate-pulse bg-muted" />
            ))}
          </div>
          <div className="relative mt-8">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 start-0 flex w-4 justify-center"
            >
              <span className="w-[3px] bg-foreground/20" />
            </span>
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="py-4 ps-8">
                <div className="h-10 animate-pulse bg-muted" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
