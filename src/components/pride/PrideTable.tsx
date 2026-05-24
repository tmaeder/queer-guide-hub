import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ArrowUp, ArrowDown, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { continentOf } from '@/components/pride/PrideFilterRail';
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
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortAsc, setSortAsc] = useState(true);

  const sorted = useMemo(() => {
    const arr = [...events];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'date') cmp = new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
      else if (sortKey === 'name') cmp = a.title.localeCompare(b.title);
      else if (sortKey === 'location')
        cmp = (a.country ?? '').localeCompare(b.country ?? '') ||
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
      {sortKey === key && (sortAsc ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
    </button>
  );

  return (
    <section aria-labelledby="alltable-heading">
      <div className="flex items-baseline justify-between mb-3">
        <h2 id="alltable-heading" className="text-title font-medium">
          All prides
        </h2>
        <span className="text-xs2 text-foreground/50">
          {events.length} pride{events.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="rounded-container border border-foreground/15 bg-background overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th
                scope="col"
                className="py-2 px-3 text-left w-[140px]"
                aria-sort={sortKey === 'date' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
              >
                {headerBtn('When', 'date')}
              </th>
              <th
                scope="col"
                className="py-2 px-3 text-left"
                aria-sort={sortKey === 'name' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
              >
                {headerBtn('Pride', 'name')}
              </th>
              <th
                scope="col"
                className="py-2 px-3 text-left hidden sm:table-cell"
                aria-sort={sortKey === 'location' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
              >
                {headerBtn('Location', 'location')}
              </th>
              <th scope="col" className="py-2 px-3 text-left hidden lg:table-cell w-[110px]">
                <span className="text-xs2 uppercase tracking-label text-foreground/60">Region</span>
              </th>
              <th scope="col" className="py-2 px-2 w-[40px]" aria-label="Flags" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((e, idx) => {
              const isSelected = selectedId === e.id;
              const continent = continentOf(e.country);
              return (
                <tr
                  key={e.id}
                  className={cn(
                    'border-t border-foreground/10 transition-colors',
                    idx === 0 && 'border-t-0',
                    isSelected ? 'bg-muted' : 'hover:bg-muted/40',
                  )}
                  onClick={() => onSelect?.(isSelected ? null : e.id)}
                  aria-selected={isSelected}
                >
                  <td className="py-2 px-3 align-top whitespace-nowrap tabular-nums">
                    <span className="text-sm">{fmtDate(e.start_date, e.end_date)}</span>
                    {e.verification_status !== 'verified' && (
                      <span className="block text-2xs text-foreground/50">Estimated</span>
                    )}
                  </td>
                  <td className="py-2 px-3 align-top">
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
                  </td>
                  <td className="py-2 px-3 align-top text-foreground/80 hidden sm:table-cell">
                    {[e.city, e.country].filter(Boolean).join(', ')}
                  </td>
                  <td className="py-2 px-3 align-top text-foreground/70 hidden lg:table-cell">
                    {continent}
                  </td>
                  <td className="py-2 px-2 align-top text-right">
                    {e.is_featured && (
                      <Star className="inline size-3.5 fill-foreground text-foreground" aria-label="Featured" />
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
