# /rights world map — approved design (2026-08-22)

An interactive adaptation of ILGA World's printed "Sexual Orientation Laws in the
World" map, built from **our own nightly ILGA import** (`countries.lgbti_*`), which
is the same source the printed map renders. Approved via brainstorming; user choices:
switchable across all 18 rights, subway-design-system adaptation, geographic map
(not a schematic diagram), living as a new top section of `/rights`.

> The supplied PDF could not be read — `~/Downloads` is blocked by macOS privacy
> controls for every tool available here, and ilga.org answers our fetcher with
> HTTP 403. The design is therefore derived from the dataset, not traced from the
> rendering. That is a feature: the printed map shows ONE dimension; we hold 18
> rights at ~100% country coverage.

## Concept

**The printed map's one dimension becomes a line network.** The 18 rights already
group into five families (`RIGHT_SECTION_ORDER`), so each family is a subway *line*
and each right a *station* on it. Picking a station recolours the world. The map
itself stays geographic — a reader asking "is Thailand safe" needs Thailand where
they expect it.

Three components, one new section:

```
┌─ The map ──────────────────────────────────────────────┐
│  [line selector: 5 lines · 18 stations]                │
│  ┌──────────────────────────────────────────────────┐  │
│  │           geographic choropleth                  │  │
│  └──────────────────────────────────────────────────┘  │
│  [route-strip legend: stations with Anton counts]      │
└────────────────────────────────────────────────────────┘
```

## 1 · Colour: the subway system, without breaking it

**Track colours may not encode risk** (locked rule: they are identity/wayfinding,
never state). So:

- **Track colour = which line you are on.** The five rights families take the four
  track colours (criminalisation & freedoms, anti-discrimination, criminal justice,
  family, identity & health — the fifth reuses a track, as the city network diagrams
  do by rank). It appears on the selector, the active station, and the legend
  header. It never touches the map fill.
- **Ink density = severity.** The choropleth fill is one monochrome ramp resolved
  at runtime through `mapTokens.ts`: more ink = more restrictive. This is the only
  honest monochrome encoding, and it is what keeps the map compliant.
- **`--destructive` = criminal exposure only**, matching `StatusKind: 'severe'` and
  the existing `/rights` treatment (the red death-penalty figure).

| class | fill | source |
|---|---|---|
| `yes` protected | `ink(0.12)` | `readRightValue` |
| `partial` | `ink(0.34)` | `readRightValue` |
| `no` | `ink(0.58)` | `readRightValue` |
| `severe` criminalised | `--destructive` @0.62 | `readRightValue` |
| death penalty (criminalisation view only) | `--destructive` @0.9 | `deathPenaltyRisk === 'confirmed'` |
| death possible (criminalisation view only) | `--destructive` @0.62 + hatch | `deathPenaltyRisk === 'possible'` |
| `none` no data | paper + diagonal hairline hatch | absent reading |

**No-data is a hatch, never a fill.** 11 countries carry an empty
`lgbti_criminalization` shape; on this page a gap must never look like safety. Same
rule for `'No legal certainty'` on the death penalty: its own class, never folded
into confirmed and never into silence.

## 2 · Line selector (the "network")

`RightsLineSelector` — five lines, 18 stations, horizontally scrollable on mobile.
Each station is a real `<button>` in a `role="tablist"`-style group with
`aria-pressed`; the active station takes its line's track colour as a filled bullet
with the mandatory 1px `border-track-ring` (track colours are fill-only and
ring-gated). Default station: **Same-sex activity** — the safety question.

Stations that cannot be aggregated (`gender-recognition`, `UNCOUNTED_SLUGS`) still
appear and still map — per-country values exist even where a worldwide count would
be a guess. The legend for such a right shows classes without a total.

## 2b · The trans lens (amendment, 2026-08-22)

Requested mid-build: "add a map like TGEU's Trans Rights Map"
(transrightsmap.tgeu.org). **We cannot reproduce that index and must not imply we
have** — TGEU scores 54 Europe/Central Asia countries on 32 indicators across six
categories (legal gender recognition, asylum, hate crime/speech, non-discrimination,
health, family), maintained with country experts. That is a different dataset,
not imported here, and its second PDF was unreadable for the same reason as the
first.

**What we can answer is the same question, from data we already hold at full
coverage.** ILGA records every protection-matrix column against four attributes —
sexual orientation, gender identity, gender expression, sex characteristics — so the
same column answers four different questions. A second control on the map, **"Who
the law protects"**, switches the lens:

| lens | the map becomes |
|---|---|
| `all` (default) | the strict ledger bar — every declared attribute must read Yes |
| `so` | sexual-orientation protection (the ILGA printed map's subject) |
| **`gi`** | **gender-identity protection — the trans rights view** |
| `ge` | gender expression |
| `sc` | sex characteristics (intersex) |

Implemented as an optional third argument to `classifyCountryRight`
(`src/lib/rights/rightsClassify.ts`). Two rules are load-bearing and unit-tested:
a country protecting only sexual orientation reads **`yes` under `so` and `no` under
`gi`** (never "protective" by borrowing another group's protection), and a lens
naming an attribute a topic does not record returns `'none'` — the question was
never asked of that column, which is not the same as a no.

`gender-recognition` is a first-class map view under any lens: the worldwide summary
still refuses to aggregate it, but per-country readings are legitimate (see the
`rightsClassify.ts` header), which is what makes a trans map possible at all.

Not in scope: importing TGEU's index. That is a data project (new source,
licensing, 32 indicators, 54 countries), not a UI change — and mixing their scores
into an ILGA-derived map would misattribute both.

## 3 · The map

- Geometry: `useCountryBoundaries(true, zoom)` → Natural Earth via the existing R2
  worker, joined to `useAllCountriesRightsFull()` on `ISO_A2` ⇄ `countries.code`
  (`enrichBoundaryFeatures` already does this).
- One `fill` layer whose colour comes from a per-feature `kind` property computed in
  JS (not a MapLibre expression over raw jsonb), plus a hairline `line` layer at
  `ink(0.25)` — country borders as hairlines, per the de-caged surface rules.
- Hover/selected: **station ring** (`line-width` 2 at full ink), the map echo of the
  design system's station motif. No animation, no fly-to easing — this is a
  crisis-adjacent page.
- Click a country → `/country/:slug`. Tap target is the whole polygon.
- Basemap: existing paper-and-ink monochrome (`getMapStyle()`), so the data carries
  the only weight on the canvas.
- Pattern to copy: `src/components/footprint/AtlasMap.tsx` — the one map that already
  does country fills correctly (ref published on `load`, tokens resolved at runtime).

## 4 · Route-strip legend

Not a colour key — a **line with stations along it**, left (most restrictive) to
right (most protective), each station carrying its count in Anton. This is the
printed map's own "continuum from death penalty to marriage equality" framing drawn
as a route, which is what makes this an adaptation rather than a reskin. Clicking a
legend station filters the map to that class (dims the rest); clicking again clears.

## Invariants

- **Animation-free.** No fly-to, no reveal, no joy components (crisis-adjacent rule).
- **The map is never the only path to a fact.** The country table stays directly
  below it; the map carries `role="img"` + an `aria-label` summarising the current
  right's distribution, and every interactive control (selector, legend) is a real
  focusable button. WebGL-absent and reduced-data readers lose nothing.
- **No ESLint exemption.** `src/components/map/**` is deliberately not exempt —
  every colour resolves through `mapTokens.ts` at runtime so `/admin/design`
  overrides still apply. No hex literals.
- Track colours never encode risk; `--destructive` only for criminal exposure;
  no-data visually distinct from every measured class.
- `/rights` section order becomes: **map** → world (table) → criminalizing → rights
  ledger → news → sources → help. All existing anchors and e2e prose guards unchanged.

## Data plumbing (the one new lib)

`summariseRightsWorldwide` already computes per-topic worldwide counts but only
returns aggregates. The map needs the **per-country** classification, so extract:

```ts
// src/lib/rights/rightsClassify.ts
export function classifyCountryRight(country, topic): StatusKind
```

…handling the three bespoke columns (criminalisation, marriage, civil-union) and the
protection-matrix "all four attributes" bar exactly as the summary does today, with
`summariseRightsWorldwide` refactored to call it so the two can never disagree.
Existing `rightsWorldSummary.test.ts` is the regression guard.

## Out of scope

Schematic/octilinear country diagram (offered, not chosen); time-slider over
`*_since` adoption years; per-right static routes (`/rights/marriage`).
