import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowUp, ArrowDown, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { continentOf } from '@/components/pride/PrideFilterRail';
import { ProgrammeSummary } from '@/components/pride/ProgrammeSummary';
import { usePrideProgrammeIndex } from '@/hooks/usePrideProgrammeIndex';
import type { PrideCalendarEvent } from '@/hooks/usePrideCalendar';

interface PrideTableProps {
  events: PrideCalendarEvent[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}

type SortKey = 'date' | 'name' | 'location';

function fmtDate(iso: string, end: string | null): string {
  const s = new Date(iso);
  const e = end ? new Date(end) : null;
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (!e || s.toDateString() === e.toDateString()) return s.toLocaleDateString(undefined, opts);
  return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, opts)}`;
}

export function PrideTable({ events, selectedId, onSelect }: PrideTableProps) {
  const { t } = useTranslation();
  // One batched request for every umbrella on screen, not one per row.
  const parentIds = useMemo(() => events.map((e) => e.id), [events]);
  const { data: programmeByParent } = usePrideProgrammeIndex(parentIds);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortAsc, setSortAsc] = useState(true);

  const sorted = useMemo(() => {
    const arr = [...events];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'date')
        cmp = new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
      else if (sortKey === 'name') cmp = a.title.localeCompare(b.title);
      else if (sortKey === 'location')
        cmp =
          (a.country ?? '').localeCompare(b.country ?? '') ||
          (a.city ?? '').localeCompare(b.city ?? '');
      return sortAsc ? cmp : -cmp;
    });
    return arr;
  }, [events, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  if (events.length === 0) return null;

  const headerBtn = (label: string, key: SortKey, align: 'left' | 'right' = 'left') => (
    <button
      type="button"
      onClick={() => toggleSort(key)}
      className={cn(
        'inline-flex items-center gap-1 text-xs2 uppercase tracking-label text-foreground/60 hover:text-foreground min-h-0',
        align === 'right' && 'flex-row-reverse',
      )}
    >
      {label}
      {sortKey === key &&
        (sortAsc ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
    </button>
  );

  return (
    <section aria-labelledby="alltable-heading">
      <div className="flex items-baseline justify-between mb-4">
        <h2 id="alltable-heading" className="text-title font-medium">
          {t('pride.table.title')}
        </h2>
        <span className="text-xs2 text-muted-foreground">
          {t('pride.table.count', { count: events.length })}
        </span>
      </div>

      <div className="rounded-container bg-background overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th
                scope="col"
                className="py-2 px-4 text-left w-[140px]"
                aria-sort={sortKey === 'date' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
              >
                {headerBtn(t('pride.table.when'), 'date')}
              </th>
              <th
                scope="col"
                className="py-2 px-4 text-left"
                aria-sort={sortKey === 'name' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
              >
                {headerBtn(t('pride.table.pride'), 'name')}
              </th>
              <th
                scope="col"
                className="py-2 px-4 text-left hidden sm:table-cell"
                aria-sort={sortKey === 'location' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
              >
                {headerBtn(t('pride.table.location'), 'location')}
              </th>
              <th scope="col" className="py-2 px-4 text-left hidden lg:table-cell w-[110px]">
                <span className="text-xs2 uppercase tracking-label text-foreground/60">
                  {t('pride.table.region')}
                </span>
              </th>
              <th scope="col" className="py-2 px-2 w-[40px]" aria-label="Flags" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((e) => {
              const isSelected = selectedId === e.id;
              const continent = continentOf(e.country);
              return (
                <tr
                  key={e.id}
                  className={cn(
                    'transition-colors',
                    // Zebra PLATE, not a row rule. A dense table still needs the
                    // eye to track a row across columns, so the separator cannot
                    // just be deleted — but the rebrand's answer to "separate
                    // these" is a filled surface, not a hairline. This row rule
                    // was 41 of the ~131 lines left on /pride.
                    //
                    // Gated on !isSelected because `even:` is a variant and
                    // would otherwise out-order the plain `bg-muted` selection
                    // fill on even rows, i.e. selecting an even row would look
                    // unselected.
                    !isSelected && 'even:bg-surface-container',
                    isSelected ? 'bg-muted' : 'hover:bg-muted/40',
                  )}
                  onClick={() => onSelect?.(isSelected ? null : e.id)}
                  aria-selected={isSelected}
                >
                  <td className="py-2 px-4 align-top whitespace-nowrap tabular-nums">
                    <span className="text-sm">{fmtDate(e.start_date, e.end_date)}</span>
                    {e.verification_status !== 'verified' && (
                      <span className="block text-2xs text-muted-foreground">
                        {t('pride.table.estimated')}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-4 align-top">
                    <Link
                      to={`/events/${e.slug}`}
                      onClick={(ev) => ev.stopPropagation()}
                      className="font-medium hover:underline"
                    >
                      {e.title}
                    </Link>
                    <span className="block text-xs2 text-foreground/60 sm:hidden">
                      {[e.city, e.country].filter(Boolean).join(', ')}
                    </span>
                    {/* What the span in the date column actually contains. A
                        bare "3 – 6 Jul" cannot tell a reader whether the parade
                        is on the Saturday or the Sunday. */}
                    <ProgrammeSummary
                      entries={programmeByParent?.get(e.id) ?? []}
                      className="block text-xs2 text-muted-foreground"
                    />
                  </td>
                  <td className="py-2 px-4 align-top text-foreground/80 hidden sm:table-cell">
                    {[e.city, e.country].filter(Boolean).join(', ')}
                  </td>
                  <td className="py-2 px-4 align-top text-foreground/70 hidden lg:table-cell">
                    {t(`pride.continents.${continent}` as 'pride.continents.Europe')}
                  </td>
                  <td className="py-2 px-2 align-top text-right">
                    {e.is_featured && (
                      <Star
                        className="inline size-3.5 fill-foreground text-foreground"
                        aria-label={t('pride.featured')}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
