import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useMeta } from '@/hooks/useMeta';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import {
  useMilestonesTimeline,
  useMilestoneYearCounts,
} from '@/hooks/useMilestones';
import { HISTORY_ERAS } from '@/config/historyEras';
import { groupMilestonesByEra, sumEraCounts } from '@/lib/historyEraGrouping';
import { EraJumpNav } from '@/components/milestones/EraJumpNav';
import { EraSection } from '@/components/milestones/EraSection';
import { OnThisDayBand } from '@/components/milestones/OnThisDayBand';
import { MILESTONE_CATEGORIES, milestoneCategoryLabelKey } from '@/types/milestone';
import { cn } from '@/lib/utils';

const IMPACTS = ['positive', 'neutral', 'negative'] as const;

/**
 * /history — the queer-history timeline as curated era chapters. One slim
 * server-filtered spine fetch (significance>=4, ~450 rows) plus a per-year
 * histogram for era counts; each era expands on demand to its full chronology.
 * Persecution content is heavy — this page stays motion-free (safety-adjacent).
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
  useBreadcrumbs(
    useMemo(() => [{ label: t('milestones.breadcrumb', 'History') }], [t]),
  );

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
  const hasFilters = Boolean(country || category || impact || showAll);

  const visibleEras = HISTORY_ERAS.filter((era) => {
    const spineRows = grouped.get(era.slug) ?? [];
    const count = eraCounts?.get(era.slug);
    return spineRows.length > 0 || (count ?? 0) > 0;
  });

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Editorial hero */}
      <header className="mb-10 max-w-3xl">
        <p className="text-2xs uppercase tracking-wider text-muted-foreground">
          {t('milestones.eyebrow', 'Queer history')}
        </p>
        <h1 className="mt-2 font-display text-display font-semibold md:text-hero">
          {t('milestones.pageTitle', 'Queer history')}
        </h1>
        <p className="mt-4 max-w-prose text-body-lg leading-relaxed text-muted-foreground">
          {t(
            'milestones.pageDescription',
            'Milestones that shaped LGBTQ+ life — uprisings, laws, setbacks. Dated and sourced.',
          )}
        </p>
        {totalCount > 0 && (
          <p className="mt-2 text-13 text-muted-foreground">
            {t('milestones.stats', '{{count}} milestones across {{eras}} eras', {
              count: totalCount,
              eras: visibleEras.length,
            })}
          </p>
        )}
      </header>

      <OnThisDayBand />

      {/* Filters — chip rows, URL-driven */}
      <div className="mb-6 space-y-2">
        <div className="flex flex-wrap gap-2">
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
          <FilterChip
            active={!showAll}
            label={t('milestones.filter.major', 'Major milestones')}
            onClick={() => setParam('all', showAll ? null : '1')}
          />
          <FilterChip
            active={showAll}
            label={t('milestones.filter.showAll', 'All milestones')}
            onClick={() => setParam('all', showAll ? null : '1')}
          />
          {IMPACTS.map((i) => (
            <FilterChip
              key={i}
              active={impact === i}
              label={t(`milestones.impact.${i}`)}
              onClick={() => setParam('impact', impact === i ? null : i)}
            />
          ))}
          <select
            value={country ?? ''}
            onChange={(e) => setParam('country', e.target.value || null)}
            aria-label={t('milestones.filter.country', 'Country')}
            className="h-8 rounded-element border border-border bg-background px-2 text-13"
          >
            <option value="">{t('milestones.filter.allCountries', 'All countries')}</option>
            {countries.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={() => setParams({}, { replace: true })}>
              <X className="mr-1 h-3 w-3" aria-hidden />
              {t('milestones.filter.clear', 'Clear filters')}
            </Button>
          )}
        </div>
      </div>

      <EraJumpNav counts={eraCounts} />

      {isLoading ? (
        <div className="space-y-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-4">
              <Skeleton variant="rectangular" height={32} width={280} className="rounded-element" />
              <Skeleton variant="rectangular" height={180} className="rounded-container" />
            </div>
          ))}
        </div>
      ) : visibleEras.length === 0 ? (
        <p className="py-12 text-muted-foreground">
          {t('milestones.empty', 'No milestones match these filters.')}
        </p>
      ) : (
        <div className="space-y-16">
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
                  setExpandedEras(new Set(visibleEras.filter((e) => e.slug !== era.slug).map((e) => e.slug)));
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
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-badge border px-2 py-1 text-13 transition-colors',
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}
