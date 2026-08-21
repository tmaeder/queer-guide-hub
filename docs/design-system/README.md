# Design System — SUBWAY MAP

Paper and ink plus four track colors. The identity borrows the visual language
of a metropolitan subway map: identities are tracks that travel independently,
run parallel, or meet at communal hubs. Loud, legible, built for everyone on
the map. Light-only — the poster does not have a dark mode.

Source design: claude.ai/design project "Queer Guide subway map design"
(`Pattern Library.dc.html` + `Brand Guidelines.dc.html` + `Icon System.dc.html`).
Spec: `docs/superpowers/specs/2026-08-09-design-system-foundation-design.md`.

**`src/components/admin/design/tokenCatalog.ts` is the machine-readable source
of truth** and is drift-tested against `src/index.css` on every PR. This
document is prose; where the two disagree, the catalog is right.

## Hard rules

- A **single** illustrative transit line is never straight — every line bends.
  Octilinear network diagrams (segments snapped to 0/45/90°) are the documented
  exception: a whole network bends constantly, and it is the straight runs
  between bends that make it read as a map rather than a squiggle. See
  _City network diagrams_ below.
- The master symbol is black-only: ink on paper, or reversed.
- Track colors are wayfinding, not decoration — one accent per context; the
  intersection gradient (`.intersection-gradient`) only where lines meet.
- Anton for display, Space Grotesk for everything else. One icon stroke weight.
- **Nothing square.** Four radius ranks — 26 page-level shells, 18 cards and
  fields, 12 chips and controls, 9 count marks — plus `rounded-full` for true
  circles: rings, bullets, avatars, dots.
- **Surfaces without cages.** A container never carries a frame. It separates
  from what surrounds it by sitting a tonal rung above (page → card → wash)
  plus one soft shadow. The only line permitted _between_ surfaces is a
  hairline at 7–13% ink, dividing rows in a dense list.
- **One elevation.** `--shadow-soft` at rest, `--shadow-soft-hover` on lift.
  No hard offset shadows, no stacked depth — and Tailwind's own
  `shadow-md/lg/xl/2xl` ramp stays ESLint-banned as a _competing_ ladder.
- A card fills ink on hover or lifts — never both.
- The exceptions to "no frame" are the boundaries a user has to be able to
  find: form controls (`border-input`) and the ink ring on a track-coloured
  mark (`border-track-ring`). Both are WCAG 1.4.11 obligations, not styling,
  and neither is negotiable.

## Tokens (src/index.css)

All colors are HSL channel values used via `hsl(var(--token))`. Light-only.

| Token                                    | Value                                                     | Usage                                          |
| ---------------------------------------- | --------------------------------------------------------- | ---------------------------------------------- |
| `--background`                           | `60 16.3% 91.6%` (#EDEDE6 frame)                          | **The page. Not paper.**                       |
| `--card` / `--popover`                   | `60 33% 97%` (#FAFAF5 paper)                              | The sheet, one rung above the page             |
| `--muted` / `--accent`                   | `60 22.2% 92.9%` (#F1F1E9 wash)                           | Insets, chips, card hover tint                 |
| `--surface-container-high`               | `60 13.2% 89.6%` (#E8E8E1)                                | Image wells                                    |
| `--foreground`                           | `0 0% 6.7%` (#111 ink)                                    | Type, marks, station rings                     |
| `--border`                               | `60 7.4% 81.4%`                                           | Row **dividers**, never a container frame      |
| `--border-hairline`                      | ink channels @ `--hairline-alpha` (12%)                   | The one line allowed between surfaces          |
| `--input`                                | `60 4.8% 44.9%`                                           | Form-control boundary — 3:1 on page _and_ card |
| `--track-ring`                           | `0 0% 6.7%`                                               | The ink ring a track-coloured mark wears       |
| `--muted-foreground`                     | `0 0% 33%`                                                | Secondary text                                 |
| `--destructive`                          | `0 70% 38%`                                               | **Danger. The only non-track semantic hue.**   |
| `--ring`                                 | `330 100% 56%`                                            | Focus ring (pink track)                        |
| `--radius-panel/container/element/badge` | `26 / 18 / 12 / 9 px`                                     | `rounded-full` for circles only                |
| `--shadow-soft` / `-hover` / `-lg`       | `0 16px 40px .06` / `0 12px 30px .13` / `0 24px 60px .10` | Rest / lift / floats over a scrim              |

**`--background` is not paper, and that is the load-bearing fact of the whole
system.** The page is a rung _below_ the card, and that step plus the soft
shadow is what replaced the 3px ink cage. Restoring `--background` to paper
without also restoring the cage yields an invisible card, not a subtler one.

`--radius-panel` and `--hairline-alpha` are declared in `@theme` only — they
are deliberately absent from `tokenCatalog.ts`, `functions/_lib/branding.ts`
and `branding_validate`, following the `--radius-full` precedent. That is what
keeps the re-skin free of a Supabase migration, and it matters: a full
`/admin/design` override is already within a handful of keys of
`branding_validate`'s 150-key ceiling. Cataloguing either one means raising
that cap in the same migration.

### Track colors — SEMANTIC wayfinding lines

| Token            | Value          | Hex     | Line               | Text on the fill |
| ---------------- | -------------- | ------- | ------------------ | ---------------- |
| `--track-pink`   | `330 100% 56%` | #FF1F8F | Feminine spectrum  | **ink** (5.2:1)  |
| `--track-blue`   | `193 100% 45%` | #00B4E6 | Masculine spectrum | **ink** (7.7:1)  |
| `--track-green`  | `136 75% 52%`  | #2BE05A | Non-binary         | **ink** (10.4:1) |
| `--track-yellow` | `50 100% 50%`  | #FFD500 | Agender / other    | **ink** (13.5:1) |

Rules (gated by `tokenContrast.test.ts`):

- **Fill-only.** A track color is never body text.
- **Ring-gated.** Blue/green/yellow measure under 3:1 against any light
  surface, so every track-coloured _mark_ carries a 1px `--track-ring` — WCAG
  1.4.11 is satisfied by fill-vs-ring. This is why a badge and a track-filled
  button keep an edge when cards lost theirs: a card frame is decoration, a
  track fill's ring is not. It is anchored to `--track-ring` rather than to
  `--foreground` so it stays ink in both modes and cannot invert.
  A track-coloured _line_ on a diagram is a different case — it is far past
  the size at which 1.4.11 applies and reads as illustration, which is why
  the mocks draw route lines with no casing.
- **Text-on-fill is ink on all four**, deviating from the source mock on a11y
  grounds: the mock puts paper on pink and cyan, which measure 3.4:1 and
  2.3:1. (This table said "paper" for pink until 2026-08-17 while the code
  and the test both said ink — the code was right.)
- **Colour is never the only cue** (WCAG 1.4.1). A track-coloured mark that
  encodes a state also carries a glyph or a text label; a bare coloured dot is
  decorative. No token guard can see this — it lives in the components.
- **One accent per context.** Never a rainbow of fills in one component; the
  four blend only in `.intersection-gradient` (master-symbol moments). The one
  exception is a _city network diagram_ (below), where the four colors are the
  artifact's own wayfinding vocabulary rather than decoration.
- **Never a state.** Track colors never reach /help, /safety, /report-*, the
  trip-safety briefing, the equality scale or any risk badge; all four hues
  sit >25° from the destructive red (hue-gated in the test).
- `--spot` / `--ink-blue` / `--ink-over` are **deprecated aliases** of
  pink/blue/green kept so old `bg-spot`/`bg-ink-*` call sites render until the
  Public/Admin phases retire them. No new code.

## Typography

Anton (display, single weight 400) + Space Grotesk (everything else, 400 for
reading, 700 for station names). Inter removed. Both self-hosted woff2
(`public/fonts/anton/`, `public/fonts/space-grotesk/`).

Rank table — ladder 96/76/52/32/20 px, adjacent ratios 1.26/1.46/1.63/1.60
(all ≥1.25 so every pair resolves as a different level):

| Rank | Token             | Size         | Face              | Belongs at                     |
| ---- | ----------------- | ------------ | ----------------- | ------------------------------ |
| 0    | `--text-hero-xl`  | 6rem/96px    | Anton             | Marketing covers only          |
| 1    | `--text-hero`     | 4.75rem/76px | Anton             | Page h1                        |
| 2    | `--text-display`  | 3.25rem/52px | Anton             | Section h2                     |
| 3    | `--text-headline` | 2rem/32px    | Anton             | Sub-section / large card title |
| 4    | `--text-title`    | 1.25rem/20px | Space Grotesk 700 | Card titles, row titles        |
| —    | `--text-body-lg`  | 1.0625rem    | Space Grotesk     | Long-form prose (not a rank)   |

A card title may never use the same token as the section heading above it.
Anton is never letterspaced apart (tracking ≥ -0.02em, tight); the eyebrow
convention (`text-2xs uppercase tracking-wide`) stays the one wide-tracking
exception. Micro-scale (`--text-15/13/xs2/2xs/3xs`) unchanged.

**Changing a size token is still a multi-layer change**: `src/index.css`
(`@theme` + `@source` safelist) → `tokenCatalog.ts` → `functions/_lib/
branding.ts` SIZE_KEYS → `src/lib/utils.ts` customTextSizes → a migration on
`branding_validate` (which RAISEs on unknown keys — check `site_branding` and
`site_branding_versions` before _removing_ one). The radius trio was ZEROED,
not deleted, precisely to avoid that procedure and keep every
`rounded-container/element/badge` call site valid.

## Page layout

One primitive frames every page: **`<PageContainer>`**
(`src/components/layout/PageContainer.tsx`). Never hand-roll
`container mx-auto px-4 py-8` — ESLint errors on it in `src/pages/**`
(`queerguide/no-hand-rolled-page-wrapper`).

| Aspect      | Value                                                  | Token                                   |
| ----------- | ------------------------------------------------------ | --------------------------------------- |
| Gutter      | `px-4 sm:px-6 md:px-8`                                 | `PAGE_GUTTER`                           |
| Vertical    | `py-8 md:py-12` — the ONE rhythm, no per-page override | `PAGE_VERTICAL`                         |
| Default cap | 1600 — grids, listings, detail pages                   | `--container-page` → `max-w-page`       |
| Reading cap | 768 — long-form prose                                  | `--container-reading` → `max-w-reading` |
| Form cap    | 512 — auth, steppers, single-column forms              | `--container-form` → `max-w-form`       |

- `size="reading" | "form"` picks the measure. Default is `page`.
- `flush` drops the vertical for a page that owns its own bands (heroes, the
  home rails, `SinglePage`'s three spine blocks). It never drops the gutter.
- `as` renders a different element (`article`, `section`, `header`, `footer`).

**The gutter ladder is the same one `Header` and `Footer` use.** That is the
whole point: a page's first pixel of content sits on the same vertical as the
nav tab above it, at every breakpoint. Full-bleed bars (header rows, the
breadcrumb bar, tinted home bands) stay full-bleed — their rule or tint IS the
band's edge — and take the cap on their _content row_ only.

**A bleed is a ROUND TRIP: `PAGE_BLEED` out, `PAGE_GUTTER` back in, and no
second cap.** The inner row must return to its container's content box exactly.
`SectionNav`'s row carried `max-w-screen-2xl` (1536) while the bleed had landed
it on the page container's 1600 box, so `mx-auto` split the 64px difference into
32px of margin per side and its tabs sat 32px right of the cards below —
measured on prod at 1990px, tabs at 259 vs content at 227. It is exactly zero
below 1536px (`max(0, (min(1600, vw) - 1536) / 2)`), so only large desktops ever
showed it. If a row needs a cap at all it is `max-w-page`, the one the frame
uses; `RouteStrip`'s row takes the gutter and no cap, which is the shape to
copy. Also import `PAGE_BLEED` rather than restating `-mx-4 sm:-mx-6 md:-mx-8`
— a hand-written copy is how the two drift. Guarded by the `bled bars align
with the content column` block in `e2e/page-layout.spec.ts`, which asserts the
row against **its own parent**, not against the page column: `/tags`' spine
bleeds inside the glossary's two-column body, so its row correctly lands at 448
and a page-column assertion would fail a bar that is right.

Why 1600 rather than the `max-w-7xl` (1280) it replaced: the cap exists to stop
grids spreading, and 1280 left roughly a third of a common desktop viewport as
dead margin. Prose does not scale with it, which is what the second and third
tokens are for.

Adding a container token is a **three-layer** change — `src/index.css` `@theme`,
the `customContainerSizes` list in `src/lib/utils.ts` (tailwind-merge only knows
t-shirt sizes in the `max-w` group, so without it two caps apply at once and
stylesheet order decides), and this table. It does **not** touch `tokenCatalog`
or `branding_validate` — those enumerate colour and text-size keys only.

One bespoke width survives, deliberately: `LegalPageLayout` at 1100px. It is
prose with a 224px sticky rail beside it, so the page cap would stretch legal
text to an unreadable measure and `reading` would leave the prose ~430px. This
is also why policy routes are **not** in `e2e/page-layout.spec.ts` — that spec
asserts the page container's content edge equals the header's, which a 1100 cap
deliberately fails at wide viewports.

Admin uses the same standard from one place: `AdminShell`'s `<main>` applies
the ladder plus a `max-w-page` inner wrapper, and admin **pages render bare
content** — adding their own `p-6` on top is what produced 48px gutters on some
pages and 16px on others across six different content widths.

### Sticky control bands — what may live in one

Alignment is not the only axis a page can fail on. `e2e/page-layout.spec.ts`
carries a second describe block (`mobile density`) with two viewport-relative
budgets at 390×844: sticky chrome ≤ **0.30** of the viewport, first content
within **1.25** screens. `/cities` satisfied the whole alignment contract while
its sticky filter band stood at 238px and the first card sat 1,271px down — a
page can pass every automated gate and still be unusable on a phone.

**A row in a sticky band is charged against every screen of results for the
whole session.** So:

- **Nothing in a sticky band may `flex-wrap`.** One scrollable line
  (`overflow-x-auto`), never two stacked ones. `/events`' result bar measured
  175px for content 44px tall purely because it wrapped to three lines.
- **A control earns its row or it moves out.** Not "should it be reachable" —
  everything should — but "is it worth a permanent tax". Search and a Filters
  door earn it; chips that are the page's primary navigation earn it. A result
  count, a sort select and a view toggle do not: none is re-reached while
  scrolling, so they belong in a non-sticky header above the grid
  (`EventsResultHeader`). The long tail belongs in a Sheet
  (`MarketplaceFilterSheet`, `EventsFilterSheet`) — never an inline panel,
  which pushes the results down by its full height on the one interaction that
  means "show me more".
- **Budget every control at 44px, whatever the `h-*` says.** `src/index.css`
  sets a global `min-height: 44px` on `a, button, input, select, textarea,
summary` for WCAG 2.5.5, and min-height beats the height utility at the
  box-model level. `h-8` chips and `h-10` inputs all render 44 tall. Only
  `.rounded-badge` opts down (to 24px, WCAG 2.5.8). A band budgeted on the
  class names comes in ~30% over.
- **How many rows fit depends on the hero above it.** `/marketplace` carries
  three rows in its band and passes; `/events` carries two, because its
  `PageHero size="md"` is 333px at 390px wide and the two pages are spending
  from the same 1.25 screens.

## Depth

There is exactly **one** elevation, and it does two jobs.

- **Rest.** Every card carries `--shadow-soft` (`0 16px 40px` at 6% ink) —
  baked into `Card`, not opt-in. Together with `bg-card` sitting a rung above
  `--background`, that pair _is_ the card's edge. Remove either and the card
  stops existing rather than getting flatter.
- **Lift.** Interactive cards add `.card-lift`: hover/focus translates −3,−3
  and deepens to `--shadow-soft-hover` (`0 12px 30px` at 13%). Small tiles:
  `.card-lift-sm` (−2). Live/urgent: `.card-lift-accent` tints the lift pink.
  Pressing seats the card back to `--shadow-soft` — **not** to `none`, which
  would drop it flat into the page mid-tap.
- **Floats.** Dialogs, sheets and the search command plate take
  `--shadow-soft-lg` (`0 24px 60px`) because they sit over a scrim rather
  than on the page.
- `shadow-md/lg/xl/2xl` remain ESLint errors. Soft depth being legal here does
  **not** make Tailwind's ramp legal — it is a second, competing ladder.
- `.card-lift-invert` was deleted with the hard shadows. A card on an ink band
  cannot use the shared elevation at all: a black blur is invisible on ink and
  a paper-coloured blur reads as a halo, not depth. Such a tile separates by
  surface tint (`bg-background/10`) and deepens that tint on hover — see
  `src/pages/About.tsx`.
- The PASTE-UP `.plate-offset` misregistration layer, halftone screens,
  deckle, duotone and paper grain were deleted; their class names are inert
  until the remaining phases remove the call sites.

Until 2026-08-17 this section described the opposite system — a hard `6px 6px
0` ink offset, no shadow at rest, and a 3px ink border on every surface. If
you find a component still drawing that, it is a straggler from the sweep, not
a second sanctioned treatment.

## Core patterns (`src/components/transit/`)

- **`TransitIcon`** — 42-icon wayfinding set (stroke-only, currentColor, round
  terminals, one station ring per icon; stroke weight bumps below 32px).
  Never takes track colors. Never mix with lucide in the same surface —
  lucide remains the default for UI chrome until a surface is migrated.
- **`StationRing`** — open ring = place · filled track = typed entity ·
  filled ink = done/past.
- **`RouteBullet`** — letter = content type, color = its line; the mapping
  table is `routeBulletMap.ts` (single point of change). 2px ink ring.
- **`DepartureRow`** — bullet · time · title · status.
- **`LineStepper`** — progress is always a bending line with stations.
- **`RouteStrip`** — a long document's table of contents _as a route_: sections
  are stations on a line, `depth: 2` renders `<h3>` sub-stations. Vertical for
  a sticky rail, horizontal for the mobile band (same bleed grammar as
  `SectionNav`). Stations are `<a href="#id">`, never buttons — see below.
- **Buttons** — `default` (ink fill), `outline` (2px ink border, hover fills
  ink), `accent` (pink), `brand` (blue), `destructive` unchanged.
- **`LoadMore`** — sentinel plus button. See _Loading more_ below.

### Loading more

Five surfaces paginated five different ways, and only `/search` was correct:

| Surface          | What it had                                             |
| ---------------- | ------------------------------------------------------- |
| `/search`        | Observer, latched, disconnect before the await          |
| `/venues`        | Observer, async callback, **no latch**, cap of 50 items |
| `/personalities` | Observer, async callback, **no latch**, cap of 48 items |
| `/events`        | **No observer at all**, button gated on a dead counter  |
| `/marketplace`   | Manual button only                                      |

**The latch is the point.** An `IntersectionObserver` keeps delivering entries
until it is disconnected, and the two async callbacks awaited a fetch before
React had re-rendered with `loading = true`. Every entry in that window
re-entered, read the same `page` from the same stale closure, and called
`setPage(page + 1)` again — so the list could skip a page. Guarding on
`!loading` cannot fix that; disconnecting before the await is what does.

**`autoLoadLimit` is what makes the latch safe to have**, and it arrives in the
same change for a reason. The observer re-arms when `loading` settles, and on a
virtualized grid that instant can be an unmeasured frame — rows unsized, the
sentinel sitting under a collapsed container, trivially inside the margin. So a
correct latch turns "fires twice by accident" into "walks the list forward on
its own": `/personalities` reached **page 3 before the reader touched
anything**. The old double-fire had hidden this by re-reading the same stale
page, producing one net advance from two ticks.

The cap is counted in **loads, not items**. The two pages that had one expressed
it in items against a page size of 24 and picked different numbers — 50 and 48 —
which nobody decided: 50 buys a silent third auto-load (24 → 48 → 72, clamped)
where 48 stops after the second. Two loads is the documented default.

`autoLoadLimit={0}` is button-only, and two surfaces take it: `/marketplace`
(a browse grid that should not fetch while someone skims) and `/personalities`
(which owns a `?page=N` deep-link contract, so an auto-load walks the URL
forward as well as the layout).

**The button is not a fallback.** It is the primary control for anyone using a
keyboard, and it renders whether or not the sentinel ever fires. `/venues` and
`/events` previously gated theirs behind a counter, so on `/venues` no button
existed until 50 items had auto-loaded, and on `/events` none could ever exist.

### City network diagrams

City cards — on the homepage and across the `/cities` directory — carry an
octilinear abstraction of that city's **real** rapid-transit network — Berlin's
U-Bahn, Lisbon's Metro, Melbourne's trams — instead of a decorative squiggle.
`src/components/home/subway/CityNetwork.tsx` renders it; `cityNetworkGeometry.ts`
is generated by `scripts/generate-city-transit-lines.mjs` from OpenStreetMap
route relations and committed, so nothing is fetched at runtime and every
diagram is reviewed once by eye.

Two rules bend here, both on purpose:

- **All four track colors appear at once**, assigned by line length rank
  (flagship = pink). Here the four colors ARE the wayfinding vocabulary — the
  same job they do on a real network map — so "one accent per context" would
  make the artifact unreadable rather than calmer. This is the only sanctioned
  four-track surface outside `.intersection-gradient`.
- **Segments run straight** between 45° bends. Coordinates sit on an integer
  lattice, so a diagonal step of _k_ is exactly (±k, ±k) and "every bearing is
  a multiple of 45°" is exact arithmetic in `cityNetworkGeometry.test.ts`, not
  a tolerance.

Lines are **bare strokes — no ink casing** (design decision, 2026-08-14): a
black outline reads as a border around a shape rather than as a route, which is
the one thing the diagram must not look like. The border-gating rule still
governs filled shapes; a route line is not one. Trunk-sharing lines are instead
separated by small **integer** nudges, and no difference between two nudges is
axis-aligned or diagonal, so two lines can never re-converge along any heading
they are allowed to run in — without that, New York's R/N/F/M landed on
identical pixels and only the last color drawn was visible.

Cities with no rail network fall back to the bending template line, which is why
hard rule #1 still governs the single-line case.

**307 cities have committed geometry, against 2,142 in the directory, so the
fallback is still the common case and the difference has to be VISIBLE.** A real network
is captioned with its mode ("Metro network" / "Light rail network" / "Tram
network"); a template line is captioned with nothing at all, and that absence is
the signal. Never caption the fallback — a page that tells a reader every city has
a metro is lying at scale, and the four track colours plus a named mode are what
make the real ones read as a map of something.

**Which template a city gets is derived from a hash of its slug**
(`templateIndexFor`), never from its position in a grid. `index % 4` across a
four-column layout gives every card in a column the same shape in the same colour
— the page draws vertical monochrome stripes — and because sorting and filtering
reshuffle positions, each card's shape would also change under the reader.

The card that carries a diagram must not also carry a chromatic equality dot: the
green track is 6.5° from the very-high tier's green and the yellow track 4.7° from
moderate's, so two colour systems twenty pixels apart would be saying "line 3" and
"this country is safe" in nearly the same hue. `EqualityChip variant="ink"` exists
for that surface. **No automated check can catch this** — an SVG stroke has no
`background-color`, so the sanctioned-ink sweep in `e2e/design-system.spec.ts` is
blind to track colour drawn as a line.

**Two variants.** `card` draws the full 200×110 frame and is sized by width —
the homepage tiles, a destination card's cover. `thumb` crops to that city's own
bounding box and fits the container, with `vector-effect: non-scaling-stroke` so
the line lands at the same weight whatever the crop; use it for square boxes,
64–96px thumbs and anything embedded in another card. The station ring is scaled
off the crop rather than fixed, or it would be a dot on a sprawling network and a
blob on a compact one.

**`hasCityNetwork(slug)` is the integration point.** Most cities have no
geometry, so a surface must ask before it commits: the diagram _replaces a
meaningless placeholder_ — the initial-letter tile on `/cities`, the generic
`Globe` glyph in search, the deterministic stock skyline that belongs to no
particular city — and never replaces a real photograph of the place. Only the
homepage passes `index`, which opts into the template line; everywhere else a
city we have no geometry for keeps whatever placeholder it already had.

**On a city SINGLE the fallback is forbidden outright** — the caption rule above
governs the CARD, where a hole in the grid would be worse. `CityNetworkPanel`
(`src/components/geo/`) gates on `hasCityNetwork(slug)` and renders nothing
otherwise. A template squiggle is a fine ornament in a card grid that must have
no holes; drawn under a heading that says "Getting around" it is a claim about
that city's transit, and 22 of ~3,070 cities have one. The panel also renders
the line refs as a legend — that is what makes the same geometry information
rather than decoration, and it is why the panel is not `aria-hidden` while the
card's copy is. It sits in the travel section, deliberately far from the safety
verdict in the rail: the four-hue vocabulary must never share a viewport with a
risk badge.

**Coverage is a population-ordered PREFIX, not a threshold.** The sweep walks
cities biggest-first, so it can be stopped at any point and the result is still
the best available set — which matters because Overpass throttles a long run
down to a crawl (measured: 2/min falling to 0.39/min after a few thousand
requests). Everything listable down to ~180k is covered. To extend it, re-run
the generator: every city already fetched is served from
`scripts/output/.overpass-cache/`, so only the new tail costs anything, and
`--cached-only` re-derives the committed file from disk without fetching at all.

Geometry is derived from © OpenStreetMap contributors and licensed ODbL;
the credit sits in the site footer alongside the map's.

### Owner modules that cannot render (measured 2026-08-15)

Two types own a module the corpus cannot fill. Both are absent rather than
faked, and the numbers are here so the next person does not re-derive them:

| Type  | Owner module        | Reality                                                                                                                                                                                                  |
| ----- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Venue | 02 Hours table      | `venues.hours` on **626 of 23,335** live rows (2.7%). Free-form jsonb, only the scraper path fills it.                                                                                                   |
| Event | 03 Occurrence board | **`event_occurrences` has 0 rows.** Specced in `20260429130000` with an expansion function, never populated. `is_recurring` is true on 1,098 of 39,899, but a recurrence PATTERN is not a list of dates. |

Two required modules are in the same position: venue module 04 (access) has
**6** rows with `accessibility_attributes`, and event module 08 (nested venue)
resolves for **0.8%** — `events.venue_id` is set on 339 of 39,899.

Rule 2 governs: they do not render. Do not wire an empty `OccurrenceList`, and
do not synthesise occurrences from an RRULE at render time — that puts times on
screen nothing has validated.

The inverse is also worth stating, because it is where the value was: the event
page rendered **none** of `events.tags`, which is populated on **82.5%** of the
corpus (32,910 rows). Check what IS filled before building for what should be.

### Geo singles (city / country / queer village)

Five types now render `SinglePage` — city, country, queer village, venue and
event. Organisations and milestones are still on `EntityDetailScroll`; a
descriptor moves when it grows a `single` block (`entityDescriptor.ts`).

The geo three render `SinglePage` with the module stack their type declares in
`src/config/singleModules.ts` — city owns Map inset, country owns Version
history, village owns Stop list. Shared pieces live in `src/components/geo/`.

Four rules, each of which was a bug before it was a rule:

- **Sections and route-rail stations come from one array.** `geoSections()`
  filters the definitions and `geoStations()` reads the filtered result, so a
  station cannot outlive the section it points at. The filter sees `null` /
  `undefined` / `false` / `[]`; it cannot see a component that returns `null`
  from its own body.
- **A self-hiding composite rail is never a section.** `PersonalitiesForEntity`,
  `NearbyTriptych`, `TrendingStrip`, `GuidesRail` and friends decide internally
  whether they have data, so each one used as a section leaves a dead station.
  They render in the page footer, which has no stations.
- **The route rail renders twice**, horizontal at the top of the body and
  vertical in the rail, because `SinglePage`'s 360px rail reflows _under_ the
  body on mobile — a rail-only TOC lands below the content it indexes. Same
  two-render pattern as `/tags`' `CategoryTreeRail`.
- **The census strip renders unconditionally**, zeros included. Gating it on a
  non-zero count unmounts a masthead row and shifts the page under the reader
  (`/marketplace` learned this one).

Safety composes rather than restyles: `GeoSafetyBanner` wraps the unmodified
`SafetyAlertBanner` + `GatedContentNotice`, and `GeoSafetyVerdict` is the shared
verdict tile. It stays monochrome + `--destructive`, gates on `useTripSafety`'s
settled status, and is deliberately **not** a `SidebarCard tone="ink"` even
though the spec reserves that inversion for safety blocks — `bg-destructive/10
text-destructive` on flooded ink is unreadable. The country single keeps its own
richer `SafetyVerdict` instead; six assertions in `rights-safety.spec.ts` bind
to its copy.

### The policy line

A policy is a line; each `<h2>` is a station. `LegalPageLayout` +
`RouteStrip` + `policyLines.ts` implement it for `/terms`, `/privacy`,
`/cookies`, `/dmca` and `/accessibility`; `/legal` is the route index.

Line identities live in `src/components/transit/policyLines.ts`, **not** in
`ROUTE_BULLET_MAP`: that table is keyed to the `search_documents` entity vocab
and is the source of truth for the map's layer colours (`mapPalette.test.ts`
asserts the two agree). Policies are not entities, and would collide anyway —
`T`-blue is already `trip`, `C`-yellow already `country`. `RouteBullet` takes
optional `letter`/`track`/`label` overrides for exactly this case.

Terms `T` blue · Privacy `P` green · Cookies `C` yellow · Copyright `©` pink ·
Accessibility `A` **ink**. Accessibility runs monochrome on purpose: a page
about not depending on colour must not use colour as its only identity.

Three rules the implementation exists to hold:

1. **Every section is addressable.** Stations are anchors that write the
   fragment, and `extractSections` gives every `<h2>`/`<h3>` a stable id. The
   old TOC was `<button>` + `scrollIntoView` and wrote nothing, so no clause of
   any policy could be linked or shared.
2. **Section numbers come from a CSS counter, never from the prose.**
   `.qg-cms-body--legal h2::before` renders the station circle;
   `stripTypedNumber` removes any hand-typed `1.` from the DOM so the two can
   never disagree.
3. **The fragment is written only once the reader moves between stations**
   (`replaceState`, so scrolling never fills the Back button). Seeding it on
   load turned every policy URL into a section URL.

Scroll-spy is a rAF-gated scroll listener, **not** an IntersectionObserver: IO
reports changes in intersection, and a heading far above the fold has none left
to report, so after a jump to section 11 the rail stayed pinned to section 1.

## Brand (`src/components/brand/`)

- **The logo is the `Wordmark`, alone.** Lowercase Anton "queer.guide", ink
  only. The design project's brand rules: _"It never takes color, gradients, a
  symbol or a container."_ §03 adds the two rules that bite in code — **clear
  space** ("half the cap height on every side. Nothing sits inside it, no line,
  no station dot, no badge") and **one case** (always lowercase, always with the
  dot; never "Queer Guide"). The wordmark once nested a pink heart at the g's
  descender; that is **removed on purpose, do not re-add it**, and it also
  dropped a hand-measured `right-[2.02em]` that held only for that string, face
  and tracking.
- **`MasterSymbol` is GONE (2026-08-19).** "Cupid's transit" is retired — it
  "survives only on the Logo Options sheet as history". It used to sit beside
  the wordmark in the header and footer, and three more lockups in the auth
  flow paired a lucide heart with "Queer Guide" in Space Grotesk (one of them
  with `gradient-text` and `animate-pulse`). All are the wordmark now. The
  header can no longer drop the wordmark below `sm` — it steps down to 17px,
  inside §03's 16px floor.
- **The app icon is the Icon System's "Rainbow" glyph**, reused verbatim from
  `TRANSIT_ICON_PATHS` so there is no second copy to drift. A wordmark cannot be
  a favicon (Anton at 16px is illegible), and the obvious candidate does not
  work: **"Route" was measured and rejected** — its station rings are radius 7
  against a stroke of 9–11, so the 1.5–3.5 unit hole fills in at every weight
  and the glyph reads as a dumbbell, breaking the set's own "open circles, never
  a filled dot" rule. It is legible in a row of icons, where neighbours give it
  context; a browser tab gives none. Rainbow's arcs are 16 units apart against a
  9 stroke.
- Two renditions must not drift: `public/favicon.svg` (the source every icon
  PNG and the .ico are rasterised from) and the OG composition in
  `scripts/generate-brand-assets.mjs` (the wordmark alone, no `<path>` at all).
  `__tests__/brandAssetSync.test.ts` pins both, asserts the icon bends, and
  fails if any hue reappears in either.
- Icons / maskables / favicon.ico / OG regenerate via
  `node scripts/generate-brand-assets.mjs` — playwright, no `sharp` (which was
  never installed, so the script could not run and the icons drifted).

## Site chrome (`src/components/layout/`, `src/components/search/`)

Header, search and footer moved onto the map 2026-08-15 (#2775, #2781).

### Floating islands (design panels 10-12)

The chrome does not span the window. The top bar and the phone dock are
**islands**: inset on every side so the page's own ground shows through, and
separated by elevation alone. Geometry is the `.island` utility in
`src/index.css`; surface stays with the component, because the top bar swaps to
ink when it collapses and the dock is ink from the start.

|                  | phone                     | `md:` and up           |
| ---------------- | ------------------------- | ---------------------- |
| `--island-inset` | 14px                      | 22px                   |
| radius           | `--radius-island-sm` 20px | `--radius-island` 22px |
| shadow (paper)   | `--shadow-island-sm`      | `--shadow-island`      |
| shadow (ink)     | `--shadow-island-ink-sm`  | `--shadow-island-ink`  |

Four rules, each enforced in the utility rather than left to call sites:

1. **Islands float, they never span.** Inset on all four sides, and the gap is
   FIXED — nothing in `.island` transitions, so a sticky island cannot animate
   its gap shut on scroll. The header sets the same value on `top` and
   `margin-top` for the same reason: the gap that exists at rest is the gap it
   keeps once it sticks, so the bar never jumps when it detaches.
   **They do not grow past the content column either** — `.island-capped` (the
   header) stops the plate at `min(--container-page, 100% - 2*--island-inset)`.
   Bare `.island` widens with the window while its contents stay capped, which
   past ~1710px leaves empty plate on both sides: measured **205px per side at
   1990px**, and read as a broken bar. Capping makes the island's box the
   page's own container box, so its contents keep landing on the page
   content's vertical with the gutter as the only inset. The phone dock stays
   bare `.island` on purpose — it is window-width by design.
2. **One indicator per page.** An island's underside progress hairline is
   opt-in, because a page that already draws a reading-progress line
   (`ReadingProgressBar`) must not answer "where am I" twice.
3. **Elevation is the only edge.** No keyline on an island, ever. The shadow is
   22% against a card's 6% _because_ there is nothing under it — put a border
   back and the depth reads as a mistake.
4. **The dock owns the bottom on phones.** It never scrolls away. This replaced
   a hide-on-scroll transform, and the reason is not cosmetic: nothing collapses
   into a hamburger any more, so the dock is the only navigation a phone reader
   has. Hiding it on the gesture people use most stranded them with the
   browser's back button.

**The inset is a token because a guard reads it.** `e2e/page-layout.spec.ts`
asserts that a page container's content edge and the header's differ by exactly
`--island-inset`; before the islands it asserted they were equal. Change the
inset in `src/index.css` and the guard follows. Hard-code 22 anywhere and it
will not.

**Two offsets, both derived.** A full-width control band pins flush at
`STICKY_UNDER_HEADER`; a sidebar rail pins at `STICKY_RAIL_UNDER_HEADER`
(header + 1rem), because a tall column of links butting against the bar reads
as a collision where a band reads as a stack. The rails had already invented
that gap and each hard-coded its own version of it against the pre-island 64px
header — `top-[76px]` (64+12) on the glossary tree, `top-20` (64+16) on the
legal TOC, `top-24` (64+32) on News / Sitemap / Donate / EventDetail /
GuidePickBlock. When the header's underside moved to 82 the first two ended up
*behind* it (6px and 2px, measured on prod); the `top-24` group survived only
because its gap happened to exceed the drift. Flattening them all onto the band
offset would have thrown away a real intent, so the gap is expressed once and
derived.

**The island moved the header's underside, and one constant did not follow.**
`STICKY_UNDER_HEADER` carried `top-[60px] md:top-[64px]`, measured against a
header welded to `top: 0`. Once the header floats, its underside is
`--island-inset` lower, so every bar that constant positions — RouteStrip,
SectionNav, StickyLetterBar, the `/events` and `/cities` filter bars — pinned
*inside* the header: 10px behind it at 390px, 18px at 1440px, measured on prod.
It now reads `--header-pinned-bottom` (`--island-inset` + the bar's pinned
height: 56px on phones where it never collapses, 60px from `md` where it does),
and so does `html { scroll-padding-top }`, which had drifted the same way and
for the same reason. **Never re-inline a pixel value in either place** — a
height derived from the variable the header positions itself with cannot
desynchronise from it. Guarded by the `sticky bars clear the header` block in
`e2e/page-layout.spec.ts`, which scrolls first: this is a vertical failure that
does not exist at rest, which is why the alignment block above never saw it.

**Not implemented: a fixed desktop bottom dock.** Panel 10 draws one, and the
site already ends every page with a real footer (plus panel 09's compact
variant). A second permanently-pinned bottom bar on desktop would duplicate it
and occlude content on every route. The phone dock is the one the spec argues
for by name.

- **Header** — brand · search · actions on one row, then the six intent tabs as
  TRACK TABS under a 3px rule. Each tab is `TransitIcon` + label; the icon draws
  in `currentColor`, so it inverts with the active tab's ink fill for free.
  Colour appears once, as the 6px rule under the active tab — inactive rules are
  transparent, never a muted tint. `nav[aria-label="Primary"]` is unique
  (`MobileBottomNav` owns `"Navigation"`) and stays `md:`-gated, because
  `useIsMobile` flips at 768 and `lg:` would leave 768–1023px with no nav.
  `z-index` stays **40**: every portal renders at 50, and the 1100 this once
  carried painted the bar over its own menus.

- **Search is a command plate**, not a dropdown: centred, `max-w-[680px]`, top
  `8vh`, 4px ink border, `shadow-hard-lg`. Mobile keeps a full-screen sheet.

  **There is exactly ONE `role="combobox"` at any moment.** The field is _moved_
  between the bar and the overlay, never duplicated — two inputs claiming one
  listbox is ambiguous for a screen reader, and `e2e/search-ux.spec.ts` resolves
  the input first and then asserts `aria-expanded` flips on that same element.
  Both shells do this; on mobile it is also what makes the query visible at all,
  since the sheet is `inset:0` and covered the bar's field.

  **Focus restoration is a `useEffect` keyed on `isOpen`** — not Radix's
  `onCloseAutoFocus`, not a timer, not rAF. At callback time the field is still
  inside the _closing_ overlay, so the ref points at a node being torn down and
  focus lands on `<body>`. An effect runs after the commit that puts the field
  back. rAF was tried and is wrong: it does not run in a hidden tab, which is
  exactly when a queued restore would strand focus.

  Rows are `[RouteBullet] [name / subtitle] [kind]` — a mixed-type list is what
  the bullet exists to type, and half the corpus (cities, tags, people, guides,
  news) has no usable image, so the thumbnail well it replaced was mostly an
  empty grey square acting as a lookup key.

- **Footer** — the tracks band is **full-bleed**, outside the cap and the
  gutter; the columns, policy band and legal row keep `PAGE_GUTTER`. A track
  that stops in a margin reads as a graphic in a column, not as the network.
  It is ONE line with two stops (see `FooterTracks` for why four does not work
  at a footer's aspect ratio), and each ring sits on an ANCHOR of that path so
  it is exactly on the line at any width. Columns are one per intent,
  single-sourced from `INTENT_NAV` (including `children`), so the footer cannot
  drift from the topbar — the defect that once put `/venues` and `/people` out
  of reach of desktop chrome.

- **Footer, compact** (`<Footer variant="compact">`, panel 09) — one paper
  island on single-purpose flows and account screens (`isCompactFooterRoute` in
  `src/lib/locale.ts`: `/auth`, `/claim-username`, `/onboarding`, `/hub`,
  `/settings`). The full footer is a closing statement, and a sign-in form has
  not been making one. **Report and hotlines never drop, whatever else does** —
  they lead the row, ahead of privacy and terms, because that is the priority
  order rather than the conventional one. Prefix matching is exact-or-slash, so
  a future `/settings-export` is not an account screen.

- **Signal** (`src/components/notifications/SignalPanel.tsx`, panel 05) — the
  bell popover is an ISLAND, not a menu: paper, `rounded-container`,
  `shadow-soft-lg`, `p-0` so its own footer strip reaches the rounded edges, and
  no caret (the badge and the gap do the pointing). Three rules are
  load-bearing:

  1. **Safety never mixes.** `sos` pins above the list on ink, outside
     read/unread, with no dot — a standing condition, not an item you clear.
     "Cannot be marked read" is enforced in `mark_all_alerts_read` (migration
     `20260911150000`), not by the client filter: a rendering decision is not a
     guarantee. **Deviation:** the mock also says it does not count toward the
     badge. That is right for a venue advisory and wrong for a distress signal,
     so it stays counted.
  2. **Unread is a station dot** — presence/absence, not bold-vs-regular, so
     the cue survives colour-blindness; an `sr-only` label carries it for screen
     readers, and the read state keeps a transparent rim so both states are the
     same width.
  3. **The bullet is the track the alert rode in on**, resolved through
     `ROUTE_BULLET_MAP` via `RouteBullet` — never a second local colour table.
     A face beats a letter when the alert carries an avatar. Either way the mark
     is `aria-hidden`: it restates the row's own title, and `role="img"` with no
     name would read the raw subtype ("submission_update") before every one.

  The strip claims **no quiet hours** — there is no quiet-hours model in this
  product, and a fixed "23:00–09:00" would be a promise the notifier does not
  keep.

Two mock deviations, both deliberate: the results footer hovers to an underline
rather than pink (pink text on paper is 3.43:1, and track colour is fill-only),
and the plate keeps the global focus ring — `index.css` sets `*:focus-visible`
`!important` as the WCAG 2.4.7 guarantee, so a `focus-visible:outline-none`
there is a silent no-op that reads as if it did something.

## Crisis surfaces (`/help`, `/safety`, `/report-*`)

The canonical build is `/help` (`src/pages/HelpHotlines.tsx` +
`src/components/help/`). `CLAUDE.md` points at a Pattern Library "§A11y
exemption" for this — **that section does not exist**; this is the spec.

- **No track colors.** Not `RouteBullet`, `StationRing`, `AccessGrid`,
  `LineStepper`, `TrackLoader` (every `track` value is a track color),
  `.intersection-gradient`, or `Button variant="accent"|"brand"`. On these
  pages every visual distinction a reader makes is a risk judgement; teach
  them that hue means "content type" and the red warning becomes just another
  line color. `TransitIcon` is fine — it is `currentColor` by construction.
- **Weight comes from inversion and rules**, never hue: one ink-flooded plate
  (`rounded-panel` + `shadow-soft`; `SidebarCard tone="ink"` is the shared
  idiom), hairline dividers, and outline-on-ink buttons whose border IS the
  component. (This line said "3px ink borders + `--shadow-hard`" until
  2026-08-21 — that was the pre-soft-re-skin idiom; the tokens no longer
  exist.)
- **`--destructive` is rationed to danger _to the reader_.** On `/help` that
  is exactly three things: the emergency band, `QuickExit`, and the per-line
  "may contact police without your consent" strip. A fourth candidate must
  pass: _would a reader be harmed by not noticing this?_ An explicit
  non-carceral policy is a reassurance and renders in **ink**, not red —
  flattening the two into one color destroys the distinction.
- **Animation-free.** No `PageHeader` (hardcodes `.content-enter`), no
  `PageHero` (defaults to `effect="spotlight"`), no `EditorialDetailLayout` /
  `IntentPageLayout` / `SectionNav` (they pull `motion/react` and smooth
  scroll, and the layouts gate the whole page behind `loading` — which would
  put the emergency band behind a fetch). Copy `SectionNav`'s class string,
  not the component. Sheet/Dialog transitions and focus rings are sanctioned.
- **Unknown renders as silence.** A line whose hours we cannot structure is
  never labelled "Closed"; a line with no police-policy value shows nothing.
  Telling someone a crisis line is shut when it is open is the harmful
  direction, so every uncertainty resolves to null rather than false.
- **Life-safety blocks render synchronously** — outside any `loading`/`ready`
  branch, with inline English `t()` defaults, so a dead locale bundle or a
  failed CMS fetch cannot blank them. Guarded by `e2e/help-a11y.spec.ts`.
- **A card is not a lift unless it is one click target.** Hotline cards carry
  a Call button, channel buttons, a keep toggle and a report dialog, so they
  take no `.card-lift`; directory rows and org rows do.

Guarded by `e2e/help-a11y.spec.ts` (axe at 320 + 1280, no 320px overflow,
i18n-failure paint) and `e2e/help-crisis.spec.ts` (structured data matches the
recommended line, search cannot rewrite it, country lands in the URL,
directories are never callable, unstructured hours never read as closed).

## Dark mode

Removed 2026-08. `ThemeProvider` always reports light and strips persisted
dark state; the `.dark` CSS block is gone; `dark:` utilities in components are
inert and get deleted surface-by-surface in later phases.

## Enforcement

- `tokenCatalog.test.ts` — catalog ↔ index.css drift (light-only model).
- `tokenContrast.test.ts` — AA pairs, fill-only + border-gated track rules,
  hue distance from destructive.
- `e2e/design-system.spec.ts` — radius tokens, no shadow at rest + hard
  shadow on `.card-lift` hover, Anton/Space Grotesk/no-Inter, sanctioned
  saturated backgrounds (track colors + destructive only). The old border/line
  budget was deleted — ink borders are the idiom now.
- `e2e/page-layout.spec.ts` — the page-layout invariant: a page's outermost
  container's content edge equals the header's, across 12 routes ×
  390/768/1440/1920, plus no horizontal overflow. Asserts the _relationship_
  rather than pixel values, so it survives a change to the gutter ladder itself.
- `eslint.config.js` — hex/rgb/hsl literals, chromatic Tailwind classes,
  soft shadows, JSX gradients: unchanged and still errors. Plus
  `queerguide/no-hand-rolled-page-wrapper` on `src/pages/**` (a NAMED rule, not
  another `no-restricted-syntax` selector — that rule is replaced WHOLESALE per
  file in flat config, so a new selector would have to be re-stated in all four
  blocks and one miss silently disables load-bearing ones; precedent #2049).
