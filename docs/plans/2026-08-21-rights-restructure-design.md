# /rights restructure — approved design (2026-08-21)

Approved via brainstorming session. Restructures `src/pages/intent/Rights.tsx` from a
~14,000px stacked-list page into a ~3,500–4,000px "Lookup + Ledger" page. User choices:
split-screen hero (country lookup + headline stats), interactive table for the country
ledger, bespoke content **within** the existing `IntentPageLayout` shell.

## Problem

- The page is ~14,000px tall; "The world" (250 countries in 4 flat tier buckets) plus
  "Still a crime" (66 countries) account for ~9,400px of it.
- You must scroll past 1,400px of rights cards before any country-level answer.
- The two real jobs — "is X safe to enter?" and "where do rights stand worldwide?" —
  both require heavy scrolling; neither is answerable above the fold.

## Concept: Lookup + Ledger

`/rights` stays an **index**, `/country/:slug` stays the **answer**. One home per fact:
all country-level content lives in a single interactive table; all right-level content
in a compact stat ledger. No inline answer panel (rejected Approach B: duplicates the
country page's legal block on a second surface).

### 1 · Hero + scope band (~550px)

Keep `IntentPageLayout` hero (`size="md"`, same title/lede/eyebrow). New content in the
existing `scopeBar` slot, split on `md:`:

- **Left — lookup.** Country combobox (`ui/command.tsx`, pattern: venue-combobox);
  placeholder "Check a country…"; selecting navigates to `/country/:slug`. Beneath it,
  the geolocated one-liner replacing the old "Where you are" *section*:
  "You're in **Switzerland** — same-sex acts are not criminalised · 90/100 → Full legal
  detail". Unresolvable location ⇒ the existing fallback sentence.
- **Right — three headline stat tiles** (Anton numerals, monochrome):
  **66** criminalise · **6** death penalty · **67** marriage equality. Each links to the
  matching section/filter. `--destructive` allowed on the death-penalty figure only.

### 2 · "The world" — one interactive table (~700px viewport)

TanStack Table (already a dependency) on `ui/table.tsx`:

- **Columns:** Country (LocalizedLink) · Status (tier word; criminalisation /
  death-penalty note in `text-13`; destructive only for confirmed death penalty) ·
  Score (`tabular-nums`, right-aligned; "—" for unscored).
- **Controls:** search input + count-first filter chips:
  `All 250 · Protected 112 · Mixed · Restricted · Not scored · Criminalising 66 · Death penalty`.
  Counts on chips replace the old bucket headers as the visible distribution summary.
- **Pagination ~25/page, no inner scrollbox** (crisis-adjacent page — no trapped
  scroll). Default sort: name; score sortable.
- The existing `CoverageNote` (239/250 measured; 11 listed "not scored", never
  defaulted) stays verbatim above the table.
- "Still a crime" merges in as the Criminalising/Death-penalty facets.

### 3 · "Still a crime" — prose band + preset (~300px)

Keeps its `h2` and `#criminalizing` anchor. Body: the coverage sentence; the
death-penalty-confirmed countries **named inline in prose** (never behind a click);
the "death possible … no legal certainty" count sentence; the safety-gating disclosure
sentence; one action: "See all 66 in the table" (applies the Criminalising chip and
scrolls to the table).

### 4 · "The rights themselves" — stat ledger (~700px)

Same 5 group headers (`RIGHT_SECTION_ORDER`), rows instead of cards:
`icon · label · thin monochrome distribution bar · "67 of 239 countries protect"`.
1 col mobile / 2 cols `md:`. Bars are `bg-foreground/NN` over `bg-muted` — no
chromatic encoding. Uncounted rights (gender recognition) render barless with the
existing "Recorded per country" sentence — never dropped.

**Contract preserved:** every row keeps `id={topic.slug}` + `scroll-mt-24`; the
`/rights#<slug>` polling-scroll effect and `tagRightTopics.ts` deep links untouched.
`SUMMARY_LABEL` disambiguation (marriage / civil-union) kept.

### 5 · Tail sections

News (5 rows, unchanged) · "Where this comes from" (same prose, tightened; keeps both
`/rights/sources` links) · "If you need help" (unchanged — crisis links stay at the
bottom).

Section list becomes: rights · world · criminalizing · news · sources · help
("here" absorbed into the scope band).

## Invariants (do not regress)

- **Animation-free** (crisis-adjacent rule). No joy components, no reveals.
- **No track colors anywhere on this page**; equality scale is a locked functional
  palette; `--destructive` only for death-penalty facts.
- Tier logic untouched: `PROTECTED_MIN=75`, `MIXED_MIN=40`, criminalisation ⇒
  restricted, unscored honesty bucket (see the long comment in Rights.tsx — the
  EQUALITY_TIER_CUTOFFS trap).
- `withLegalStatus` computed from data, never the `N of N` tautology.
- Anchors: `#<right-slug>` on every rights row, `#criminalizing` on the section.
- `useMeta` title/description/JSON-LD unchanged.
- Death-penalty countries always visible in prose, never only behind a filter.
- Shell features (sticky section nav, `?section=`, breadcrumbs) via
  `IntentPageLayout` — stay.
- Design system: Anton display, Space Grotesk body, 8pt grid, semantic radii, soft
  shadow via `Card` only, eyebrow convention for group headers, `tabular-nums` for
  scores.

## Implementation notes

- New components under `src/pages/intent/` or `src/components/rights/`:
  `RightsCountryTable`, `RightsScopeBar` (combobox + stats), rights-ledger row.
- e2e: `/rights#marriage` deep link still scrolls; table filter chips filter; death
  penalty names present in DOM without interaction. Update any e2e asserting the old
  bucket layout.
- Existing tests to respect: `rightsWorldSummary`, `rightsColumns`, `rightsValue`,
  `tagRightTopics` (lib untouched — this is a presentation-layer change).
