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
  *City network diagrams* below.
- The master symbol is black-only: ink on paper, or reversed.
- Track colors are wayfinding, not decoration — one accent per context; the
  intersection gradient (`.intersection-gradient`) only where lines meet.
- Anton for display, Space Grotesk for everything else. One icon stroke weight.
- Squared corners everywhere except circles: rings, bullets, avatars.
- A card fills ink on hover or lifts with the hard shadow — never both.

## Tokens (src/index.css)

All colors are HSL channel values used via `hsl(var(--token))`. Light-only.

| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `60 33% 97%` (#FAFAF5 paper) | Page + card background |
| `--foreground` | `0 0% 7%` (#111 ink) | Type, rules, borders, station rings |
| `--border` / `--input` | `0 0% 7%` | Ink borders ARE the system |
| `--muted` | `60 9% 93%` | Subtle paper-tinted fills |
| `--muted-foreground` | `0 0% 33%` | Secondary text |
| `--destructive` | `0 70% 38%` | **Danger. The only non-track semantic hue.** |
| `--ring` | `330 100% 56%` | Focus ring (pink track) |
| `--radius-container/element/badge` | `0rem` | Squared. `rounded-full` for circles only |

### Track colors — SEMANTIC wayfinding lines

| Token | Value | Hex | Line | Text on the fill |
|-------|-------|-----|------|------------------|
| `--track-pink` | `330 100% 56%` | #FF1F8F | Feminine spectrum | **paper** (3.4:1) |
| `--track-blue` | `193 100% 45%` | #00B4E6 | Masculine spectrum | **ink** (7.7:1) |
| `--track-green` | `136 75% 52%` | #2BE05A | Non-binary | **ink** (10.4:1) |
| `--track-yellow` | `50 100% 50%` | #FFD500 | Agender / other | **ink** (13.5:1) |

Rules (gated by `tokenContrast.test.ts`):

- **Fill-only.** A track color is never body text.
- **Border-gated.** Blue/green/yellow measure under 3:1 against paper, so every
  filled shape carries a 2–3px ink border — WCAG 1.4.11 is satisfied by
  fill-vs-ink. Pink alone clears 3:1 bare and may draw borderless marks
  (focus ring, active-nav underline, ::selection).
- **Text-on-fill** deviates from the source mock on a11y grounds: ink on
  blue/green/yellow, paper on pink (the mock's paper-on-cyan is 2.3:1).
- **One accent per context.** Never a rainbow of fills in one component; the
  four blend only in `.intersection-gradient` (master-symbol moments). The one
  exception is a *city network diagram* (below), where the four colors are the
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

| Rank | Token | Size | Face | Belongs at |
|------|-------|------|------|------------|
| 0 | `--text-hero-xl` | 6rem/96px | Anton | Marketing covers only |
| 1 | `--text-hero` | 4.75rem/76px | Anton | Page h1 |
| 2 | `--text-display` | 3.25rem/52px | Anton | Section h2 |
| 3 | `--text-headline` | 2rem/32px | Anton | Sub-section / large card title |
| 4 | `--text-title` | 1.25rem/20px | Space Grotesk 700 | Card titles, row titles |
| — | `--text-body-lg` | 1.0625rem | Space Grotesk | Long-form prose (not a rank) |

A card title may never use the same token as the section heading above it.
Anton is never letterspaced apart (tracking ≥ -0.02em, tight); the eyebrow
convention (`text-2xs uppercase tracking-wide`) stays the one wide-tracking
exception. Micro-scale (`--text-15/13/xs2/2xs/3xs`) unchanged.

**Changing a size token is still a multi-layer change**: `src/index.css`
(`@theme` + `@source` safelist) → `tokenCatalog.ts` → `functions/_lib/
branding.ts` SIZE_KEYS → `src/lib/utils.ts` customTextSizes → a migration on
`branding_validate` (which RAISEs on unknown keys — check `site_branding` and
`site_branding_versions` before *removing* one). The radius trio was ZEROED,
not deleted, precisely to avoid that procedure and keep every
`rounded-container/element/badge` call site valid.

## Page layout

One primitive frames every page: **`<PageContainer>`**
(`src/components/layout/PageContainer.tsx`). Never hand-roll
`container mx-auto px-4 py-8` — ESLint errors on it in `src/pages/**`
(`queerguide/no-hand-rolled-page-wrapper`).

| Aspect | Value | Token |
|---|---|---|
| Gutter | `px-4 sm:px-6 md:px-8` | `PAGE_GUTTER` |
| Vertical | `py-8 md:py-12` — the ONE rhythm, no per-page override | `PAGE_VERTICAL` |
| Default cap | 1600 — grids, listings, detail pages | `--container-page` → `max-w-page` |
| Reading cap | 768 — long-form prose | `--container-reading` → `max-w-reading` |
| Form cap | 512 — auth, steppers, single-column forms | `--container-form` → `max-w-form` |

- `size="reading" | "form"` picks the measure. Default is `page`.
- `flush` drops the vertical for a page that owns its own bands (heroes, the
  home rails, `SinglePage`'s three spine blocks). It never drops the gutter.
- `as` renders a different element (`article`, `section`, `header`, `footer`).

**The gutter ladder is the same one `Header` and `Footer` use.** That is the
whole point: a page's first pixel of content sits on the same vertical as the
nav tab above it, at every breakpoint. Full-bleed bars (header rows, the
breadcrumb bar, tinted home bands) stay full-bleed — their rule or tint IS the
band's edge — and take the cap on their *content row* only.

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

## Depth

Soft elevation shadows stay banned (`shadow-md/lg/xl/2xl` are ESLint errors).
The sanctioned depth treatment is the **hard poster shadow**:

- Every bordered surface: 3px ink border, zero radius (`Card` does this).
- Interactive cards add `.card-lift`: hover/focus translates −3,−3 and casts
  `--shadow-hard` (`6px 6px 0` ink, no blur). Small tiles: `.card-lift-sm`
  (5px/−2). Live/urgent: `.card-lift-accent` casts in pink.
- The PASTE-UP `.plate-offset` misregistration layer, halftone screens,
  deckle, duotone and paper grain were deleted; their class names are inert
  until the Public/Admin phases remove the call sites.

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
- **`RouteStrip`** — a long document's table of contents *as a route*: sections
  are stations on a line, `depth: 2` renders `<h3>` sub-stations. Vertical for
  a sticky rail, horizontal for the mobile band (same bleed grammar as
  `SectionNav`). Stations are `<a href="#id">`, never buttons — see below.
- **Buttons** — `default` (ink fill), `outline` (2px ink border, hover fills
  ink), `accent` (pink), `brand` (blue), `destructive` unchanged.

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
  lattice, so a diagonal step of *k* is exactly (±k, ±k) and "every bearing is
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

**224 cities have committed geometry, against 2,142 in the directory, so the
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
geometry, so a surface must ask before it commits: the diagram *replaces a
meaningless placeholder* — the initial-letter tile on `/cities`, the generic
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

Geometry is derived from © OpenStreetMap contributors and licensed ODbL;
the credit sits in the site footer alongside the map's.

### Owner modules that cannot render (measured 2026-08-15)

Two types own a module the corpus cannot fill. Both are absent rather than
faked, and the numbers are here so the next person does not re-derive them:

| Type | Owner module | Reality |
|---|---|---|
| Venue | 02 Hours table | `venues.hours` on **626 of 23,335** live rows (2.7%). Free-form jsonb, only the scraper path fills it. |
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
  vertical in the rail, because `SinglePage`'s 360px rail reflows *under* the
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

- **`MasterSymbol`** — "Cupid's transit", one line left to right: arrow in,
  through the heart, out as a wavy exit. Black-only via currentColor.
  **Both tracks bend** — the entry ran straight (`H 134`) with its arrowhead
  stranded mid-shaft until 2026-08, i.e. the mark broke hard rule #1. Stroke
  15 in a 354-unit box (~4.2%) so it carries the same visual weight as
  `TransitIcon` beside it; at the old 12/360 the header mark drew ~1.3px
  strokes next to the icons' 2.4px. viewBox `0 24 354 190` is trimmed to the
  ink (~10 units of pad on every side) — the old `0 0 360 210` spent a third
  of the height on nothing.
- **`Wordmark`** — lowercase Anton "queer.guide", ink only. It carried a pink
  heart nested at the g's descender until 2026-08; that is **removed on
  purpose — do not re-add it**. The whole mark now obeys one rule, the
  master symbol's: ink on paper, or reversed. It also drops the wordmark's
  dependence on Anton's metrics (the heart needed a hand-measured
  `right-[2.02em]` that held only for that string, face and tracking).
  Header default (the /admin/design logoUrl override keeps the img branch).
- The mark exists as three copies — component, `scripts/generate-brand-assets.mjs`
  (OG), `public/favicon.svg` (square crop, the source every icon PNG is
  rasterised from). `__tests__/brandAssetSync.test.ts` pins them together,
  asserts both tracks bend, and fails if any hue reappears in any of them.
- Icons / maskables / favicon.ico / OG regenerate via
  `node scripts/generate-brand-assets.mjs` — playwright, no `sharp` (which was
  never installed, so the script could not run and the icons drifted).

## Site chrome (`src/components/layout/`, `src/components/search/`)

Header, search and footer moved onto the map 2026-08-15 (#2775, #2781).

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

  **There is exactly ONE `role="combobox"` at any moment.** The field is *moved*
  between the bar and the overlay, never duplicated — two inputs claiming one
  listbox is ambiguous for a screen reader, and `e2e/search-ux.spec.ts` resolves
  the input first and then asserts `aria-expanded` flips on that same element.
  Both shells do this; on mobile it is also what makes the query visible at all,
  since the sheet is `inset:0` and covered the bar's field.

  **Focus restoration is a `useEffect` keyed on `isOpen`** — not Radix's
  `onCloseAutoFocus`, not a timer, not rAF. At callback time the field is still
  inside the *closing* overlay, so the ref points at a node being torn down and
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
  Its four lines converge on one interchange, and each ring sits on a middle
  ANCHOR of its own path so it is exactly on the line at any width. Columns are
  one per intent, single-sourced from `INTENT_NAV` (including `children`), so
  the footer cannot drift from the topbar — the defect that once put `/venues`
  and `/people` out of reach of desktop chrome.

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
- **Weight comes from inversion and rules**, never hue: 3px ink borders, one
  ink-flooded panel (`SidebarCard tone="ink"` is the shared idiom), `--shadow-hard`.
- **`--destructive` is rationed to danger *to the reader*.** On `/help` that
  is exactly three things: the emergency band, `QuickExit`, and the per-line
  "may contact police without your consent" strip. A fourth candidate must
  pass: *would a reader be harmed by not noticing this?* An explicit
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
  390/768/1440/1920, plus no horizontal overflow. Asserts the *relationship*
  rather than pixel values, so it survives a change to the gutter ladder itself.
- `eslint.config.js` — hex/rgb/hsl literals, chromatic Tailwind classes,
  soft shadows, JSX gradients: unchanged and still errors. Plus
  `queerguide/no-hand-rolled-page-wrapper` on `src/pages/**` (a NAMED rule, not
  another `no-restricted-syntax` selector — that rule is replaced WHOLESALE per
  file in flat config, so a new selector would have to be re-stated in all four
  blocks and one miss silently disables load-bearing ones; precedent #2049).
