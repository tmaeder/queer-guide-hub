# Design System

Strictly monochrome, flat, editorial. Content is the hero.

## Tokens (src/index.css)

All colors are HSL channel values used via `hsl(var(--token))`.

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--background` | `0 0% 100%` (white) | `0 0% 4%` (near-black) | Page background |
| `--foreground` | `0 0% 4%` | `0 0% 96%` | Body text, primary UI |
| `--muted` | `0 0% 96%` | `0 0% 12%` | Subtle backgrounds |
| `--muted-foreground` | `0 0% 35%` | `0 0% 65%` | Secondary text |
| `--accent` | `0 0% 96%` | `0 0% 12%` | Interactive hover states |
| `--border` | `0 0% 88%` | `0 0% 18%` | All borders |
| `--destructive` | `0 70% 38%` | `0 84% 62%` | Error/warning (only chromatic token in public UI) |
| `--ring` | `0 0% 4%` | `0 0% 96%` | Focus rings |
| `--radius` | `0` | `0` | Global border-radius (flat) |

Card, popover, primary, secondary tokens mirror foreground/background. See `src/index.css` for full list.

## Typography

Inter only. Self-hosted woff2 in `public/fonts/inter/`. Plus Jakarta Sans was removed.

Use Tailwind's type scale (`text-sm`, `text-base`, `text-lg`, etc.). Extended sizes: `text-3xs`, `text-2xs`, `text-xs2`.

## Shape

`--radius: 0` globally. Tailwind config overrides all `rounded-*` values to `'0'`.

- `rounded-full` allowed only for avatars and indicator dots.
- ESLint warns on `rounded-(sm|md|lg|xl|2xl|3xl)` in new code.

## Shadows

Disabled. Tailwind config overrides `shadow-sm` through `shadow-2xl` to `none`.

- Use `border` or `bg-muted` for visual separation.
- ESLint warns on `shadow-(md|lg|xl|2xl)` in new code.

## Gradients

Not allowed in public UI. ESLint warns on `bg-gradient-to-*`.

Exception: black readability scrims over images (`from-black/15 to-black/65`).

## Icons

lucide-react only. Always inherit color from parent (`currentColor`). No colored icons in public UI.

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
