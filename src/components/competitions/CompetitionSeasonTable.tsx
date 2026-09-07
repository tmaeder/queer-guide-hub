import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FilterChip } from '@/components/transit/FilterChip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Competition, CompetitionKind } from '@/types/competition';

import { compareNullable, formatAired, formatList } from './formatters';

/**
 * One row per EDITION, not per competition.
 *
 * A competition is a franchise and carries no dates, no entrant count and no
 * winner of its own — every fact a reader wants is on the edition. So the table
 * flattens, and the competition name is repeated down the column rather than
 * being a grouping header: a grouped table cannot be sorted by anything but the
 * group, which would make "which season had the most entrants" unanswerable.
 *
 * WINNERS, RUNNERS-UP AND MISS CONGENIALITY ARE ARRAYS AND ARE RENDERED WHOLE.
 * Several seasons have two runners-up and at least one has a Miss Congeniality
 * tie; taking `[0]` deletes a real person from the record for no visible
 * reason. `formatList` joins them, and an empty array renders an em dash rather
 * than a blank cell so "no winner yet" is distinguishable from a layout gap.
 *
 * Default order is the order the RPC returned (competition, then edition), and
 * sorting is opt-in tri-state, following `TmmCountryTable`.
 */

const WINDOW = 25;

type SortKey = 'competition' | 'edition' | 'entrants' | 'episodes' | 'first' | 'last';
type SortDir = 'asc' | 'desc';
type KindFilter = 'all' | CompetitionKind;

const KIND_ORDER: readonly KindFilter[] = ['all', 'drag_race', 'pageant'];

interface EditionRow {
  key: string;
  competition: string;
  kind: CompetitionKind;
  title: string;
  entrants: number;
  /** `episode_count` is what the season HAS; `episodes` is how many we hold a
   *  row for. Prefer the former and fall back, so a season whose episode list
   *  has not been imported still reports a number rather than a zero that reads
   *  as "this season had no episodes". */
  episodes: number | null;
  firstAired: string | null;
  lastAired: string | null;
  winners: string[];
  runnersUp: string[];
  missCongeniality: string[];
  outlet: string | null;
}

function SortHeader({
  label,
  columnKey,
  sort,
  onSort,
  align,
}: {
  label: string;
  columnKey: SortKey;
  sort: { key: SortKey; dir: SortDir } | null;
  onSort: (key: SortKey) => void;
  align?: 'right';
}) {
  const active = sort?.key === columnKey ? sort.dir : null;
  return (
    <TableHead
      className={align === 'right' ? 'text-right' : undefined}
      aria-sort={active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className="-mx-2 px-2 py-2 font-medium hover:text-foreground"
      >
        {label}
        {active === 'asc' ? ' ↑' : active === 'desc' ? ' ↓' : ''}
      </button>
    </TableHead>
  );
}

export function CompetitionSeasonTable({ competitions }: { competitions: Competition[] }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo<EditionRow[]>(
    () =>
      competitions.flatMap((c) =>
        c.editions.map((e) => ({
          key: `${c.slug}/${e.slug}`,
          competition: c.name,
          kind: c.kind,
          title: e.title,
          entrants: e.entrants,
          episodes: e.episode_count ?? (e.episodes || null),
          firstAired: e.first_aired,
          lastAired: e.last_aired,
          winners: e.winners,
          runnersUp: e.runners_up,
          missCongeniality: e.miss_congeniality,
          outlet: e.network ?? c.network ?? c.organizer,
        })),
      ),
    [competitions],
  );

  const counts = useMemo(() => {
    const out: Record<KindFilter, number> = { all: rows.length, drag_race: 0, pageant: 0 };
    for (const r of rows) out[r.kind] += 1;
    return out;
  }, [rows]);

  // Reset the window during render so "Show all N" always names the CURRENT
  // result set. An effect would paint the new set behind the old window for a
  // frame. Lifted from TmmCountryTable.
  const viewKey = `${kind} ${search}`;
  const [prevViewKey, setPrevViewKey] = useState(viewKey);
  if (viewKey !== prevViewKey) {
    setPrevViewKey(viewKey);
    setShowAll(false);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (kind !== 'all' && r.kind !== kind) return false;
      if (q === '') return true;
      return (
        r.competition.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        (r.outlet ?? '').toLowerCase().includes(q) ||
        r.winners.some((w) => w.toLowerCase().includes(q)) ||
        r.runnersUp.some((w) => w.toLowerCase().includes(q)) ||
        r.missCongeniality.some((w) => w.toLowerCase().includes(q))
      );
    });
  }, [rows, kind, search]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const dir: 1 | -1 = sort.dir === 'asc' ? 1 : -1;
    const pick = (r: EditionRow): number | string | null => {
      switch (sort.key) {
        case 'competition':
          return r.competition;
        case 'edition':
          return r.title;
        case 'entrants':
          return r.entrants;
        case 'episodes':
          return r.episodes;
        case 'first':
          return r.firstAired;
        case 'last':
          return r.lastAired;
      }
    };
    return [...filtered].sort((a, b) => compareNullable(pick(a), pick(b), dir));
  }, [filtered, sort]);

  const visible = showAll ? sorted : sorted.slice(0, WINDOW);

  const onSort = (key: SortKey) =>
    setSort((s) => {
      if (s?.key !== key) return { key, dir: 'asc' };
      if (s.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });

  const kindLabel: Record<KindFilter, string> = {
    all: t('competitions.kind.all', 'All'),
    drag_race: t('competitions.kind.dragRace', 'Drag Race'),
    pageant: t('competitions.kind.pageant', 'Pageants'),
  };

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 md:gap-4">
        <div className="min-w-0 flex-1 md:max-w-[480px]">
          <Input
            type="search"
            aria-label={t('competitions.table.search', 'Search seasons')}
            placeholder={t('competitions.table.searchPlaceholder', 'Search seasons…')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label={t('competitions.table.filterKind', 'Filter by kind of competition')}
        >
          {KIND_ORDER.map((k) => (
            <FilterChip
              key={k}
              active={kind === k}
              onClick={() => setKind(k)}
              className="whitespace-nowrap"
              label={`${kindLabel[k]} ${counts[k]}`}
            />
          ))}
        </div>
      </div>

      <Table>
        <caption className="sr-only">
          {t(
            'competitions.table.caption',
            'One row per season or edition, with its entrants, air dates and results.',
          )}
        </caption>
        <TableHeader>
          <TableRow>
            <SortHeader
              label={t('competitions.table.competition', 'Competition')}
              columnKey="competition"
              sort={sort}
              onSort={onSort}
            />
            <SortHeader
              label={t('competitions.table.edition', 'Edition')}
              columnKey="edition"
              sort={sort}
              onSort={onSort}
            />
            <SortHeader
              label={t('competitions.table.entrants', 'Entrants')}
              columnKey="entrants"
              sort={sort}
              onSort={onSort}
              align="right"
            />
            <SortHeader
              label={t('competitions.table.episodes', 'Episodes')}
              columnKey="episodes"
              sort={sort}
              onSort={onSort}
              align="right"
            />
            <SortHeader
              label={t('competitions.table.firstAired', 'First aired')}
              columnKey="first"
              sort={sort}
              onSort={onSort}
            />
            <SortHeader
              label={t('competitions.table.lastAired', 'Last aired')}
              columnKey="last"
              sort={sort}
              onSort={onSort}
            />
            <TableHead>{t('competitions.table.winners', 'Winner(s)')}</TableHead>
            <TableHead>{t('competitions.table.runnersUp', 'Runner(s)-up')}</TableHead>
            <TableHead>{t('competitions.table.missCongeniality', 'Miss Congeniality')}</TableHead>
            <TableHead>{t('competitions.table.outlet', 'Network / organizer')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((r) => (
            <TableRow key={r.key}>
              <TableCell className="font-medium">{r.competition}</TableCell>
              <TableCell>{r.title}</TableCell>
              <TableCell className="text-right tabular-nums">{r.entrants}</TableCell>
              <TableCell className="text-right tabular-nums">{r.episodes ?? '—'}</TableCell>
              <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                {formatAired(r.firstAired, locale)}
              </TableCell>
              <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                {formatAired(r.lastAired, locale)}
              </TableCell>
              <TableCell>{formatList(r.winners)}</TableCell>
              <TableCell>{formatList(r.runnersUp)}</TableCell>
              <TableCell>{formatList(r.missCongeniality)}</TableCell>
              <TableCell className="text-muted-foreground">{r.outlet ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {!showAll && sorted.length > WINDOW ? (
        <div className="mt-4">
          <Button variant="outline" onClick={() => setShowAll(true)}>
            {t('competitions.table.showAll', 'Show all {{n}} seasons', { n: sorted.length })}
          </Button>
        </div>
      ) : null}
      {sorted.length === 0 ? (
        <p className="mt-4 text-muted-foreground">
          {t('competitions.table.empty', 'No season matches.')}
        </p>
      ) : null}
    </div>
  );
}

export default CompetitionSeasonTable;
