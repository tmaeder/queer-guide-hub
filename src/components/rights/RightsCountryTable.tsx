// src/components/rights/RightsCountryTable.tsx
import { useEffect, useMemo, useState } from 'react';
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
import { deathPenaltyRisk, hasAnyCriminalizationSignal } from '@/utils/equalityScore';
import { TIER_LABEL, TIER_ORDER, tierOf, type Tier } from '@/lib/rights/rightsTiers';
import type { RightsCountry } from '@/hooks/useIntentData';
import { FilterChip } from '@/components/transit/FilterChip';

/**
 * All 250 countries as ONE searchable, filterable table — replaces the four
 * flat tier buckets (~7,800px) and the separate criminalising list (~1,600px).
 *
 * Filter state is controlled by the parent: the "Still a crime" band and the
 * scope-bar stat tiles preset it ("see all 66 in the table").
 *
 * Count-first chips replace the old bucket headers as the visible distribution
 * summary. A 30-row window + "Show all" keeps the page compact WITHOUT an
 * inner scrollbox — this is a crisis-adjacent page; no trapped scroll.
 */

export type CountryFilter = 'all' | Tier | 'criminalising' | 'death';
type ScoreSort = 'none' | 'desc' | 'asc';

const WINDOW = 30;

function matchesFilter(c: RightsCountry, filter: CountryFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'criminalising') return hasAnyCriminalizationSignal(c.lgbti_criminalization);
  if (filter === 'death') return deathPenaltyRisk(c.lgbti_criminalization) !== 'none';
  return tierOf(c) === filter;
}

export function RightsCountryTable({
  countries,
  filter,
  onFilterChange,
}: {
  countries: RightsCountry[];
  filter: CountryFilter;
  onFilterChange: (f: CountryFilter) => void;
}) {
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [scoreSort, setScoreSort] = useState<ScoreSort>('none');

  // A narrowed view resets the window so "Show all N" always names the
  // CURRENT result set, not a stale one.
  useEffect(() => {
    setShowAll(false);
  }, [filter, search]);

  const counts = useMemo(() => {
    const tierCounts: Record<Tier, number> = {
      protected: 0,
      mixed: 0,
      restricted: 0,
      unscored: 0,
    };
    let criminalising = 0;
    let death = 0;
    for (const c of countries) {
      tierCounts[tierOf(c)] += 1;
      if (hasAnyCriminalizationSignal(c.lgbti_criminalization)) criminalising += 1;
      if (deathPenaltyRisk(c.lgbti_criminalization) !== 'none') death += 1;
    }
    return { tierCounts, criminalising, death };
  }, [countries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return countries.filter(
      (c) => matchesFilter(c, filter) && (q === '' || c.name.toLowerCase().includes(q)),
    );
  }, [countries, filter, search]);

  // Default order = name (as the data arrives). "Score" cycles
  // descending → ascending → back to name order. Unscored rows sort last
  // in both score modes, never mixed in by numeric coincidence.
  const sorted = useMemo(() => {
    if (scoreSort === 'none') return filtered;
    const dir = scoreSort === 'desc' ? -1 : 1;
    return [...filtered].sort((a, b) => {
      if (a.equality_score == null && b.equality_score == null) return 0;
      if (a.equality_score == null) return 1;
      if (b.equality_score == null) return -1;
      return dir * (a.equality_score - b.equality_score);
    });
  }, [filtered, scoreSort]);

  const visible = showAll ? sorted : sorted.slice(0, WINDOW);

  const chips: { key: CountryFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: countries.length },
    ...TIER_ORDER.map((tier) => ({
      key: tier as CountryFilter,
      label: TIER_LABEL[tier],
      count: counts.tierCounts[tier],
    })),
    { key: 'criminalising', label: 'Criminalising', count: counts.criminalising },
    { key: 'death', label: 'Death penalty', count: counts.death },
  ];

  return (
    <div>
      {/* The house control-bar shape: `gap-2 md:gap-4`, search row then ONE
          scrolling chip line. This bar used to wrap its seven chips and give
          the search a whole 44px row to itself at `max-w-sm` — 176px on a
          phone for controls that measure 116, and a second chip recipe on the
          same screen as the map's. Both are FilterChip now. */}
      <div className="mb-4 flex flex-col gap-2 md:gap-4">
        <div className="min-w-0 flex-1 md:max-w-[480px]">
          <Input
            type="search"
            aria-label="Search countries"
            placeholder="Search countries…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label="Filter countries"
        >
          {chips.map((chip) => (
            <FilterChip
              key={chip.key}
              active={filter === chip.key}
              onClick={() => onFilterChange(chip.key)}
              className="whitespace-nowrap"
              // One flat string, not label + count in separate spans: the
              // accessible name is asserted verbatim ("All 250"), and adjacent
              // spans can compute it without the space.
              label={`${chip.label} ${chip.count}`}
            />
          ))}
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Country</TableHead>
            <TableHead>Status</TableHead>
            <TableHead
              className="text-right"
              aria-sort={
                scoreSort === 'desc' ? 'descending' : scoreSort === 'asc' ? 'ascending' : 'none'
              }
            >
              <button
                type="button"
                aria-label="Sort by score"
                onClick={() =>
                  setScoreSort((s) => (s === 'none' ? 'desc' : s === 'desc' ? 'asc' : 'none'))
                }
                // Same 24px target-size floor as the country links below; the
                // bare label was 18px tall inside a 48px header cell.
                className="-mx-2 px-2 py-2 font-medium hover:text-foreground"
              >
                Score{scoreSort === 'desc' ? ' ↓' : scoreSort === 'asc' ? ' ↑' : ''}
              </button>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((c) => {
            const tier = tierOf(c);
            const risk = deathPenaltyRisk(c.lgbti_criminalization);
            return (
              <TableRow key={c.id}>
                {/* The cell's own padding moves onto the link so the whole cell
                    is the tap target. As bare inline text the anchor measured
                    18px tall on a 48-88px row — under the 24px minimum of WCAG
                    2.2 target size (2.5.8) — so most of a thumb-sized press
                    landed on nothing. TableCell sets `padding: 16` as an INLINE
                    style, which a `p-0` class cannot override, hence the style
                    prop; `px-4 py-4` restores the identical spacing. */}
                <TableCell className="font-medium" style={{ padding: 0 }}>
                  {c.slug ? (
                    <LocalizedLink
                      to={`/country/${c.slug}`}
                      className="block px-4 py-4 no-underline hover:underline"
                    >
                      {c.name}
                    </LocalizedLink>
                  ) : (
                    <span className="block px-4 py-4">{c.name}</span>
                  )}
                </TableCell>
                <TableCell>
                  {TIER_LABEL[tier]}
                  {risk === 'confirmed' ? (
                    <span className="text-13 text-destructive"> · death penalty</span>
                  ) : risk === 'possible' ? (
                    <span className="text-13 text-muted-foreground"> · death penalty possible</span>
                  ) : hasAnyCriminalizationSignal(c.lgbti_criminalization) ? (
                    <span className="text-13 text-muted-foreground"> · criminalised</span>
                  ) : null}
                </TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  {c.equality_score == null ? '—' : `${c.equality_score}/100`}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {!showAll && filtered.length > WINDOW ? (
        <div className="mt-4">
          <Button variant="outline" onClick={() => setShowAll(true)}>
            Show all {filtered.length} countries
          </Button>
        </div>
      ) : null}
      {filtered.length === 0 ? (
        <p className="mt-4 text-muted-foreground">No country matches.</p>
      ) : null}
    </div>
  );
}

export default RightsCountryTable;
