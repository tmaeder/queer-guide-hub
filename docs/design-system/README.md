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
- **Buttons** — `default` (ink fill), `outline` (2px ink border, hover fills
  ink), `accent` (pink), `brand` (blue), `destructive` unchanged.

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
- **`Wordmark`** — lowercase Anton "queer.guide", pink heart nested in the
  g's descender at `right-[2.02em] bottom-[-0.16em] w-[0.28em]`. Both numbers
  are Anton metrics: the tail terminal sits 2.32em from the string's right
  edge, so the heart tucks into the crook without sitting on the ink (it did,
  and read as a collision). Re-measure if the display face or tracking
  changes. Header default (the /admin/design logoUrl override keeps the img
  branch).
- The mark exists as three copies — component, `scripts/generate-brand-assets.mjs`
  (OG), `public/favicon.svg` (square crop, the source every icon PNG is
  rasterised from). `__tests__/brandAssetSync.test.ts` pins them together and
  asserts both tracks bend.
- Icons / maskables / favicon.ico / OG regenerate via
  `node scripts/generate-brand-assets.mjs` — playwright, no `sharp` (which was
  never installed, so the script could not run and the icons drifted).

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
- `eslint.config.js` — hex/rgb/hsl literals, chromatic Tailwind classes,
  soft shadows, JSX gradients: unchanged and still errors.
