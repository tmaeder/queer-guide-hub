# /rights Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/rights` from a ~14,000px stacked-list page into a ~4,000px "Lookup + Ledger" page per the approved design in `docs/plans/2026-08-21-rights-restructure-design.md`.

**Architecture:** Presentation-layer only — no lib/data changes. Tier logic extracted from the page into `src/lib/rights/rightsTiers.ts`; three new components (`RightsScopeBar`, `RightsCountryTable`, `RightsLedger`) composed by a slimmed `src/pages/intent/Rights.tsx` inside the existing `IntentPageLayout` shell. Country ledger + "Still a crime" list merge into one filterable table; the 18 rights cards become a dense stat ledger; "Where you are" moves into the hero scope bar.

**Tech Stack:** React 19, existing shadcn primitives (`ui/command`, `ui/popover`, `ui/table`, `ui/button`, `ui/input`), vitest + RTL (`src/test/test-utils.tsx`), Playwright. **No TanStack Table** (admin-only machinery; 250 rows = `useMemo`).

**Layout order (final):** hero + scope band → `world` (table) → `criminalizing` (prose band) → `rights` (ledger) → `news` → `sources` → `help`. The old `here` section is absorbed into the scope band.

**Invariants (from the design doc — regressions are failures):**
- Animation-free; no track colors; `--destructive` only for death-penalty facts.
- Tier cutoffs `PROTECTED_MIN=75` / `MIXED_MIN=40`, criminalisation ⇒ restricted, `unscored` honesty bucket — move verbatim, do not re-derive from `EQUALITY_TIER_CUTOFFS`.
- `id={topic.slug}` + `scroll-mt-24` on every rights row; the hash-polling effect in Rights.tsx stays untouched.
- These exact sentence templates stay byte-compatible (e2e regexes): `{withLegalStatus} of {N} countries and territories carry a recorded criminalisation status.` / `In {n} the penalty is death.` / `In {n} more our source names the death penalty as possible but records no legal certainty; we list those as uncertain rather than as safe.`
- Death-penalty-confirmed countries are additionally **named in prose**, never only behind a filter.
- `useMeta` block unchanged.

---

### Task 1: Extract tier logic to `src/lib/rights/rightsTiers.ts`

**Files:**
- Create: `src/lib/rights/rightsTiers.ts`
- Test: `src/lib/rights/__tests__/rightsTiers.test.ts`
- (Rights.tsx is NOT modified in this task — it still has its own copy until Task 5.)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/rights/__tests__/rightsTiers.test.ts
import { describe, expect, it } from 'vitest';
import { tierOf, TIER_ORDER, TIER_LABEL } from '../rightsTiers';
import type { RightsCountry } from '@/hooks/useIntentData';

const country = (over: Partial<RightsCountry>): RightsCountry => ({
  id: 'x',
  name: 'X',
  slug: 'x',
  code: 'XX',
  equality_score: null,
  lgbti_criminalization: null,
  lgbti_same_sex_unions: null,
  ...over,
});

describe('tierOf', () => {
  it('criminalisation overrides any score', () => {
    expect(
      tierOf(country({ equality_score: 90, lgbti_criminalization: { legal: false } })),
    ).toBe('restricted');
  });

  it('unscored is its own bucket, never mixed', () => {
    expect(tierOf(country({ equality_score: null, lgbti_criminalization: {} }))).toBe('unscored');
  });

  it('protected starts at 75, not the magnitude scale’s 60', () => {
    expect(tierOf(country({ equality_score: 75, lgbti_criminalization: { legal: true } }))).toBe(
      'protected',
    );
    // North Korea’s formula-default 60 must not read as protected.
    expect(tierOf(country({ equality_score: 60, lgbti_criminalization: { legal: true } }))).toBe(
      'mixed',
    );
  });

  it('mixed floor is 40', () => {
    expect(tierOf(country({ equality_score: 40, lgbti_criminalization: { legal: true } }))).toBe(
      'mixed',
    );
    expect(tierOf(country({ equality_score: 39, lgbti_criminalization: { legal: true } }))).toBe(
      'restricted',
    );
  });

  it('order and labels cover all four tiers', () => {
    expect(TIER_ORDER).toEqual(['protected', 'mixed', 'restricted', 'unscored']);
    for (const t of TIER_ORDER) expect(TIER_LABEL[t]).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/rights/__tests__/rightsTiers.test.ts`
Expected: FAIL — `Cannot find module '../rightsTiers'`.

- [ ] **Step 3: Create the module** — move the code (including its long comment) out of `src/pages/intent/Rights.tsx:32-74`:

```ts
// src/lib/rights/rightsTiers.ts
import type { RightsCountry } from '@/hooks/useIntentData';
import { hasAnyCriminalizationSignal, tierForScore } from '@/utils/equalityScore';

export type Tier = 'protected' | 'mixed' | 'restricted' | 'unscored';

export const TIER_LABEL: Record<Tier, string> = {
  protected: 'Protected',
  mixed: 'Mixed',
  restricted: 'Restricted',
  unscored: 'Not scored',
};

export const TIER_ORDER: readonly Tier[] = ['protected', 'mixed', 'restricted', 'unscored'];

/**
 * Bucket a country for the world list.
 *
 * These cutoffs deliberately do NOT come from `EQUALITY_TIER_CUTOFFS`, even
 * though that constant documents itself as the single source of truth and a
 * first pass at this page did adopt it. It is a score-MAGNITUDE scale
 * (very-high/high/moderate/low, breaking at 80/60/40/20); protected/mixed/
 * restricted is a rights-VERDICT scale. Mapping high→protected drops the
 * boundary from 75 to 60 and files North Korea (60), Bahrain (60), Turkey (61)
 * and Vatican City (62) under "Protected" on a page people read to decide
 * whether somewhere is safe to enter.
 *
 * The reason those countries score 60 at all is that `calculateEqualityScore`
 * starts every country at 50 and adds points, so a country with almost no ILGA
 * coverage lands near the middle by default rather than being marked unknown.
 * Until the score is replaced by a categorical verdict, a verdict word cannot
 * be derived from it at the boundary the magnitude scale uses.
 *
 * `unscored` is the honest half of the change and stays: an unscored country
 * used to fall into `mixed`, turning "we hold no data" into a positive claim
 * that partial protections exist.
 */
export const PROTECTED_MIN = 75;
export const MIXED_MIN = 40;

export function tierOf(c: RightsCountry): Tier {
  if (hasAnyCriminalizationSignal(c.lgbti_criminalization)) return 'restricted';
  if (tierForScore(c.equality_score) === 'unknown') return 'unscored';
  const score = c.equality_score as number;
  if (score >= PROTECTED_MIN) return 'protected';
  return score >= MIXED_MIN ? 'mixed' : 'restricted';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/rights/__tests__/rightsTiers.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/rights/rightsTiers.ts src/lib/rights/__tests__/rightsTiers.test.ts
git commit -m "feat(rights): extract tier bucketing into rightsTiers lib"
```

---

### Task 2: `RightsLedger` — 18 rights as a dense stat ledger

**Files:**
- Create: `src/components/rights/RightsLedger.tsx`
- Test: `src/components/rights/__tests__/RightsLedger.test.tsx`

Replaces the 2-col card grid (~1,400px) with grouped ledger rows (~700px). Keeps the
`/rights#<slug>` anchor contract and the `SUMMARY_LABEL` marriage/civil-union
disambiguation (moved here from Rights.tsx).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/rights/__tests__/RightsLedger.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { RightsLedger } from '../RightsLedger';
import { RIGHT_TOPICS } from '@/lib/rights/rightsCatalog';
import type { RightWorldSummary } from '@/lib/rights/rightsWorldSummary';

const summary: RightWorldSummary[] = RIGHT_TOPICS.map((topic) => ({
  topic,
  yes: topic.slug === 'marriage' ? 67 : 10,
  no: 5,
  partial: 2,
  measured: 17,
  uncounted: topic.slug === 'gender-recognition',
}));

describe('RightsLedger', () => {
  it('renders every right with its anchor id', () => {
    render(<RightsLedger summary={summary} />);
    for (const t of RIGHT_TOPICS) {
      expect(document.getElementById(t.slug), t.slug).toBeTruthy();
    }
  });

  it('disambiguates the two union topics', () => {
    render(<RightsLedger summary={summary} />);
    expect(screen.getByText('Marriage equality')).toBeInTheDocument();
    expect(screen.getByText('Civil unions')).toBeInTheDocument();
  });

  it('states the stricter fully-protect bar for matrix rights', () => {
    render(<RightsLedger summary={summary} />);
    // 9 protection-matrix topics all read "fully protect".
    expect(screen.getAllByText(/fully protect/).length).toBe(9);
  });

  it('renders an uncounted right without a number, not hidden', () => {
    render(<RightsLedger summary={summary} />);
    const row = document.getElementById('gender-recognition')!;
    expect(row.textContent).toMatch(/Recorded per country/);
    expect(row.textContent).not.toMatch(/\d+ of \d+/);
  });

  it('criminalisation counts the negative direction', () => {
    render(<RightsLedger summary={summary} />);
    const row = document.getElementById('criminalisation')!;
    expect(row.textContent).toMatch(/5 of 17 countries criminalise/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/rights/__tests__/RightsLedger.test.tsx`
Expected: FAIL — `Cannot find module '../RightsLedger'`.

- [ ] **Step 3: Implement**

```tsx
// src/components/rights/RightsLedger.tsx
import { useTranslation } from 'react-i18next';
import {
  RIGHT_SECTION_ORDER,
  RIGHT_SECTION_LABEL,
} from '@/lib/rights/rightsCatalog';
import type { RightWorldSummary } from '@/lib/rights/rightsWorldSummary';

/**
 * The 18 rights as a dense ledger: one row per right, grouped by section.
 * Compresses the former 2-col card grid to roughly half its height while
 * keeping every anchor (`/rights#<slug>`) and every honesty rule — an
 * uncounted right renders without a number rather than being dropped.
 */

/**
 * Two topics share `labelKey: 'unions'` in the catalog — on the country card
 * they render inside one bespoke union block, so the collision never showed.
 * A flat per-right list produces two rows both reading "Same-sex unions", with
 * different numbers, which looks like a data error. Disambiguated here rather
 * than in the catalog: the country card's combined block is still correct for
 * its own layout.
 */
const SUMMARY_LABEL: Record<string, string> = {
  marriage: 'Marriage equality',
  'civil-union': 'Civil unions',
};

export function RightsLedger({ summary }: { summary: RightWorldSummary[] }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-8 md:grid-cols-2 md:gap-x-12">
      {RIGHT_SECTION_ORDER.map((sectionId) => {
        const rows = summary.filter((r) => r.topic.section === sectionId);
        if (rows.length === 0) return null;
        return (
          <div key={sectionId}>
            <h3 className="mb-2 text-2xs font-bold uppercase tracking-wide text-muted-foreground">
              {RIGHT_SECTION_LABEL[sectionId]}
            </h3>
            <ul className="list-none p-0 m-0">
              {rows.map(({ topic, yes, no, measured, uncounted }) => {
                const Icon = topic.icon;
                // The bar shows the counted share of measured countries; for
                // severeNegative rights the counted direction is `no`
                // (criminalisation), matching the sentence beside it.
                const count = topic.severeNegative ? no : yes;
                const pct = measured > 0 ? Math.round((count / measured) * 100) : 0;
                return (
                  <li
                    key={topic.slug}
                    // Anchor target for `/rights#<slug>` — glossary tags that
                    // name a class of law link here (see tagRightTopics.ts).
                    id={topic.slug}
                    className="flex items-center gap-4 border-b border-border py-2 scroll-mt-24"
                  >
                    <Icon size={16} aria-hidden="true" className="shrink-0" />
                    <span className="min-w-0 flex-1 font-medium">
                      {SUMMARY_LABEL[topic.slug] ??
                        t(`country.rights.${topic.labelKey}`, topic.labelDefault)}
                    </span>
                    {uncounted ? (
                      // WITHOUT a number rather than dropped: an omitted right
                      // reads as "this does not exist"; an uncounted one reads
                      // as what it is.
                      <span className="text-13 text-muted-foreground">
                        Recorded per country — open a country to read it.
                      </span>
                    ) : (
                      <>
                        <span
                          aria-hidden="true"
                          className="hidden h-1 w-20 shrink-0 overflow-hidden rounded-full bg-muted sm:block"
                        >
                          <span
                            className="block h-full bg-foreground/60"
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                        <span className="whitespace-nowrap text-13 text-muted-foreground tabular-nums">
                          {topic.severeNegative
                            ? `${no} of ${measured} countries criminalise`
                            : topic.kind === 'protection-matrix'
                              ? // "fully" is load-bearing: the bar is all four of
                                // SO/GI/GE/SC — partial protection is not counted.
                                `${yes} of ${measured} countries fully protect`
                              : `${yes} of ${measured} countries protect`}
                        </span>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export default RightsLedger;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/rights/__tests__/RightsLedger.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/rights/RightsLedger.tsx src/components/rights/__tests__/RightsLedger.test.tsx
git commit -m "feat(rights): dense stat ledger for the 18 rights"
```

---

### Task 3: `RightsCountryTable` — one filterable table for all 250 countries

**Files:**
- Create: `src/components/rights/RightsCountryTable.tsx`
- Test: `src/components/rights/__tests__/RightsCountryTable.test.tsx`

Merges "The world" (4 flat buckets, ~7,800px) and the "Still a crime" list
(~1,600px) into ~700px: search + count-first filter chips + a 30-row window with
"Show all". Filter state is **controlled by the parent** so the criminalizing
section and the scope-bar stat tiles can preset it.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/rights/__tests__/RightsCountryTable.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import {
  RightsCountryTable,
  type CountryFilter,
} from '../RightsCountryTable';
import type { RightsCountry } from '@/hooks/useIntentData';

const mk = (
  name: string,
  score: number | null,
  crim: Record<string, unknown> | null = { legal: true },
): RightsCountry => ({
  id: name,
  name,
  slug: name.toLowerCase().replace(/ /g, '-'),
  code: name.slice(0, 2).toUpperCase(),
  equality_score: score,
  lgbti_criminalization: crim,
  lgbti_same_sex_unions: null,
});

// 40 protected rows to exercise the 30-row window, plus one of each other kind.
const many = Array.from({ length: 40 }, (_, i) => mk(`Safeland ${String(i).padStart(2, '0')}`, 90));
const countries: RightsCountry[] = [
  ...many,
  mk('Midland', 60),
  mk('Grimland', 20),
  mk('Deathland', null, { legal: false, death_penalty: 'Yes' }),
  mk('North Korea', 60), // formula-default score; must never appear under Protected… wait — 60 IS mixed.
  mk('Blankland', null, {}),
];

function Harness({ initial = 'all' }: { initial?: CountryFilter }) {
  const [filter, setFilter] = useState<CountryFilter>(initial);
  return <RightsCountryTable countries={countries} filter={filter} onFilterChange={setFilter} />;
}

describe('RightsCountryTable', () => {
  it('shows a 30-row window with a Show all expander', async () => {
    render(<Harness />);
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row').length).toBe(31); // header + 30
    await userEvent.click(screen.getByRole('button', { name: /show all 45/i }));
    expect(within(table).getAllByRole('row').length).toBe(46);
  });

  it('search narrows to matching countries', async () => {
    render(<Harness />);
    await userEvent.type(screen.getByRole('searchbox'), 'grim');
    const table = screen.getByRole('table');
    expect(within(table).getByText('Grimland')).toBeInTheDocument();
    expect(within(table).queryByText('Midland')).toBeNull();
  });

  it('an unscored country is never listed under Protected', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /^Protected/ }));
    const table = screen.getByRole('table');
    expect(within(table).queryByText('Blankland')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^Not scored/ }));
    expect(within(table).getByText('Blankland')).toBeInTheDocument();
  });

  it('criminalising filter shows only criminalising rows, with the death flag', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /^Criminalising/ }));
    const table = screen.getByRole('table');
    expect(within(table).getByText('Deathland')).toBeInTheDocument();
    expect(within(table).queryByText('Midland')).toBeNull();
    expect(within(table).getByText(/death penalty/)).toBeInTheDocument();
  });

  it('chips carry counts', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'All 45' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criminalising 1' })).toBeInTheDocument();
  });

  it('unscored rows print — not a number', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /^Not scored/ }));
    const row = screen.getByText('Blankland').closest('tr')!;
    expect(row.textContent).toContain('—');
  });
});
```

(Note: the `North Korea` row at score 60 lands in `mixed` by `tierOf` — the
"never under Protected" invariant is covered by `Blankland` (unscored) plus the
Task 1 unit test for the 75 boundary.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/rights/__tests__/RightsCountryTable.test.tsx`
Expected: FAIL — `Cannot find module '../RightsCountryTable'`.

- [ ] **Step 3: Implement**

```tsx
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
import { cn } from '@/lib/utils';

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

  const visible = showAll ? filtered : filtered.slice(0, WINDOW);

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
      <div className="mb-4 flex flex-col gap-4">
        <Input
          type="search"
          role="searchbox"
          aria-label="Search countries"
          placeholder="Search countries…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter countries">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              aria-pressed={filter === chip.key}
              onClick={() => onFilterChange(chip.key)}
              className={cn(
                'rounded-badge px-2 py-1 text-13 font-medium',
                filter === chip.key
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {chip.label} {chip.count}
            </button>
          ))}
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Country</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Score</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((c) => {
            const tier = tierOf(c);
            const risk = deathPenaltyRisk(c.lgbti_criminalization);
            return (
              <TableRow key={c.id}>
                <TableCell className="font-medium">
                  {c.slug ? (
                    <LocalizedLink
                      to={`/country/${c.slug}`}
                      className="no-underline hover:underline"
                    >
                      {c.name}
                    </LocalizedLink>
                  ) : (
                    c.name
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/rights/__tests__/RightsCountryTable.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/rights/RightsCountryTable.tsx src/components/rights/__tests__/RightsCountryTable.test.tsx
git commit -m "feat(rights): filterable country table replacing tier buckets"
```

---

### Task 4: `RightsScopeBar` — country lookup + here-line + headline stats

**Files:**
- Create: `src/components/rights/RightsScopeBar.tsx`
- Test: `src/components/rights/__tests__/RightsScopeBar.test.tsx`

Split band under the hero: left = country combobox (Popover + Command, the
`pronoun-combobox` pattern) + geolocated one-liner (absorbs the old "Where you
are" section); right = three Anton stat tiles (criminalise / death penalty /
marriage). Tiles preset the table filter (via callback) or jump to `#marriage`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/rights/__tests__/RightsScopeBar.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import { RightsScopeBar } from '../RightsScopeBar';
import type { RightsCountry } from '@/hooks/useIntentData';

const navigateMock = vi.fn();
vi.mock('@/hooks/useLocalizedNavigate', () => ({
  useLocalizedNavigate: () => navigateMock,
}));

const mk = (name: string, over: Partial<RightsCountry> = {}): RightsCountry => ({
  id: name,
  name,
  slug: name.toLowerCase(),
  code: name.slice(0, 2).toUpperCase(),
  equality_score: 90,
  lgbti_criminalization: { legal: true },
  lgbti_same_sex_unions: null,
  ...over,
});

const countries = [mk('Andorra'), mk('Belgium'), mk('Chile')];

describe('RightsScopeBar', () => {
  it('renders the three headline stats', () => {
    render(
      <RightsScopeBar
        countries={countries}
        here={null}
        stats={{ criminalising: 66, deathConfirmed: 7, marriage: 67 }}
        onShowCriminalising={() => {}}
      />,
    );
    expect(screen.getByText('66')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('67')).toBeInTheDocument();
  });

  it('navigates to the picked country', async () => {
    render(
      <RightsScopeBar
        countries={countries}
        here={null}
        stats={{ criminalising: 0, deathConfirmed: 0, marriage: 0 }}
        onShowCriminalising={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole('combobox', { name: /check a country/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Belgium' }));
    expect(navigateMock).toHaveBeenCalledWith('/country/belgium');
  });

  it('states the here-verdict for a located visitor', () => {
    render(
      <RightsScopeBar
        countries={countries}
        here={mk('Switzerland')}
        stats={{ criminalising: 0, deathConfirmed: 0, marriage: 0 }}
        onShowCriminalising={() => {}}
      />,
    );
    expect(screen.getByText(/You’re in/)).toBeInTheDocument();
    expect(screen.getByText(/not criminalised/)).toBeInTheDocument();
  });

  it('death tile presets the criminalising view', async () => {
    const onShow = vi.fn();
    render(
      <RightsScopeBar
        countries={countries}
        here={null}
        stats={{ criminalising: 66, deathConfirmed: 7, marriage: 67 }}
        onShowCriminalising={onShow}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /66.*criminalise/is }));
    expect(onShow).toHaveBeenCalledWith('criminalising');
    await userEvent.click(screen.getByRole('button', { name: /7.*death penalty/is }));
    expect(onShow).toHaveBeenCalledWith('death');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/rights/__tests__/RightsScopeBar.test.tsx`
Expected: FAIL — `Cannot find module '../RightsScopeBar'`.

- [ ] **Step 3: Implement**

```tsx
// src/components/rights/RightsScopeBar.tsx
import { useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { deathPenaltyRisk, hasAnyCriminalizationSignal } from '@/utils/equalityScore';
import type { RightsCountry } from '@/hooks/useIntentData';

/**
 * The split band under the /rights hero: check ONE place fast (combobox +
 * geolocated one-liner) beside the state of the world (three headline stats).
 * Absorbs the former "Where you are" section.
 *
 * Crisis-adjacent surface: no animation, no track colors; --destructive is
 * allowed on the death-penalty figure only (locked functional exception).
 */

export interface RightsHeadlineStats {
  criminalising: number;
  deathConfirmed: number;
  marriage: number;
}

export function RightsScopeBar({
  countries,
  here,
  stats,
  onShowCriminalising,
}: {
  countries: RightsCountry[];
  here: RightsCountry | null;
  stats: RightsHeadlineStats;
  /** Preset the country table ('criminalising' | 'death') and scroll to it. */
  onShowCriminalising: (filter: 'criminalising' | 'death') => void;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useLocalizedNavigate();

  const hereRisk = here ? deathPenaltyRisk(here.lgbti_criminalization) : 'none';
  const hereVerdict = !here
    ? null
    : hereRisk === 'confirmed'
      ? 'same-sex acts can carry the death penalty'
      : hereRisk === 'possible'
        ? 'same-sex acts are criminalised; the death penalty may apply'
        : hasAnyCriminalizationSignal(here.lgbti_criminalization)
          ? 'same-sex acts are criminalised'
          : 'same-sex acts are not criminalised';

  return (
    <div className="grid gap-8 md:grid-cols-2 md:items-start">
      <div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              aria-label="Check a country"
              className="h-10 w-full max-w-sm justify-between rounded-element px-4 py-2 font-normal text-muted-foreground"
            >
              Check a country…
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput placeholder="Country name…" />
              <CommandList>
                <CommandEmpty>No country found.</CommandEmpty>
                <CommandGroup>
                  {countries
                    .filter((c) => c.slug)
                    .map((c) => (
                      <CommandItem
                        key={c.id}
                        value={c.name}
                        onSelect={() => {
                          setOpen(false);
                          navigate(`/country/${c.slug}`);
                        }}
                      >
                        {c.name}
                      </CommandItem>
                    ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <p className="mt-4 text-13 text-muted-foreground">
          {here ? (
            <>
              You’re in <span className="font-medium text-foreground">{here.name}</span> —{' '}
              {hereVerdict}
              {here.equality_score != null ? ` · ${here.equality_score}/100` : null}
              {here.slug ? (
                <>
                  {' · '}
                  <LocalizedLink to={`/country/${here.slug}`} className="underline underline-offset-4">
                    full legal detail
                  </LocalizedLink>
                </>
              ) : null}
            </>
          ) : (
            'We could not determine your country from your connection. Pick any country for its full legal profile.'
          )}
        </p>
      </div>

      <dl className="grid grid-cols-3 gap-4 m-0">
        <button
          type="button"
          onClick={() => onShowCriminalising('criminalising')}
          className="text-left"
        >
          <dd className="font-display text-display m-0">{stats.criminalising}</dd>
          <dt className="text-13 text-muted-foreground">countries criminalise</dt>
        </button>
        <button type="button" onClick={() => onShowCriminalising('death')} className="text-left">
          <dd className="font-display text-display m-0 text-destructive">
            {stats.deathConfirmed}
          </dd>
          <dt className="text-13 text-muted-foreground">with the death penalty</dt>
        </button>
        <a href="#marriage" className="no-underline text-left">
          <dd className="font-display text-display m-0">{stats.marriage}</dd>
          <dt className="text-13 text-muted-foreground">have marriage equality</dt>
        </a>
      </dl>
    </div>
  );
}

export default RightsScopeBar;
```

Implementation notes for the engineer:
- `dl`/`dd`/`dt` order above is intentional (number before label visually); if
  axe (`expectNoNestedInteractive` / a11y suite) objects to buttons wrapping
  `dd/dt`, flatten to `div`+`p` — the semantics are decorative here, keep the
  accessible name on the button (it concatenates number + label, which the test
  relies on: `name: /66.*criminalise/is`).
- The `#marriage` link is a plain `<a>` — same-page fragment; the hash-polling
  effect in Rights.tsx does NOT run on hash-only changes (it runs on mount), so
  the browser's native fragment jump does the work here (target exists by then;
  if the data hasn't loaded, the link simply doesn't move — acceptable).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/rights/__tests__/RightsScopeBar.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/rights/RightsScopeBar.tsx src/components/rights/__tests__/RightsScopeBar.test.tsx
git commit -m "feat(rights): scope bar — country lookup, here-line, headline stats"
```

---

### Task 5: Rewire `src/pages/intent/Rights.tsx`

**Files:**
- Modify: `src/pages/intent/Rights.tsx` (full rewrite of the component body; the
  hash-polling `useEffect`, `useMeta` block, and `withLegalStatus` memo are kept
  verbatim)

- [ ] **Step 1: Rewrite the page**

Replace the file's contents with the version below. What is preserved verbatim
from the current file: the module doc comment, the hash-polling effect (lines
161–178), the `useMeta` block (180–194), the `withLegalStatus` memo + comment
(217–231), the criminalizing/death memos (233–244), the news/sources/help
sections. What is removed: local `Tier`/`tierOf`/labels (now Task 1's lib),
`CountryLink`, `SUMMARY_LABEL` (now in RightsLedger), the `here` section, the
bucket rendering, the flat criminalising list.

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useMeta } from '@/hooks/useMeta';
import { IntentPageLayout } from '@/components/intent/IntentPageLayout';
import { CoverageNote } from '@/components/intent/CoverageNote';
import {
  useAllCountriesRightsFull,
  useIntentNews,
} from '@/hooks/useIntentData';
import { summariseRightsWorldwide } from '@/lib/rights/rightsWorldSummary';
import { useIntentLocation } from '@/hooks/useIntentLocation';
import { hasAnyCriminalizationSignal, deathPenaltyRisk } from '@/utils/equalityScore';
import { RightsScopeBar } from '@/components/rights/RightsScopeBar';
import { RightsCountryTable, type CountryFilter } from '@/components/rights/RightsCountryTable';
import { RightsLedger } from '@/components/rights/RightsLedger';
import type { SectionDef } from '@/components/entity/editorial';

/**
 * `/rights` — LGBTQ+ law and safety, country by country.
 *
 * The nav label is "Rights", not "Know your rights". We hold no residency,
 * citizenship, gender marker or partnership status for the reader, so we cannot
 * tell anyone what *their* rights are; promising that would be the most
 * dangerous overclaim on the site. What we do hold is the legal status of all
 * 250 countries and territories — the only dataset here with full coverage —
 * so this page is phrased as an index, not as advice.
 *
 * Animation-free by the crisis-adjacent rule: someone may open this while
 * deciding whether a place is safe to enter.
 *
 * Layout (2026-08-21 restructure, docs/plans/2026-08-21-rights-restructure-design.md):
 * hero + scope band (lookup · here-line · headline stats) → ONE filterable
 * country table → "Still a crime" prose band → the 18-rights ledger → tail.
 * All country-level content lives in the table; all right-level content in the
 * ledger. /country/:slug stays the answer; this page stays the index.
 */
export default function RightsIntent() {
  const { t } = useTranslation();
  const { data: countries, isLoading, error } = useAllCountriesRightsFull();

  // Country-table filter is lifted here so the scope-bar tiles and the
  // "Still a crime" band can preset it.
  const [tableFilter, setTableFilter] = useState<CountryFilter>('all');

  const rightsSummary = summariseRightsWorldwide(
    (countries ?? []) as unknown as Record<string, unknown>[],
  );
  const { countryCode } = useIntentLocation();

  // Deep links into a single right (`/rights#marriage`), which is where the
  // glossary sends every class-of-law tag — see src/lib/rights/tagRightTopics.ts.
  //
  // The browser performs its fragment jump while this page is still a shell: the
  // topic rows need the all-countries fetch, so `#marriage` does not exist yet
  // and the reader is silently left at the top of a very long page. Measured on
  // a real load, both as a full navigation and as an in-app click: scrollY 0
  // with the target thousands of px down.
  //
  // WAITING ON A DEPENDENCY DOES NOT WORK HERE, which is the trap.
  // `summariseRightsWorldwide` maps over RIGHT_TOPICS, so `rightsSummary.length`
  // is 18 from the first render whether or not any country has loaded — keying
  // the effect on it fires once, immediately, against an empty DOM. So this
  // polls for the element itself rather than trying to guess when it appears.
  //
  // Once found it re-scrolls a few times, because the site header collapses to
  // its compact height after the first scroll and would otherwise leave the
  // target ~64px off (the same correction useActiveStation documents).
  //
  // A timer, NOT requestAnimationFrame: rAF is paused in a background or
  // zero-size tab, so a link opened in a new tab would never scroll — which is
  // exactly how someone following this from a tag page is likely to open it.
  // Timers still fire there (throttled), so the page is already in position when
  // they switch to it.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const STEP = 100;
    let waited = 0;
    let settling = 0;
    const timer = window.setInterval(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ block: 'start' });
        if (++settling >= 4) window.clearInterval(timer);
      } else if ((waited += STEP) > 10_000) {
        // The right does not exist. Leave the page where the reader put it.
        window.clearInterval(timer);
      }
    }, STEP);
    return () => window.clearInterval(timer);
  }, []);

  useMeta({
    title: 'LGBTQ+ rights and safety, country by country',
    description:
      'Legal status for LGBTQ+ people in all 250 countries and territories: criminalisation, partnership recognition and equality scores, with sources.',
    canonicalPath: '/rights',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: 'LGBTQ+ legal status by country',
      description:
        'Criminalisation status, partnership recognition and a composite equality score for every country and territory.',
      creator: { '@type': 'Organization', name: 'Queer Guide' },
      isAccessibleForFree: true,
    },
  });

  const here = useMemo(
    () =>
      countryCode && countries
        ? (countries.find((c) => c.code?.toLowerCase() === countryCode.toLowerCase()) ?? null)
        : null,
    [countries, countryCode],
  );

  const { data: news } = useIntentNews(here?.id ?? null, 5);

  /**
   * How many rows carry a legal status at all. `lgbti_criminalization` is
   * non-null on all 250 rows, but 11 of them hold an empty shape — the same 11
   * that have no equality score, all uninhabited territories. The note used to
   * render `{countries.length} of {countries.length}`, which prints "250 of
   * 250" whatever the data says and can never reveal a gap; the e2e test
   * asserted that tautology, so both agreed and neither could fail.
   */
  const withLegalStatus = useMemo(
    () =>
      (countries ?? []).filter(
        (c) => (c.lgbti_criminalization as Record<string, unknown> | null)?.legal != null,
      ).length,
    [countries],
  );

  const criminalizing = useMemo(
    () => (countries ?? []).filter((c) => hasAnyCriminalizationSignal(c.lgbti_criminalization)),
    [countries],
  );
  const deathConfirmed = useMemo(
    () => criminalizing.filter((c) => deathPenaltyRisk(c.lgbti_criminalization) === 'confirmed'),
    [criminalizing],
  );
  const deathPossible = useMemo(
    () => criminalizing.filter((c) => deathPenaltyRisk(c.lgbti_criminalization) === 'possible'),
    [criminalizing],
  );

  const marriageCount = rightsSummary.find((r) => r.topic.slug === 'marriage')?.yes ?? 0;

  const showInTable = (filter: 'criminalising' | 'death') => {
    setTableFilter(filter);
    document.getElementById('world')?.scrollIntoView({ block: 'start' });
  };

  const sections: SectionDef[] = [
    {
      id: 'world',
      label: 'The world',
      kicker: `All ${countries?.length ?? 0} countries and territories`,
      hidden: !countries || countries.length === 0,
      content: (
        <div>
          <CoverageNote>
            {withLegalStatus} of {countries?.length ?? 0} countries and territories carry a recorded
            criminalisation status. The remaining {(countries?.length ?? 0) - withLegalStatus} also
            carry no equality score and are listed as “not scored” rather than given a default or
            folded in with countries we have measured.
          </CoverageNote>
          <RightsCountryTable
            countries={countries ?? []}
            filter={tableFilter}
            onFilterChange={setTableFilter}
          />
        </div>
      ),
    },
    {
      id: 'criminalizing',
      label: 'Still a crime',
      kicker: 'Where same-sex acts are criminalised',
      hidden: !countries || countries.length === 0,
      content: (
        <div className="max-w-prose">
          <CoverageNote>
            {criminalizing.length} countries criminalise same-sex acts.{' '}
            {deathConfirmed.length > 0 ? `In ${deathConfirmed.length} the penalty is death.` : null}{' '}
            {deathPossible.length > 0
              ? `In ${deathPossible.length} more our source names the death penalty as possible but records no legal certainty; we list those as uncertain rather than as safe.`
              : null}{' '}
            Venues, events and organizations in these countries are hidden from signed-out visitors
            by design.
          </CoverageNote>
          {deathConfirmed.length > 0 ? (
            // Named in prose, never only behind a filter — this is the one
            // fact on the page that must not cost a click.
            <p className="mb-6">
              The penalty is death in {deathConfirmed.map((c) => c.name).join(', ')}.
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => showInTable('criminalising')}
            className="bg-muted px-6 py-2 font-medium rounded-element"
          >
            See all {criminalizing.length} in the table
          </button>
        </div>
      ),
    },
    {
      id: 'rights',
      label: 'The rights themselves',
      kicker: 'Where each one stands worldwide',
      hidden: !countries || countries.length === 0,
      content: <RightsLedger summary={rightsSummary} />,
      action: (
        <LocalizedLink to="/rights/sources" className="text-13 no-underline hover:underline">
          How we know
        </LocalizedLink>
      ),
    },
    {
      id: 'news',
      label: 'In the news',
      content:
        news && news.length > 0 ? (
          <ul className="list-none p-0 m-0">
            {news.map((n) => (
              <li key={n.id} className="border-b border-border py-2">
                {n.slug ? (
                  <LocalizedLink to={`/news/${n.slug}`} className="no-underline hover:underline">
                    {n.title}
                  </LocalizedLink>
                ) : (
                  n.title
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">No recent coverage.</p>
        ),
      action: (
        <LocalizedLink to="/news" className="text-13 no-underline hover:underline">
          All news
        </LocalizedLink>
      ),
    },
    {
      id: 'sources',
      label: 'Where this comes from',
      content: (
        <div className="max-w-prose">
          <p className="mb-4">
            Legal status on this page comes from the ILGA World Database and is re-imported nightly.
            The equality score is a 0–100 composite we compute from it.
          </p>
          <p className="text-muted-foreground">
            It opens at 50 and adds points per recorded right, so a country we hold little about
            lands mid-scale rather than reading as unknown — and it is a single number for very
            different lives. It describes law on paper, not enforcement, and it is not a safety
            rating.
          </p>
        </div>
      ),
      action: (
        <LocalizedLink to="/rights/sources" className="text-13 no-underline hover:underline">
          Sources and limits
        </LocalizedLink>
      ),
    },
    {
      id: 'help',
      label: 'If you need help',
      content: (
        <div className="flex flex-wrap gap-4">
          <LocalizedLink
            to="/support"
            className="bg-muted px-6 py-2 font-medium no-underline rounded-element"
          >
            Find support near you
          </LocalizedLink>
          <LocalizedLink
            to="/help"
            className="bg-muted px-6 py-2 font-medium no-underline rounded-element"
          >
            Crisis hotlines
          </LocalizedLink>
        </div>
      ),
    },
  ];

  return (
    <IntentPageLayout
      breadcrumbLabel={t('header.intents.rights.label', 'Rights')}
      breadcrumbHref="/rights"
      eyebrow="Know before you go"
      title="LGBTQ+ rights and safety, country by country"
      lede="Legal status for every country and territory we cover — criminalisation, partnership recognition, and how they compare. We can tell you what the law says; we cannot tell you what it means for your particular situation."
      scopeBar={
        countries && countries.length > 0 ? (
          <RightsScopeBar
            countries={countries}
            here={here}
            stats={{
              criminalising: criminalizing.length,
              deathConfirmed: deathConfirmed.length,
              marriage: marriageCount,
            }}
            onShowCriminalising={showInTable}
          />
        ) : null
      }
      sections={sections}
      loading={isLoading}
      error={(error as Error) ?? null}
      disableProgress
    />
  );
}
```

(Note: `useRef` in the import line is unused — drop it; listed here so the
engineer doesn't add it back. Final import line:
`import { useEffect, useMemo, useState } from 'react';`)

- [ ] **Step 2: Run the unit suites**

Run: `npx vitest run src/lib/rights src/components/rights src/pages`
Expected: PASS — including the pre-existing `rightsWorldSummary`, `rightsColumns`, `rightsValue`, `tagRightTopics` suites (untouched libs).

- [ ] **Step 3: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both clean (ratchet: no NEW errors).

- [ ] **Step 4: Visual smoke on the dev server**

Run the dev server (`npm run dev`, port 8080) and load `http://localhost:8080/rights`. Verify:
- scope band renders (combobox, here-line or fallback sentence, three stats; death figure in destructive red only)
- table filters + search work; "Show all 250 countries" works
- "Still a crime" names the death-penalty countries in prose; button jumps to the filtered table
- `http://localhost:8080/rights#marriage` scrolls to the marriage ledger row
- total page height ≈ 3,500–4,500px (`document.documentElement.scrollHeight` in the console), down from ~14,000

- [ ] **Step 5: Commit**

```bash
git add src/pages/intent/Rights.tsx
git commit -m "feat(rights): restructure /rights — lookup + ledger layout"
```

---

### Task 6: Update `e2e/rights-safety.spec.ts` for the table UI

**Files:**
- Modify: `e2e/rights-safety.spec.ts` (only the two structural tests; the
  coverage, death-count, Afghanistan, verdict-invariant and animation tests
  keep passing unchanged because the prose sentences are byte-identical)

- [ ] **Step 1: Replace the "reaches every country" test**

The old test asserted Germany + Thailand visible in `#world` — with a 30-row
window that is false by design. The spirit (every country reachable, no silent
`slice(0,12)`) is now: search reaches anything; Show-all reveals everything.

```ts
test('/rights reaches every country, not the first thirty', async ({ page }) => {
  await page.goto('/rights');
  await dismiss(page);
  const world = page.locator('#world');
  await expect(world.getByRole('searchbox')).toBeVisible({ timeout: 30_000 });
  await world.getByRole('searchbox').fill('germany');
  await expect(world.getByRole('link', { name: 'Germany', exact: true })).toBeVisible();
  await world.getByRole('searchbox').fill('thailand');
  await expect(world.getByRole('link', { name: 'Thailand', exact: true })).toBeVisible();
  // And the unfiltered set is fully expandable — no reachable-only-by-search rows.
  await world.getByRole('searchbox').fill('');
  await world.getByRole('button', { name: /show all \d+ countries/i }).click();
  await expect(world.getByRole('link', { name: 'Zimbabwe', exact: true })).toBeVisible();
});
```

- [ ] **Step 2: Replace the "unscored never Protected" test**

The old test split `#world`'s innerText on 'Mixed' — bucket headers no longer
exist. Same invariant against the table:

```ts
test('an unscored country is never filed as Protected or Mixed', async ({ page }) => {
  await page.goto('/rights');
  await dismiss(page);
  const world = page.locator('#world');
  await expect(world.getByRole('searchbox')).toBeVisible({ timeout: 30_000 });
  // North Korea scores 60 purely because the formula opens at 50; it must not
  // read as Protected on an LGBTQ+ safety page.
  await world.getByRole('button', { name: /^Protected \d+$/ }).click();
  await world.getByRole('searchbox').fill('north korea');
  await expect(world.getByRole('table')).not.toContainText('North Korea');
  // Unscored rows exist and are labelled honestly.
  await world.getByRole('button', { name: /^Not scored \d+$/ }).click();
  await world.getByRole('searchbox').fill('');
  await expect(world.getByRole('table')).toContainText('Not scored');
});
```

- [ ] **Step 3: Run the spec against the local dev server**

Local e2e rules (from project memory): one worker, explicit base URL —
otherwise Playwright tests the DEPLOYED site.

Run: `E2E_BASE_URL=http://localhost:8080 npx playwright test e2e/rights-safety.spec.ts --workers=1`
Expected: all tests pass. (The two `/country/afghanistan` tests hit unchanged surfaces.)

- [ ] **Step 4: Commit**

```bash
git add e2e/rights-safety.spec.ts
git commit -m "test(rights): adapt e2e structural guards to the table layout"
```

---

### Task 7: Full verification + graph update

- [ ] **Step 1: Full unit suite** — Run: `npm test` → Expected: pass.
- [ ] **Step 2: Lint** — Run: `npm run lint` → Expected: clean (watch the design-system rules: no odd spacing steps, no raw `rounded-*` literals, no arbitrary text sizes — the code above uses only tokens).
- [ ] **Step 3: Typecheck** — Run: `npm run typecheck` → Expected: no NEW errors vs baseline.
- [ ] **Step 4: Keep the knowledge graph current** — Run: `graphify update .` (project rule; AST-only, no API cost).
- [ ] **Step 5: Commit anything the tools changed** (e.g. graphify output):

```bash
git add -A && git commit -m "chore(rights): post-restructure verification artifacts" || true
```

---

## Out of scope (deliberate)

- No changes to `src/lib/rights/*` beyond the tier extraction (summary/value/columns libs untouched).
- No changes to `RightsSources.tsx`, `CityRightsTab`, the country page, or `tagRightTopics.ts`.
- No i18n key additions — the page is hardcoded-English today; the restructure stays consistent with that (translating the intent pages is its own project).
- No TanStack Table / virtualization — 250 rows with a windowed slice needs neither.
- Deployment (PR → merge → Pages deploy → prod verification) follows the repo's normal flow after this plan completes; per project rules, verify on https://queer.guide/rights after deploy, and never measure prod during your own deploy window.

## Self-review notes

- Spec coverage: hero/scope band → Task 4+5; table → Task 3; crime band → Task 5; ledger → Task 2; tail → Task 5; e2e contract → Task 6; invariants restated at top and embedded in code comments.
- Type consistency: `CountryFilter` defined in Task 3, imported in Task 5; `RightsHeadlineStats`/`onShowCriminalising('criminalising'|'death')` consistent between Tasks 4 and 5; `tierOf`/`TIER_LABEL`/`TIER_ORDER` from Task 1 used in Task 3.
- Placeholder scan: every step carries real code/commands; no TBDs.
