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

- Illustrative transit lines are never straight — every line bends.
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
  four blend only in `.intersection-gradient` (master-symbol moments).
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
