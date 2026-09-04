import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FilterChip } from '@/components/transit/FilterChip';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TransViolenceRecord } from '@/lib/rights/transSafety';
import {
  TMM_BAND_LABEL,
  TMM_BAND_ORDER,
  bandOf,
  matchesBand,
  type TmmBand,
} from '@/lib/rights/tmmCoverage';

/**
 * The TGEU documented-violence table.
 *
 * THE DEFAULT SORT IS ALPHABETICAL, and that is the one decision in this file
 * worth defending. The table shipped sorted by case count descending, which
 * put Brazil, Mexico and the United States at the top — and a list of
 * countries ordered by killings, read top-down, is a danger ranking. It is
 * very nearly the inverse of one: 95.8% of every case ever recorded is in a
 * country that does not criminalise same-sex acts, and 45 of the 67 that do
 * have recorded nothing at all.
 *
 * A reader can still opt into that ordering — the intent is not to hide the
 * magnitudes — but they have to ask for it, and while it is on, the caption
 * says in words what the ordering is and is not.
 *
 * Everything else follows `RightsCountryTable`: search, one scrolling chip
 * line, a row window with "Show all N" and NO inner scrollbox (crisis-adjacent
 * page — no trapped scroll). No colour anywhere: `--destructive` is reserved
 * for criminalisation, and colouring Brazil's count with it IS the inversion.
 */

const WINDOW = 20;

type CasesSort = 'none' | 'desc' | 'asc';

export interface TmmRow {
  id: string;
  name: string;
  slug: string | null;
  record: TransViolenceRecord;
}

/**
 * Per-period bars normalised to THIS row's own maximum, never to the table's.
 * The panel shows when a country's recorded cases fell, which is a shape worth
 * seeing; scaling it against Brazil would make every other country's history a
 * flat line and re-introduce the cross-country comparison the table avoids.
 */
function PeriodBreakdown({ record, label }: { record: TransViolenceRecord; label: string }) {
  const max = Math.max(...record.byPeriod.map((p) => p.cases), 1);
  return (
    <div className="px-4 py-4">
      <p className="mb-4 text-13 text-muted-foreground">{label}</p>
      <ul className="m-0 flex list-none flex-col gap-1 p-0 sm:max-w-md">
        {record.byPeriod.map((p) => (
          <li key={p.period} className="flex items-center gap-4 text-13">
            <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{p.period}</span>
            <span aria-hidden="true" className="inline-block h-1 flex-1 bg-muted">
              <span
                className="block h-full bg-foreground/60"
                style={{ width: `${(p.cases / max) * 100}%` }}
              />
            </span>
            <span className="w-8 shrink-0 text-right tabular-nums">{p.cases}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TmmCountryTable({
  rows,
  latestPeriod,
}: {
  rows: TmmRow[];
  latestPeriod: string | null;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [band, setBand] = useState<TmmBand>('all');
  const [showAll, setShowAll] = useState(false);
  const [casesSort, setCasesSort] = useState<CasesSort>('none');
  const [expanded, setExpanded] = useState<string | null>(null);

  // Reset the window during render so "Show all N" always names the CURRENT
  // result set — an effect would paint the new set with the old window for one
  // frame. Lifted from RightsCountryTable.
  const viewKey = `${band} ${search}`;
  const [prevViewKey, setPrevViewKey] = useState(viewKey);
  if (viewKey !== prevViewKey) {
    setPrevViewKey(viewKey);
    setShowAll(false);
  }

  const counts = useMemo(() => {
    const out: Record<TmmBand, number> = {
      all: rows.length,
      latest: 0,
      '1-4': 0,
      '5-19': 0,
      '20-99': 0,
      '100+': 0,
    };
    for (const r of rows) {
      if (matchesBand(r.record, 'latest', latestPeriod)) out.latest += 1;
      const b = bandOf(r.record);
      if (b) out[b] += 1;
    }
    return out;
  }, [rows, latestPeriod]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        matchesBand(r.record, band, latestPeriod) && (q === '' || r.name.toLowerCase().includes(q)),
    );
  }, [rows, band, search, latestPeriod]);

  // Alphabetical by default. `localeCompare` rather than the fetch order, so
  // the ordering is the reader's alphabet and not the API's.
  const sorted = useMemo(() => {
    const byName = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    if (casesSort === 'none') return byName;
    const dir = casesSort === 'desc' ? -1 : 1;
    return byName.sort((a, b) => dir * ((a.record.total ?? 0) - (b.record.total ?? 0)));
  }, [filtered, casesSort]);

  const visible = showAll ? sorted : sorted.slice(0, WINDOW);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 md:gap-4">
        <div className="min-w-0 flex-1 md:max-w-[480px]">
          <Input
            type="search"
            aria-label={t('rights.trans.table.search', 'Search countries')}
            placeholder={t('rights.trans.table.searchPlaceholder', 'Search countries…')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label={t('rights.trans.table.filter', 'Filter by how many cases were documented')}
        >
          {TMM_BAND_ORDER.map((key) => (
            <FilterChip
              key={key}
              active={band === key}
              onClick={() => setBand(key)}
              className="whitespace-nowrap"
              label={`${
                key === 'latest' && latestPeriod
                  ? latestPeriod
                  : t(`rights.trans.band.${key}`, TMM_BAND_LABEL[key])
              } ${counts[key]}`}
            />
          ))}
        </div>
      </div>

      <Table>
        <caption className="sr-only">
          {t(
            'rights.trans.table.caption',
            'Countries where TGEU has documented anti-trans killings since 2008, listed alphabetically.',
          )}
        </caption>
        <TableHeader>
          <TableRow>
            <TableHead>{t('rights.trans.table.country', 'Country')}</TableHead>
            <TableHead
              className="text-right"
              aria-sort={
                casesSort === 'desc' ? 'descending' : casesSort === 'asc' ? 'ascending' : 'none'
              }
            >
              <button
                type="button"
                aria-label={t('rights.trans.table.sort', 'Sort by number of cases documented')}
                onClick={() =>
                  setCasesSort((s) => (s === 'none' ? 'desc' : s === 'desc' ? 'asc' : 'none'))
                }
                className="-mx-2 px-2 py-2 font-medium hover:text-foreground"
              >
                {t('rights.trans.table.since', 'Recorded since 2008')}
                {casesSort === 'desc' ? ' ↓' : casesSort === 'asc' ? ' ↑' : ''}
              </button>
            </TableHead>
            <TableHead className="text-right">
              {t('rights.trans.table.latest', 'Most recent period')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((r) => {
            const isOpen = expanded === r.id;
            const panelId = `tmm-periods-${r.id}`;
            return [
              <TableRow key={r.id}>
                <TableCell className="font-medium" style={{ padding: 0 }}>
                  <div className="flex items-center">
                    {r.record.byPeriod.length > 0 ? (
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                        aria-label={t(
                          'rights.trans.table.expand',
                          'Show year by year for {{name}}',
                          {
                            name: r.name,
                          },
                        )}
                        onClick={() => setExpanded(isOpen ? null : r.id)}
                        className="shrink-0 px-2 py-4"
                      >
                        {isOpen ? (
                          <ChevronDown size={14} aria-hidden="true" />
                        ) : (
                          <ChevronRight size={14} aria-hidden="true" />
                        )}
                      </button>
                    ) : (
                      <span className="w-8 shrink-0" />
                    )}
                    {r.slug ? (
                      <LocalizedLink
                        to={`/country/${r.slug}`}
                        className="block flex-1 py-4 pr-4 no-underline hover:underline"
                      >
                        {r.name}
                      </LocalizedLink>
                    ) : (
                      <span className="block flex-1 py-4 pr-4">{r.name}</span>
                    )}
                  </div>
                </TableCell>
                {/* No colour, no scale: see the file header. */}
                <TableCell className="text-right tabular-nums">{r.record.total}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {r.record.latestPeriod
                    ? `${r.record.latestCases} · ${r.record.latestPeriod}`
                    : '—'}
                </TableCell>
              </TableRow>,
              isOpen ? (
                <TableRow key={`${r.id}-periods`}>
                  <TableCell colSpan={3} style={{ padding: 0 }} id={panelId}>
                    <PeriodBreakdown
                      record={r.record}
                      label={t(
                        'rights.trans.table.periodNote',
                        'Each bar is scaled to this country’s own highest period, not to other countries.',
                      )}
                    />
                  </TableCell>
                </TableRow>
              ) : null,
            ];
          })}
        </TableBody>
      </Table>

      {/* Stated only while the ordering is active — a permanent disclaimer
          under an alphabetical table trains readers to skip it. */}
      {casesSort !== 'none' ? (
        <p className={cn('mt-4 max-w-prose text-13 font-medium')}>
          {t(
            'rights.trans.table.sortedNote',
            'Sorted by how many cases were documented. That is an ordering of documentation, not of danger — the countries near the top are largely the ones with trans-led organisations that count.',
          )}
        </p>
      ) : null}

      {!showAll && sorted.length > WINDOW ? (
        <div className="mt-4">
          <Button variant="outline" onClick={() => setShowAll(true)}>
            {t('rights.trans.table.showAll', 'Show all {{n}} countries', { n: sorted.length })}
          </Button>
        </div>
      ) : null}
      {sorted.length === 0 ? (
        <p className="mt-4 text-muted-foreground">
          {t('rights.trans.table.empty', 'No country matches.')}
        </p>
      ) : null}
    </div>
  );
}

export default TmmCountryTable;
