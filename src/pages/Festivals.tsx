import { Fragment, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { PageContainer, STICKY_UNDER_HEADER } from '@/components/layout/PageContainer';
import { FestivalCard } from '@/components/festivals/FestivalCard';
import { useFestivalTypeLabels } from '@/components/festivals/useFestivalTypeLabel';
import { Search, X } from '@/components/icons';
import { FilterChip } from '@/components/transit/FilterChip';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { Button } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Input } from '@/components/ui/input';
import { dateFnsLocaleFor } from '@/i18n/dateFnsLocale';
import { useFestivalDirectory, type Festival, type FestivalEdition } from '@/hooks/useFestivals';
import { useMeta } from '@/hooks/useMeta';
import {
  FESTIVAL_TYPES,
  countryName,
  festivalTiming,
  festivalTypeKey,
  type FestivalTypeKey,
} from '@/lib/festivals';
import { cn } from '@/lib/utils';

/**
 * /festivals — every festival and Pride with an edition still to come.
 *
 * One card per BRAND (public.festivals), showing its next edition. Editions
 * running today lead; the rest are grouped by the month they start, with a
 * month strip to jump through a year of dates. Type and search live in the
 * URL (`?type=pride&q=berlin`) so a filtered view can be shared.
 */

type Row = { festival: Festival; next: FestivalEdition };
type TypeFilter = FestivalTypeKey | 'all';

const monthKey = (iso: string) => iso.slice(0, 7);

export default function Festivals() {
  const { t, i18n } = useTranslation();
  const locale = dateFnsLocaleFor(i18n.language);
  const typeLabel = useFestivalTypeLabels();
  const { data, isLoading, isError } = useFestivalDirectory();
  const [params, setParams] = useSearchParams();

  const rawType = params.get('type');
  const type: TypeFilter =
    rawType && (FESTIVAL_TYPES as readonly string[]).includes(rawType)
      ? (rawType as FestivalTypeKey)
      : 'all';
  const q = params.get('q') ?? '';

  const setParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  useMeta({
    title: t('festivals.metaTitle', 'LGBTQ+ festivals and Prides | Queer Guide'),
    description: t(
      'festivals.metaDescription',
      'Prides, leather weekends, bear weeks, film festivals and queer festivals worldwide, with dates and full programmes.',
    ),
    canonicalPath: '/festivals',
  });

  const all = useMemo(() => data ?? [], [data]);

  // Counts per type follow the search, so a chip never promises rows the
  // current search has already hidden.
  const searched = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase();
    if (!needle) return all;
    return all.filter(({ festival: f }) =>
      [f.name, f.city, f.country, countryName(f.country, i18n.language)]
        .filter(Boolean)
        .some((v) => (v as string).toLocaleLowerCase().includes(needle)),
    );
  }, [all, q, i18n.language]);

  const counts = useMemo(() => {
    const c = Object.fromEntries([
      ...FESTIVAL_TYPES.map((k) => [k, 0] as const),
      ['all', searched.length] as const,
    ]) as Record<TypeFilter, number>;
    for (const r of searched) c[festivalTypeKey(r.festival.festival_type)] += 1;
    return c;
  }, [searched]);

  const rows = useMemo(
    () =>
      type === 'all'
        ? searched
        : searched.filter((r) => festivalTypeKey(r.festival.festival_type) === type),
    [searched, type],
  );

  const { onNow, months } = useMemo(() => {
    const now: Row[] = [];
    const byMonth = new Map<string, Row[]>();
    for (const r of rows) {
      if (festivalTiming(r.next).kind === 'now') {
        now.push(r);
        continue;
      }
      const key = monthKey(r.next.start_date);
      const bucket = byMonth.get(key);
      if (bucket) bucket.push(r);
      else byMonth.set(key, [r]);
    }
    return { onNow: now, months: [...byMonth.entries()] };
  }, [rows]);

  const filtered = type !== 'all' || q.trim() !== '';
  const monthLabel = (key: string) =>
    format(new Date(`${key}-15T12:00:00`), 'MMMM yyyy', { locale });
  const monthShort = (key: string) => format(new Date(`${key}-15T12:00:00`), 'MMM', { locale });

  return (
    <>
      <PageContainer className="pb-6 md:pb-8">
        <Eyebrow>{t('festivals.eyebrow', 'Festivals')}</Eyebrow>
        <h1 className="mt-2 font-display text-display leading-none md:text-hero">
          {t('festivals.title', 'Festivals and Prides')}
        </h1>
        <p className="mt-4 max-w-reading text-body-lg text-muted-foreground">
          {t(
            'festivals.intro',
            'Prides, leather weekends, bear weeks and film festivals with dates still to come. Each one opens its programme: parties, parades, workshops and screenings.',
          )}
        </p>
        {!isLoading && all.length > 0 && (
          <p className="mt-4 text-13 font-bold">
            {t('festivals.summary', { count: all.length })}
            {onNow.length > 0 && !filtered && (
              <span className="font-normal text-muted-foreground">
                {' · '}
                {t('festivals.summaryNow', { count: onNow.length })}
              </span>
            )}
          </p>
        )}
      </PageContainer>

      {/* ---- Control band: search, type, month strip ----------------------- */}
      <div
        className={cn(
          'sticky z-20 border-b border-border-hairline bg-background',
          STICKY_UNDER_HEADER,
        )}
      >
        <PageContainer flush className="flex flex-col gap-2 py-2 md:py-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
            <div className="relative md:w-72 md:shrink-0">
              <Search
                size={16}
                aria-hidden
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                value={q}
                onChange={(e) => setParam('q', e.target.value || null)}
                placeholder={t('festivals.searchPlaceholder', 'Festival, city or country')}
                aria-label={t('festivals.searchLabel', 'Search festivals')}
                className="pl-10"
              />
            </div>
            <div
              role="group"
              aria-label={t('festivals.filterLabel', 'Type')}
              className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:pb-0"
            >
              {(['all', ...FESTIVAL_TYPES] as TypeFilter[]).map((v) => (
                <FilterChip
                  key={v}
                  active={type === v}
                  disabled={v !== 'all' && counts[v] === 0 && type !== v}
                  onClick={() => setParam('type', v === 'all' ? null : v)}
                  label={
                    <>
                      {typeLabel(v)}
                      <span
                        className={cn(
                          'tabular-nums font-normal',
                          type === v ? 'text-background/70' : 'text-muted-foreground',
                        )}
                      >
                        {counts[v]}
                      </span>
                    </>
                  }
                  className="disabled:opacity-40"
                />
              ))}
            </div>
          </div>

          {months.length > 1 && (
            <nav
              aria-label={t('festivals.monthNav', 'Jump to month')}
              className="-mx-1 flex gap-1 overflow-x-auto px-1"
            >
              {onNow.length > 0 && (
                <a
                  href="#festivals-now"
                  className="shrink-0 rounded-badge px-2 py-1 text-13 font-bold no-underline hover:bg-muted"
                >
                  {t('festivals.onNowShort', 'Now')}
                </a>
              )}
              {months.map(([key, group], i) => {
                const year = key.slice(0, 4);
                const newYear =
                  year !==
                  (i === 0 ? String(new Date().getFullYear()) : months[i - 1][0].slice(0, 4));
                return (
                  <Fragment key={key}>
                    {newYear && (
                      <span
                        aria-hidden
                        className="shrink-0 self-center px-1 text-2xs font-bold uppercase tracking-label text-muted-foreground"
                      >
                        {year}
                      </span>
                    )}
                    <a
                      href={`#festivals-${key}`}
                      aria-label={`${monthLabel(key)}, ${t('festivals.count', { count: group.length })}`}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-badge px-2 py-1 text-13 no-underline hover:bg-muted"
                    >
                      <span className="font-bold">{monthShort(key)}</span>
                      <span className="rounded-badge bg-muted px-1.5 text-2xs font-bold tabular-nums text-muted-foreground">
                        {group.length}
                      </span>
                    </a>
                  </Fragment>
                );
              })}
            </nav>
          )}
        </PageContainer>
      </div>

      <PageContainer className="pt-8">
        {isLoading && (
          <div className="flex justify-center py-12">
            <TrackLoader />
          </div>
        )}
        {isError && (
          <p className="text-body-lg">
            {t('festivals.loadFailed', 'This data could not be loaded right now.')}
          </p>
        )}
        {!isLoading && !isError && rows.length === 0 && (
          <div className="flex flex-col items-start gap-4 py-8">
            <p className="text-body-lg">
              {filtered
                ? t('festivals.emptyFiltered', 'No festivals match this search.')
                : t('festivals.empty', 'No festivals of this type yet.')}
            </p>
            {filtered && (
              <Button variant="outline" onClick={() => setParams({}, { replace: true })}>
                <X size={16} aria-hidden />
                {t('festivals.clearFilters', 'Clear filters')}
              </Button>
            )}
          </div>
        )}

        <div className="flex flex-col gap-12">
          {onNow.length > 0 && (
            <FestivalGroup
              id="festivals-now"
              title={t('festivals.onNow', 'On now')}
              count={onNow.length}
              rows={onNow}
              priority
            />
          )}
          {months.map(([key, group], i) => (
            <FestivalGroup
              key={key}
              id={`festivals-${key}`}
              title={monthLabel(key)}
              count={group.length}
              rows={group}
              priority={onNow.length === 0 && i === 0}
            />
          ))}
        </div>
      </PageContainer>
    </>
  );
}

function FestivalGroup({
  id,
  title,
  count,
  rows,
  priority = false,
}: {
  id: string;
  title: string;
  count: number;
  rows: Row[];
  priority?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby={`${id}-h`} className="scroll-mt-40">
      <div className="flex items-baseline gap-4 border-b border-border-hairline pb-2">
        <h2 id={`${id}-h`} className="font-display text-headline leading-tight">
          {title}
        </h2>
        <span className="text-13 text-muted-foreground">{t('festivals.count', { count })}</span>
      </div>
      <ul className="mt-6 grid list-none grid-cols-1 gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {rows.map(({ festival, next }, i) => (
          <li key={festival.id} className="min-w-0">
            <FestivalCard festival={festival} edition={next} priority={priority && i < 4} />
          </li>
        ))}
      </ul>
    </section>
  );
}
