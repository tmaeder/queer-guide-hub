# Design System — PASTE-UP

Black ink on white paper, plus a three-drum risograph ink set. Flat, printed,
editorial. Content is the hero.

The reference is the queer flyer — the pasted-up gig poster, the community
bulletin board, the photocopied zine. Overlapping plates, misregistration,
halftone, hand-cut edges.

**`src/components/admin/design/tokenCatalog.ts` is the machine-readable source of
truth** and is drift-tested against `src/index.css` on every PR. This document is
prose; where the two disagree, the catalog is right.

## Tokens (src/index.css)

All colors are HSL channel values used via `hsl(var(--token))`.

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--background` | `0 0% 100%` (white) | `0 0% 4%` (near-black) | Page background |
| `--foreground` | `0 0% 4%` | `0 0% 96%` | Body text, primary UI |
| `--muted` | `0 0% 96%` | `0 0% 12%` | Subtle backgrounds |
| `--muted-foreground` | `0 0% 35%` | `0 0% 68%` | Secondary text |
| `--accent` | `0 0% 96%` | `0 0% 12%` | Interactive hover states |
| `--border` | `0 0% 58%` | `0 0% 37%` | Hairlines (being retired in favour of plates) |
| `--destructive` | `0 70% 38%` | `0 84% 62%` | **Danger. The only semantic hue.** |
| `--ring` | `0 0% 4%` | `0 0% 96%` | Focus rings |
| `--radius-container` | `0.5rem` | — | Cards, sheets, dialogs, hero blocks |
| `--radius-element` | `0.25rem` | — | Buttons, inputs, list rows |
| `--radius-badge` | `0rem` | — | Chips, tags, status pills |

Card, popover, primary, secondary tokens mirror foreground/background. The
surface ladder (`--surface-container*`), text hierarchy (`--text-*`) and sidebar
family are in `src/index.css`.

### The ink set

| Token | Light | Dark | vs page | Type on it |
|-------|-------|------|---------|------------|
| `--spot` (= `--color-ink-pink`) | `330 95% 55%` | `330 100% 66%` | 3.74 / 6.61 | black — 5.29 / 6.61 |
| `--ink-blue` | `223 88% 46%` | `219 90% 62%` | 7.00 / 5.54 | white / black — 6.41 / 5.54 |
| `--ink-over` | `285 75% 40%` | `285 90% 70%` | 7.22 / 6.96 | white / black — 6.61 / 6.96 |

`ink-pink` is a `@theme` **alias** of `--spot`, not a second declaration, so one
runtime override in `/admin/design` moves both and they cannot drift.

**The ink is non-semantic by construction.** This is the entire reason chromatic
brand colour is safe on a product used in criminalising countries:

- Red means danger. Ink means nothing at all — it is a drum on a press.
- An ink may never encode a state, a status, or a risk level.
- An ink may never be body text. `tokenContrast.test.ts` lists them in
  `NON_TEXT_ON_PAGE` (3:1 fill bar) and asserts they are absent from
  `TEXT_ON_PAGE`. Type on a plate uses the paired `*-foreground`, gated at 4.5:1
  through `CONTRAST_PAIRS`, and flips by mode because the inks do.
- An ink may never appear on `/help`, `/safety`, `/report-*`, the trip-safety
  briefing, the equality scale, or any risk badge.
- `tokenContrast.test.ts` asserts every ink stays >25° from the `--destructive`
  hue, so a decorative plate can never be mistaken for a danger signal.

Adding or renaming an ink touches **four layers in lockstep** or CI goes red:
`src/index.css` → `tokenCatalog.ts` (`COLOR_TOKENS` + `CONTRAST_PAIRS`) →
`functions/_lib/branding.ts` `COLOR_KEYS` → a migration extending
`branding_validate`'s `v_color_keys` (precedent:
`supabase/migrations/20260808100000_branding_pasteup_ink_tokens.sql`).

## The print layer

Structure is carried by a **filled plate**, not by a 1px line and never by a
shadow. Utilities live in `src/index.css`; components only apply class names.

| Class | What it is |
|-------|-----------|
| `.plate` / `.plate-ink` / `.plate-blue` / `.plate-over` | Flat fills. The tonal step against the parent is the edge, measured ≥3:1 (WCAG 1.4.11). |
| `.plate-offset` | Misregistered second plate on a `::before`, snapping into register on hover/focus. A positioned element, **not** a `box-shadow`. |
| `.halftone-pink` / `-blue` / `-ink` | Dot screens, one per drum, offset so they interleave instead of moiré-ing. Texture only — never put small text on one. |
| `.paper-grain` | Stock texture. `.bg-noise` retuned up and retiled. |
| `.overprint` | `multiply` on paper, `screen` on a dark page — the physics inverts. Decorative only; the composite is unmeasured. |
| `.deckle-bottom` | Torn-edge mask for full-bleed band boundaries. |
| `.duotone-riso` | Two-drum photo separation. Opt-in via `<Image treatment="riso">`, heroes and editorial only. |
| `.halftone-dissolve` | The one cinematic hero reveal. Budget: one per page. |
| `.paper-feed` | Route transition. |
| `.ink-bleed` | Press feedback on a primary action. |

Every animated class has a `prefers-reduced-motion` branch.

## Typography

Inter for body/UI, Space Grotesk (`--font-display`) for large headings. Both
self-hosted woff2 in `public/fonts/`. Plus Jakarta Sans was removed.

Editorial scale, always via a token — ESLint errors on arbitrary `text-[…]`:
`text-hero-xl` (7rem), `text-hero` (4.75rem), `text-display` (2.75rem),
`text-headline-lg` (2rem), `text-headline` (1.75rem), `text-title` (1.25rem),
`text-body-lg` (1.0625rem), `text-15`, `text-13`, `text-xs2`, `text-2xs`,
`text-3xs`.

## Shape

Semantic 3-tier trio in the Tailwind v4 `@theme` block (there is **no**
`tailwind.config.ts` — config is CSS-first): `rounded-container` (8px),
`rounded-element` (4px), `rounded-badge` (0px).

- `rounded-full` allowed only for avatars and indicator dots.
- ESLint errors on `rounded-(xs|sm|md|lg|xl|2xl|3xl|4xl)` and bare `rounded`.

## Shadows

Disabled. Depth is the plate: a filled surface whose tonal step against its
parent is measured, plus `.plate-offset` for interactive cards.

- ESLint errors on `shadow-(md|lg|xl|2xl)`.
- `e2e/design-system.spec.ts` asserts `getComputedStyle('.bg-card').boxShadow === 'none'`
  on every PR, which is why misregistration is a `::before` and not a shadow.

## Gradients

Not allowed **in JSX**. ESLint errors on `bg-gradient-to-*` in components;
exceptions are black readability scrims over images (`from-black/NN`) and
`from-background` scroll fades.

The print layer's gradients, masks and blend modes live in `src/index.css`.
ESLint is scoped to `**/*.{ts,tsx}` and matches `Literal` AST nodes, so it never
parses CSS — keeping the print layer in the stylesheet is what lets it exist
without weakening a single JSX rule.

## Icons

lucide-react only. Always inherit color from parent (`currentColor`).

Public surfaces re-cut every icon as a chunky flat mark with two edits and no
library swap: `<LucideProvider strokeWidth={2.5}>` around the non-admin branch of
`LayoutShell`, plus `[data-ink-icons] .lucide { stroke-linecap: butt;
stroke-linejoin: miter }`. Admin keeps the softer default.

## Motion

Functional only. Defined in `src/lib/animation.ts`.

Allowed: skeleton pulse, dialog/sheet transitions, accordion, AnimatedCounter, StaggerGrid entrance.
Removed: Aurora, ScrollReveal on hero, placeholder gradients.

## Copy

Direct factual voice. No marketing language.

| Banned | Use instead |
|--------|------------|
| "Discover X" | "Search X" or "X" |
| "Explore" | "Browse" or omit |
| "Unlock" | "Add dates for..." |
| "Curated / tailored / personalized for you" | Omit |
| "Journey / amazing" | Omit |
| Empty state metaphors ("dance floor is empty") | "No X yet." |

## Components (src/components/ui/)

51 shadcn/ui primitives. Key components and their variants:

| Component | Variants | Notes |
|-----------|----------|-------|
| `button` | default (black solid), outline (1px border), ghost, destructive | Sizes: sm, md, lg, icon |
| `badge` | default (solid), outline, secondary, destructive | All caps tracking optional |
| `card` | Single variant | 1px border, no shadow, no radius |
| `input` | Single variant | 1px border, focus ring |
| `dialog` | Single variant | No backdrop blur, no radius |
| `tabs` | Single variant | Underline-active style |
| `tooltip` | Single variant | Foreground bg, background text |

## Admin exceptions

Admin pages (`src/components/admin/`, `src/pages/Admin*`, `src/pages/admin/`) are exempt from:
- Color literal ESLint rule
- Monochrome constraint

Admin status colors (functional, not branding):

| Meaning | Usage |
|---------|-------|
| Green `#10b981` | Success / completed |
| Blue `#3b82f6` | In progress / active |
| Amber `#f59e0b` | Pending / warning |
| Red `#ef4444` | Failed / error |

These are confined to pipeline dashboards, moderation queues, and data-viz surfaces.

## Enforcement

All rules live in `eslint.config.js`:

1. **Color literals** (error): blocks `#hex`, `rgb()`, `hsl()` literals in `src/` outside allowlisted files.
2. **Rounded classes** (warn): blocks `rounded-(sm|md|lg|xl|2xl|3xl)`.
3. **Shadow classes** (warn): blocks `shadow-(md|lg|xl|2xl)`.
4. **Gradient classes** (warn): blocks `bg-gradient-to-*`.

Admin/CMS/test files are excluded from all rules.

## Files

| Purpose | Path |
|---------|------|
| CSS tokens | `src/index.css` |
| Tailwind config | `tailwind.config.ts` |
| Animation tokens | `src/lib/animation.ts` |
| Layout helpers | `src/lib/sx.ts` |
| UI components | `src/components/ui/` (51 files) |
| ESLint enforcement | `eslint.config.js` |
