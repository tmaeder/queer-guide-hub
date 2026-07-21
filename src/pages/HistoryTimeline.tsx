import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useMeta } from '@/hooks/useMeta';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { useMilestonesTimeline } from '@/hooks/useMilestones';
import { milestoneDecade } from '@/lib/milestoneDate';
import { MilestoneRow } from '@/components/milestones/MilestoneRow';
import { MILESTONE_CATEGORIES, milestoneCategoryLabelKey, type Milestone } from '@/types/milestone';
import { cn } from '@/lib/utils';

const IMPACTS = ['positive', 'neutral', 'negative'] as const;

/**
 * /history — the queer-history timeline. All published milestones (~110 at
 * launch) are fetched once and filtered client-side; URL params keep filters
 * shareable. Switch to server-side RPC filters + year-range windowing when the
 * dataset outgrows the 500-row RPC cap. Persecution content is heavy — this
 * page stays motion-free (safety-adjacent).
 */
export default function HistoryTimeline() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const { data, isLoading } = useMilestonesTimeline({}, 4000);

  const country = params.get('country');
  const category = params.get('category');
  const impact = params.get('impact');
  // Default to major milestones (significance >= 4) — the full set is several
  // thousand rows; "All" opts into the complete chronology.
  const showAll = params.get('all') === '1';

  useMeta({
    title: t('milestones.metaTitle', 'Queer history timeline — Queer Guide'),
    description: t(
      'milestones.metaDescription',
      'Milestones of LGBTQ+ history: uprisings, decriminalizations, marriage equality and setbacks — dated, sourced, worldwide.',
    ),
    canonicalPath: '/history',
  });
  useBreadcrumbs(
    useMemo(
      () => [
        { label: t('nav.home', 'Home'), href: '/' },
        { label: t('milestones.breadcrumb', 'History') },
      ],
      [t],
    ),
  );

  const milestones = useMemo(() => {
    let rows = data ?? [];
    if (!showAll) rows = rows.filter((m) => m.significance >= 4);
    if (country) rows = rows.filter((m) => (m.country?.slug ?? m.country_name) === country);
    if (category) rows = rows.filter((m) => m.category === category);
    if (impact) rows = rows.filter((m) => m.impact === impact);
    return rows;
  }, [data, showAll, country, category, impact]);

  const countries = useMemo(() => {
    const seen = new Map<string, string>();
    for (const m of data ?? []) {
      const key = m.country?.slug ?? m.country_name;
      const label = m.country?.name ?? m.country_name;
      if (key && label && !seen.has(key)) seen.set(key, label);
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  const decades = useMemo(() => {
    const map = new Map<number, Milestone[]>();
    for (const m of milestones) {
      const d = milestoneDecade(m.date);
      const list = map.get(d) ?? [];
      list.push(m);
      map.set(d, list);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [milestones]);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const hasFilters = Boolean(country || category || impact || showAll);

  return (
    <div className="container mx-auto px-4 py-8">
      <PageHeader
        title={t('milestones.pageTitle', 'Queer history')}
        description={t(
          'milestones.pageDescription',
          'Milestones that shaped LGBTQ+ life — uprisings, laws, setbacks. Dated and sourced.',
        )}
      />

      {/* Filters — chip rows, URL-driven */}
      <div className="mb-8 space-y-2">
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
            {countries.map(([key, label]) => (
              <option key={key} value={key}>
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

      {/* Decade jump strip */}
      {decades.length > 1 && (
        <nav
          aria-label={t('milestones.decadeNav', 'Jump to decade')}
          className="mb-8 flex gap-4 overflow-x-auto border-b border-border pb-2"
        >
          {decades.map(([decade]) => (
            <a
              key={decade}
              href={`#decade-${decade}`}
              className="shrink-0 text-13 font-medium text-muted-foreground hover:text-foreground"
            >
              {decade}s
            </a>
          ))}
        </nav>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={64} className="rounded-container" />
          ))}
        </div>
      ) : milestones.length === 0 ? (
        <p className="py-12 text-muted-foreground">
          {t('milestones.empty', 'No milestones match these filters.')}
        </p>
      ) : (
        <div className="space-y-12">
          {decades.map(([decade, items]) => (
            <section key={decade} id={`decade-${decade}`} className="scroll-mt-20">
              <h2 className="sticky top-[56px] z-10 -mx-4 mb-6 border-b border-border bg-background px-4 py-2 font-display text-headline font-semibold md:top-[64px]">
                {decade}s
              </h2>
              <div className="relative ml-1.5 space-y-8 border-l border-border pl-6">
                {items.map((m) => (
                  <MilestoneRow key={m.id} milestone={m} className="-ml-[31px]" />
                ))}
              </div>
            </section>
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
