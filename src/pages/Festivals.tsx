import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { PageContainer } from '@/components/layout/PageContainer';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { useMeta } from '@/hooks/useMeta';
import { useFestivalDirectory, type FestivalEdition } from '@/hooks/useFestivals';

/**
 * /festivals — every festival and Pride with an edition still to come, by month.
 *
 * One row per BRAND (public.festivals), showing its next edition. The editions'
 * own sub-events stay on the edition page; this page answers "what is coming up
 * and when", which the events feed cannot, because it mixes a five-day festival
 * with a Tuesday quiz night.
 */

const TYPES = ['pride', 'festival', 'fetish', 'film', 'other'] as const;
type TypeFilter = (typeof TYPES)[number] | 'all';

function dateSpan(e: FestivalEdition): string {
  const s = new Date(e.start_date);
  const end = new Date(e.end_date ?? e.start_date);
  if (format(s, 'yyyy-MM-dd') === format(end, 'yyyy-MM-dd')) return format(s, 'd MMM');
  return format(s, 'MMM') === format(end, 'MMM')
    ? `${format(s, 'd')}–${format(end, 'd MMM')}`
    : `${format(s, 'd MMM')} – ${format(end, 'd MMM')}`;
}

export default function Festivals() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useFestivalDirectory();
  const [type, setType] = useState<TypeFilter>('all');

  useMeta({
    title: t('festivals.metaTitle', 'LGBTQ+ festivals and Prides | Queer Guide'),
    description: t(
      'festivals.metaDescription',
      'Prides, leather weekends, bear weeks, film festivals and queer festivals worldwide, with dates and full programmes.',
    ),
    canonicalPath: '/festivals',
  });

  const typeLabel = (v: TypeFilter) =>
    ({
      all: t('festivals.type.all', 'All'),
      pride: t('festivals.type.pride', 'Pride'),
      festival: t('festivals.type.festival', 'Festival'),
      fetish: t('festivals.type.fetish', 'Leather & fetish'),
      film: t('festivals.type.film', 'Film'),
      other: t('festivals.type.other', 'Other'),
    })[v];

  const rows = useMemo(
    () =>
      (data ?? []).filter((r) =>
        type === 'all'
          ? true
          : type === 'other'
            ? !TYPES.slice(0, 4).includes(r.festival.festival_type as never)
            : r.festival.festival_type === type,
      ),
    [data, type],
  );

  const months = useMemo(() => {
    const out = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = format(new Date(r.next.start_date), 'yyyy-MM');
      const bucket = out.get(key);
      if (bucket) bucket.push(r);
      else out.set(key, [r]);
    }
    return [...out.entries()];
  }, [rows]);

  return (
    <PageContainer>
      <Eyebrow>{t('festivals.eyebrow', 'Festivals')}</Eyebrow>
      <h1 className="text-display font-display">{t('festivals.title', 'Festivals and Prides')}</h1>
      <p className="mt-4 max-w-reading text-body-lg text-muted-foreground">
        {t(
          'festivals.intro',
          'Every festival with dates still to come, by month. Each one opens its full programme: parties, parades, workshops and screenings.',
        )}
      </p>

      <div
        role="group"
        aria-label={t('festivals.filterLabel', 'Type')}
        className="mt-8 flex flex-wrap gap-2"
      >
        {(['all', ...TYPES] as TypeFilter[]).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={type === v}
            onClick={() => setType(v)}
            className={
              type === v
                ? 'rounded-badge bg-foreground px-4 py-1 text-13 font-bold text-background'
                : 'rounded-badge px-4 py-1 text-13 text-muted-foreground hover:text-foreground'
            }
          >
            {typeLabel(v)}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="mt-12 flex justify-center">
          <TrackLoader />
        </div>
      )}
      {isError && (
        <p className="mt-12 text-body-lg">
          {t('festivals.loadFailed', 'This data could not be loaded right now.')}
        </p>
      )}
      {!isLoading && !isError && rows.length === 0 && (
        <p className="mt-12 text-body-lg">
          {t('festivals.empty', 'No festivals of this type yet.')}
        </p>
      )}

      {months.map(([month, group]) => (
        <section key={month} aria-labelledby={`festivals-${month}`} className="mt-12">
          <h2 id={`festivals-${month}`} className="text-headline font-display">
            {format(new Date(group[0].next.start_date), 'MMMM yyyy')}
          </h2>
          <ul className="mt-4 list-none p-0">
            {group.map(({ festival: f, next }) => (
              <li key={f.id} className="relative border-b border-border-hairline">
                <div className="flex items-baseline gap-4 py-4">
                  <span className="w-24 shrink-0 text-13 tabular-nums text-muted-foreground">
                    {dateSpan(next)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{f.name}</span>
                    <span className="block text-13 text-muted-foreground">
                      {[f.city, f.country].filter(Boolean).join(', ')}
                    </span>
                  </span>
                  {next.programme_size ? (
                    <span className="shrink-0 text-13 text-muted-foreground">
                      {t('festivals.editionEvents', { count: next.programme_size })}
                    </span>
                  ) : null}
                </div>
                {/* Row-wide link as an overlay sibling, never a wrapper. */}
                <LocalizedLink
                  to={`/festivals/${f.slug}`}
                  aria-label={f.name}
                  className="absolute inset-0 rounded-element no-underline"
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </PageContainer>
  );
}
