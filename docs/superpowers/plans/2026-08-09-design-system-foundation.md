# Design System Foundation (Subway-Map Rebrand) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the PASTE-UP monochrome design system with the "subway map" identity — paper/ink + 4 semantic track colors, Anton + Space Grotesk, zero radius, hard ink shadows, a 42-icon wayfinding set, and the Cupid's-transit logo — light-only.

**Architecture:** Token-level swap in `src/index.css` `@theme`/`:root` (kept in lockstep with `tokenCatalog.ts`, `functions/_lib/branding.ts`, and a `branding_validate` migration), plus new primitives in `src/components/transit/` and `src/components/brand/`. Existing pages inherit the new look through tokens; page rebuilds are later phases. Dark mode is removed. Old enforcement gates (tokenContrast test, e2e design-system spec) are updated in the same phase so CI never enforces the dead system.

**Tech Stack:** React 19, Vite 6, Tailwind v4 (`@theme` in `src/index.css`, no tailwind.config), vitest + jsdom, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-09-design-system-foundation-design.md`

**Canonical values (used throughout — HSL channel triples):**

| Token | Value | Hex |
|---|---|---|
| paper (background) | `60 33% 97%` | #FAFAF5 |
| ink (foreground) | `0 0% 7%` | #111111 |
| `--track-pink` | `330 100% 56%` | #FF1F8F |
| `--track-blue` | `193 100% 45%` | #00B4E6 |
| `--track-green` | `136 75% 52%` | #2BE05A |
| `--track-yellow` | `50 100% 50%` | #FFD500 |
| destructive | unchanged `0 70% 38%` | (hue 0 = 30° from pink's 330 — passes the >25° gate) |

**Text-on-track rule (a11y deviation from source design):** the design shows paper text on the cyan bullet, which measures ~2.3:1 — fails WCAG 1.4.11. We use **ink text on blue/green/yellow fills, paper text on pink only** (pink/paper ≈ 3.4:1, ink/blue ≈ 7.7:1). Fill shapes always carry a 2–3px ink border, which is what satisfies non-text contrast for yellow-on-paper.

**Repo gotchas that apply to every task:** commit with an explicit file list (never `git add -A` — lint-staged sweeps the shared tree, see memory); `npm test` only covers `src/**`; pre-push runs full lint (slow) — just commit, don't push per-task.

---

### Task 1: Fonts — add Anton, drop Inter, promote Space Grotesk to body

**Files:**
- Create: `public/fonts/anton/anton-latin-wght-normal.woff2`, `public/fonts/anton/anton-latin-ext-wght-normal.woff2`
- Modify: `src/index.css` (`@font-face` block ~lines 196–267, `--font-sans`/`--font-display` at 45–46)
- Delete: `public/fonts/inter/` (4 files)
- Modify: `index.html` (font preload links, if any reference inter)

- [ ] **Step 1: Download Anton woff2**

```bash
mkdir -p public/fonts/anton
# Google Fonts static URLs (Anton v25, weight 400 only — Anton has a single weight)
curl -sL -o public/fonts/anton/anton-latin-wght-normal.woff2 "https://fonts.gstatic.com/s/anton/v25/1Ptgg87LROyAm0K08i4gS7lu.woff2"
curl -sL -o public/fonts/anton/anton-latin-ext-wght-normal.woff2 "https://fonts.gstatic.com/s/anton/v25/1Ptgg87LROyAm0K08i4gS7luGA.woff2"
ls -la public/fonts/anton/
```
If either URL 404s (Google rotates version paths), fetch `https://fonts.googleapis.com/css2?family=Anton&display=swap` with a woff2-capable UA header, and use the `src: url(...)` URLs it returns for the `latin` and `latin-ext` blocks.
Expected: two woff2 files, each >10 KB.

- [ ] **Step 2: Update `@font-face` in `src/index.css`**

Delete the four Inter `@font-face` rules. Add (mirroring the existing Space Grotesk rules' shape — `font-display: swap`, unicode-range subsets copied from the deleted Inter latin/latin-ext rules):

```css
@font-face {
  font-family: 'Anton';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/anton/anton-latin-wght-normal.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'Anton';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/anton/anton-latin-ext-wght-normal.woff2') format('woff2');
  unicode-range: U+0100-02AF, U+0304, U+0308, U+0329, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
```

Update the family tokens:

```css
--font-sans: 'Space Grotesk', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-display: 'Anton', 'Space Grotesk', system-ui, sans-serif;
```

- [ ] **Step 3: Delete Inter files and fix preloads**

```bash
git rm -r public/fonts/inter
grep -n "inter" index.html src/index.css
```
Replace any `<link rel="preload" ... inter...>` in `index.html` with preloads for `space-grotesk-latin-wght-normal.woff2` and `anton-latin-wght-normal.woff2` (same `as="font" type="font/woff2" crossorigin` attributes). Expected: grep returns no remaining references to inter font files.

- [ ] **Step 4: Verify build + dev render**

```bash
npm run build 2>&1 | tail -5
```
Expected: build succeeds, no unresolved `/fonts/inter/` references.

- [ ] **Step 5: Commit**

```bash
git add public/fonts/anton src/index.css index.html
git commit -m "feat(design): Anton display + Space Grotesk body, drop Inter" --no-verify
```
(`--no-verify` per repo memory: lint-staged in this shared-checkout setup must not sweep; run lint at the end of the phase instead.)

---

### Task 2: Color, radius, shadow, and type-scale tokens in `src/index.css`

**Files:**
- Modify: `src/index.css` — `@theme` block (43–189), `@source inline` safelist (32–41), `:root` (275–417), delete `.dark` (419–487), print-layer classes (~1164–1310)

- [ ] **Step 1: Retune the editorial type scale in `@theme`**

New ladder 96/76/52/32/20 px (ratios 1.26/1.46/1.63/1.60 — all ≥1.25):

```css
--text-hero-xl: 6rem;
--text-hero-xl--line-height: 0.95;
--text-hero: 4.75rem;
--text-hero--line-height: 0.98;
--text-display: 3.25rem;
--text-display--line-height: 1.02;
--text-headline: 2rem;
--text-headline--line-height: 1.15;
--text-title: 1.25rem;
--text-title--line-height: 1.4;
--text-body-lg: 1.0625rem;
--text-body-lg--line-height: 1.7;
```
Update the long explanatory comment above them to describe the subway-map retune (Anton display sizes; keep the note that tokenCatalog must mirror). Micro-scale (`--text-3xs`…`--text-15`) and `--tracking-label` unchanged.

- [ ] **Step 2: Zero the radius trio**

```css
--radius-none: 0;
--radius-container: 0rem; /* squared — subway-map identity */
--radius-element: 0rem;
--radius-badge: 0rem;
--radius-full: 9999px; /* circles only: rings, bullets, avatars, dots */
```
Keeping the token names (not deleting them) avoids the six-layer deletion procedure and leaves all `rounded-container/element/badge` call sites valid.

- [ ] **Step 3: Add track colors + shadow tokens to `@theme`**

In the colors section of `@theme` add:

```css
--color-track-pink: hsl(var(--track-pink));
--color-track-blue: hsl(var(--track-blue));
--color-track-green: hsl(var(--track-green));
--color-track-yellow: hsl(var(--track-yellow));
```

Replace the shadows block (`--shadow-none`/`--shadow-hairline`) with:

```css
--shadow-none: none;
--shadow-hairline: 0 1px 0 hsl(var(--border));
--shadow-hard: 6px 6px 0 hsl(var(--foreground));      /* interactive card lift */
--shadow-hard-sm: 5px 5px 0 hsl(var(--foreground));   /* small tiles / index cards */
--shadow-hard-accent: 6px 6px 0 hsl(var(--track-pink)); /* live/urgent variant */
```

- [ ] **Step 4: Remap `:root` values**

In `:root` change (leave every token NAME in place; only values move):

```css
--background: 60 33% 97%;
--foreground: 0 0% 7%;
--card: 60 33% 97%;
--card-foreground: 0 0% 7%;
--popover: 60 33% 97%;
--popover-foreground: 0 0% 7%;
--primary: 0 0% 7%;
--primary-foreground: 60 33% 97%;
--secondary: 0 0% 7%;
--secondary-foreground: 60 33% 97%;
--muted: 60 9% 93%;
--muted-foreground: 0 0% 33%;
--accent: 60 9% 93%;
--accent-foreground: 0 0% 7%;
--border: 0 0% 7%;      /* ink borders are the system */
--input: 0 0% 7%;
--ring: 330 100% 56%;   /* focus ring = pink track */
```
`--destructive`/`--warning`/`--success` stay as-is (update their `0 0% 4%` neutrals to `0 0% 7%` and `0 0% 100%` paper-whites to `60 33% 97%` for consistency). Sweep the REST of `:root` (surface ladder, sidebar block, etc.): every `0 0% 100%` → `60 33% 97%`, every `0 0% 4%` → `0 0% 7%`. Check `--border` consumers: the old value was a light gray; hairline-divider usages will now render ink — that is the intended look (posters rule with ink lines), but grep `border-border` usages is NOT needed now (pages retune in later phases).

Add the four track declarations plus the deprecated aliases:

```css
/* ── Track colors — SEMANTIC wayfinding lines (subway-map rebrand 2026-08).
   One accent per context. Fill-only: never body text. Filled shapes carry a
   2-3px ink border (that border is the WCAG 1.4.11 story for yellow).
   Text ON a fill: ink for blue/green/yellow, paper for pink. */
--track-pink: 330 100% 56%;
--track-blue: 193 100% 45%;
--track-green: 136 75% 52%;
--track-yellow: 50 100% 50%;

/* DEPRECATED aliases — old PASTE-UP ink names kept so existing bg-spot /
   bg-ink-blue / bg-ink-over call sites keep rendering until the Public/Admin
   phases retire them. Do not use in new code. */
--spot: 330 100% 56%;
--spot-foreground: 0 0% 7%;
--ink-blue: 193 100% 45%;
--ink-blue-foreground: 0 0% 7%;
--ink-over: 136 75% 52%;
--ink-over-foreground: 0 0% 7%;
```
(If `--ink-pink` is aliased to `--spot` elsewhere in the file it needs no change.)

- [ ] **Step 5: Delete the `.dark` block (419–487) entirely.**

- [ ] **Step 6: Replace the print layer with the subway utilities**

Delete `.plate-offset` (+ its `[data-plate]` variants), `.halftone-ink`, `.halftone-paper`, `.halftone-pink`, `.halftone-blue`, and any remaining deckle/duotone print-layer classes. (Their class names in components become no-ops; components get cleaned in later phases.) Add in their place:

```css
/* ── Subway-map utilities ─────────────────────────────────────────── */
/* Interactive card lift: 3px ink border at rest, translate + hard shadow on
   hover/focus. Never combine with a hover ink-fill on the same element. */
.card-lift {
  border: 3px solid hsl(var(--foreground));
  transition: transform 120ms ease-out, box-shadow 120ms ease-out;
}
.card-lift:hover,
.card-lift:focus-visible,
.card-lift:focus-within {
  transform: translate(-3px, -3px);
  box-shadow: var(--shadow-hard);
}
.card-lift-sm { border: 3px solid hsl(var(--foreground)); transition: transform 120ms ease-out, box-shadow 120ms ease-out; }
.card-lift-sm:hover, .card-lift-sm:focus-visible { transform: translate(-2px, -2px); box-shadow: var(--shadow-hard-sm); }
.card-lift-accent:hover, .card-lift-accent:focus-visible { box-shadow: var(--shadow-hard-accent); }

/* Intersection gradient — the ONLY sanctioned multicolor gradient. Master
   symbol + moments of convergence only; never a background wash. Lives in CSS
   (not JSX) so the ESLint gradient ban stays intact. */
.intersection-gradient {
  background: linear-gradient(90deg, hsl(var(--track-pink)), hsl(var(--track-blue)) 38%, hsl(var(--track-green)) 70%, hsl(var(--track-yellow)));
}

@media (prefers-reduced-motion: reduce) {
  .card-lift, .card-lift-sm { transition: none; }
}
```

- [ ] **Step 7: Update the `@source inline` safelist**

Add to the safelist (lines 32–41) so Tailwind generates them before consumers exist: `bg-track-pink`, `bg-track-blue`, `bg-track-green`, `bg-track-yellow`, `text-track-pink`, `border-track-pink`, `shadow-hard`, `shadow-hard-sm` (follow the existing brace-expansion syntax in the file, e.g. `bg-track-{pink,blue,green,yellow}`).

- [ ] **Step 8: Build and eyeball**

```bash
npm run build 2>&1 | tail -3
```
Expected: clean build. Then `npm run dev` is available for a manual glance but the drift test in Task 3 is the real gate.

- [ ] **Step 9: Commit**

```bash
git add src/index.css
git commit -m "feat(design): subway-map tokens — paper/ink, 4 track colors, zero radius, hard shadows, light-only" --no-verify
```

---

### Task 3: Sync `tokenCatalog.ts` (drift test is the failing test)

**Files:**
- Modify: `src/components/admin/design/tokenCatalog.ts`
- Test (existing): the tokenCatalog↔index.css drift test under `src/components/admin/design/__tests__/`

- [ ] **Step 1: Run the drift test — verify it FAILS against the new index.css**

```bash
npx vitest run src/components/admin/design --reporter=basic 2>&1 | tail -20
```
Expected: FAIL — catalog defaults no longer match `index.css` (this is the TDD "red").

- [ ] **Step 2: Update the catalog**

In `COLOR_TOKENS`: update every entry's `light` value to the new `:root` values from Task 2; set each entry's `dark` value **equal to its light value** (dark mode is removed; keeping the field avoids rewriting the BrandingDoc shape and admin console). Replace the `spot`/`ink-blue`/`ink-over` entries' values with the track values they now alias, and add four new entries in group `'core'`: `track-pink`, `track-blue`, `track-green`, `track-yellow` (light = dark = the canonical values). In `GLOBAL_TOKENS`: update the radius trio defaults to `0rem` and the retuned text-scale defaults (`6rem/0.95`, `4.75rem/0.98`, `3.25rem/1.02`, `2rem/1.15`, title/body-lg unchanged). Update `CONTRAST_PAIRS`: keep existing fg/bg pairs (values changed, pairs still valid) and add `['track-blue','foreground']`-style pairs only if the pair type supports it — otherwise the new-token contrast story is covered in Task 5's test update.

- [ ] **Step 3: Run the drift + catalog tests — verify PASS**

```bash
npx vitest run src/components/admin/design --reporter=basic 2>&1 | tail -5
```
Expected: drift test passes. `tokenContrast.test.ts` may still fail — that's Task 5; if so, note which assertions fail (they document exactly what Task 5 must change).

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/design/tokenCatalog.ts
git commit -m "feat(design): sync tokenCatalog to subway-map tokens" --no-verify
```

---

### Task 4: Runtime branding whitelist — `functions/_lib/branding.ts` + migration

**Files:**
- Modify: `functions/_lib/branding.ts` (COLOR_KEYS ~55–70, SIZE_KEYS ~72–76)
- Create: `supabase/migrations/<VERSION>_branding_track_tokens.sql`

- [ ] **Step 1: Extend COLOR_KEYS**

Add `'track-pink'`, `'track-blue'`, `'track-green'`, `'track-yellow'` to the `COLOR_KEYS` set. SIZE_KEYS needs no change (no size token names changed). Run the functions typecheck:

```bash
npm run typecheck:functions
```
Expected: 0 errors (zero-tolerance gate).

- [ ] **Step 2: Write the migration**

First check the live max version — the version MUST exceed both the repo max and the remote max (repo max is currently `20260824100000`; also grep the repo for your chosen version to ensure no collision):

```bash
ls supabase/migrations | sort | tail -3
```

Create `supabase/migrations/20260825100000_branding_track_tokens.sql` (bump the timestamp if something later has landed). Read `supabase/migrations/20260809164200_branding_pasteup_ink_tokens.sql` first and mirror its exact structure — it is the precedent for extending `branding_validate`'s `v_color_keys` array. The migration re-CREATEs `branding_validate` with the four `track-*` keys appended to `v_color_keys`, changing nothing else in the function body (copy the CURRENT live body, not the 2026-08-09 file's, in case it moved since — check for any later migration touching `branding_validate` with `grep -l branding_validate supabase/migrations/*.sql | sort | tail -1`).

- [ ] **Step 3: Sanity-check `site_branding` state**

The validator RAISEs on unknown keys when replaying stored docs. Confirm no stored override doc references removed keys (none are removed — we only add — so this is a formality): the migration adds keys, never narrows, so `branding_revert` replays remain safe. No action needed beyond stating this in the migration's header comment.

- [ ] **Step 4: Commit**

```bash
git add functions/_lib/branding.ts supabase/migrations/20260825100000_branding_track_tokens.sql
git commit -m "feat(design): whitelist track-color tokens in runtime branding validator" --no-verify
```

---

### Task 5: Update `tokenContrast.test.ts` to the new palette

**Files:**
- Modify: `src/components/admin/design/__tests__/tokenContrast.test.ts`

- [ ] **Step 1: Run it, record the failures**

```bash
npx vitest run src/components/admin/design/__tests__/tokenContrast.test.ts --reporter=basic 2>&1 | tail -30
```
Expected failures: dark-mode assertions (dark == light now — most should silently pass), the fill-only ink list, possibly the non-text 3:1 check for `track-yellow`.

- [ ] **Step 2: Rewrite the assertions to the new model**

- `TEXT_ON_PAGE`: unchanged roles; all still pass (ink on paper ≈ 17:1, muted-foreground `0 0% 33%` on paper ≈ 7:1).
- `NON_TEXT_ON_PAGE`: add `track-pink`, `track-blue`, `track-green` (all ≥3:1 vs paper). **`track-yellow` is excluded from the vs-page check** with a comment explaining the border-gated model, and replaced by a new explicit assertion: contrast(`track-yellow`, `foreground`) ≥ 3:1 (ink border/text on yellow ≈ 12:1 — this is what makes yellow shapes perceivable).
- Fill-only gate: the four `track-*` tokens are asserted to be in the fill-only set (excluded from TEXT_ON_PAGE), exactly as `spot`/`ink-blue`/`ink-over` were.
- Hue-distance-from-destructive: run the existing >25° check over the four track hues (330/193/136/50 vs 0 → 30°/167°/136°/50° — all pass).
- New pairs: assert contrast(paper, `track-pink`) ≥ 3:1 and contrast(ink, `track-blue`) ≥ 4.5:1, contrast(ink, `track-green`) ≥ 4.5:1, contrast(ink, `track-yellow`) ≥ 4.5:1 — these lock in the bullet text-color rule from the plan header.

- [ ] **Step 3: Run to PASS, commit**

```bash
npx vitest run src/components/admin/design/__tests__/tokenContrast.test.ts --reporter=basic 2>&1 | tail -5
git add src/components/admin/design/__tests__/tokenContrast.test.ts
git commit -m "test(design): contrast gates for track colors, border-gated yellow model" --no-verify
```

---

### Task 6: Remove dark mode

**Files:**
- Modify: `src/components/theme/ThemeProvider.tsx`
- Delete: `src/components/theme/ThemeToggle.tsx`, `src/components/theme/__tests__/ThemeToggle.test.tsx`
- Modify: `src/components/layout/Footer.tsx`, `src/components/layout/MobileNavSheet.tsx` (+ their `__tests__` that assert the toggle renders)

- [ ] **Step 1: Update Footer/MobileNavSheet tests first (red)**

In `src/components/layout/__tests__/Footer.test.tsx` and `MobileNavSheet.test.tsx`, find the assertions that the theme toggle renders (grep `ThemeToggle` / `Toggle theme`) and invert them:

```tsx
expect(screen.queryByLabelText('Toggle theme')).not.toBeInTheDocument();
```

```bash
npx vitest run src/components/layout/__tests__/Footer.test.tsx src/components/layout/__tests__/MobileNavSheet.test.tsx 2>&1 | tail -5
```
Expected: FAIL (toggle still renders).

- [ ] **Step 2: Remove the toggle**

Delete the `<ThemeToggle />` usage + import from `Footer.tsx` and `MobileNavSheet.tsx`. `git rm src/components/theme/ThemeToggle.tsx src/components/theme/__tests__/ThemeToggle.test.tsx`.

- [ ] **Step 3: Neuter ThemeProvider**

`sonner.tsx` (and possibly others) consume `useTheme` — keep the export, hard-wire light. Replace `ThemeProvider.tsx`'s internals so that:

```tsx
// Dark mode removed 2026-08 (subway-map rebrand: fixed paper/ink poster
// identity). useTheme is kept for legacy consumers (sonner) and always
// reports light; the provider strips any persisted dark class/localStorage.
type Theme = 'light';
const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({ theme: 'light', setTheme: () => {} });
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    try { localStorage.removeItem('qg-theme'); } catch { /* private mode */ }
  }, []);
  return <ThemeContext.Provider value={{ theme: 'light', setTheme: () => {} }}>{children}</ThemeContext.Provider>;
}
export function useTheme() { return useContext(ThemeContext); }
```
Adapt names to the file's real exports/localStorage key (read it first — the storage key may differ; keep whatever key it actually uses in the `removeItem`). If `index.html` has an inline pre-hydration theme script (grep `dark` in `index.html`), delete that script block too.

- [ ] **Step 4: Tests pass, typecheck, commit**

```bash
npx vitest run src/components/layout src/components/theme 2>&1 | tail -5
npm run typecheck
git add -u src/components/theme src/components/layout index.html
git commit -m "feat(design): remove dark mode — fixed paper/ink identity" --no-verify
```
(Typecheck is the baseline ratchet — only NEW errors fail; removing files can't add errors, but a stale import of ThemeToggle would.)

---

### Task 7: Chart palette — track-color qualitative ramp

**Files:**
- Modify: `src/lib/chartPalette.ts`
- Test: `src/lib/__tests__/chartPalette.test.ts` (create if absent)

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';
import { trackChartPalette, monoChartPalette } from '@/lib/chartPalette';

describe('trackChartPalette', () => {
  it('cycles the four track colors', () => {
    expect(trackChartPalette(4)).toEqual([
      'hsl(var(--track-pink))',
      'hsl(var(--track-blue))',
      'hsl(var(--track-green))',
      'hsl(var(--track-yellow))',
    ]);
    expect(trackChartPalette(6)).toHaveLength(6);
    expect(trackChartPalette(6)[4]).toBe('hsl(var(--track-pink))');
  });
  it('keeps the mono ramp for back-compat', () => {
    expect(monoChartPalette(2)).toHaveLength(2);
  });
});
```

Run: `npx vitest run src/lib/__tests__/chartPalette.test.ts 2>&1 | tail -5` — Expected: FAIL (`trackChartPalette` not exported).

- [ ] **Step 2: Implement**

Append to `src/lib/chartPalette.ts`:

```ts
/** Subway-map qualitative palette — one track per series, cycling.
 *  Track colors are wayfinding (functional categorical), consistent with the
 *  "one accent per context" rule extended to one accent per series. */
const TRACKS = ['--track-pink', '--track-blue', '--track-green', '--track-yellow'] as const;
export function trackChartPalette(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `hsl(var(${TRACKS[i % TRACKS.length]}))`);
}
```

- [ ] **Step 3: Pass + commit**

```bash
npx vitest run src/lib/__tests__/chartPalette.test.ts 2>&1 | tail -3
git add src/lib/chartPalette.ts src/lib/__tests__/chartPalette.test.ts
git commit -m "feat(design): track-color chart palette" --no-verify
```

---

### Task 8: `TransitIcon` — the 42-icon wayfinding set

**Files:**
- Create: `src/components/transit/transitIconPaths.ts`
- Create: `src/components/transit/TransitIcon.tsx`
- Test: `src/components/transit/__tests__/TransitIcon.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { TRANSIT_ICON_NAMES } from '@/components/transit/transitIconPaths';

describe('TransitIcon', () => {
  it('renders a stroke-only svg for every name', () => {
    for (const name of TRANSIT_ICON_NAMES) {
      const { container, unmount } = render(<TransitIcon name={name} />);
      const path = container.querySelector('path');
      expect(path, name).not.toBeNull();
      expect(path!.getAttribute('fill')).toBe('none');
      expect(path!.getAttribute('stroke')).toBe('currentColor');
      unmount();
    }
  });
  it('has 42 icons and bumps stroke weight below 32px', () => {
    expect(TRANSIT_ICON_NAMES).toHaveLength(42);
    const { container } = render(<TransitIcon name="search" size={24} />);
    expect(container.querySelector('path')!.getAttribute('stroke-width')).toBe('10');
  });
  it('is aria-hidden by default, labelled when told', () => {
    const { container } = render(<TransitIcon name="search" label="Search" />);
    expect(container.querySelector('svg')!.getAttribute('role')).toBe('img');
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/components/transit 2>&1 | tail -5` — Expected: FAIL (module not found).

- [ ] **Step 2: Paths module**

`src/components/transit/transitIconPaths.ts` — path data transcribed verbatim from `Icon System.dc.html` (100×100 viewBox, stroke-only). Kebab-case the names:

```ts
/** Wayfinding icon set — subway-map rebrand. One stroke weight, bends not
 *  corners, one station ring per icon, round terminals. Ink on paper only:
 *  these never take track colors (color belongs to the lines). Never mix with
 *  off-system sets in the same surface — redraw in this grammar instead. */
export const TRANSIT_ICON_PATHS = {
  'search': 'M 68 44 a 24 24 0 1 0 -48 0 a 24 24 0 1 0 48 0 M 61 61 C 68 68 74 74 80 80',
  'near-you': 'M 50 86 C 36 68 28 56 28 42 C 28 28 38 18 50 18 C 62 18 72 28 72 42 C 72 56 64 68 50 86 Z M 58 42 a 8 8 0 1 0 -16 0 a 8 8 0 1 0 16 0',
  'route': 'M 22 78 C 44 76 38 50 56 44 C 70 39 72 34 78 26 M 29 78 a 7 7 0 1 0 -14 0 a 7 7 0 1 0 14 0 M 85 26 a 7 7 0 1 0 -14 0 a 7 7 0 1 0 14 0',
  'saved': 'M 50 82 C 32 66 22 54 22 42 C 22 30 31 22 41 22 C 47 22 50 26 50 32 C 50 26 53 22 59 22 C 69 22 78 30 78 42 C 78 54 68 66 50 82 Z',
  'events': 'M 20 36 C 20 28 26 24 34 24 H 66 C 74 24 80 28 80 36 V 68 C 80 76 74 80 66 80 H 34 C 26 80 20 76 20 68 Z M 36 16 C 36 20 36 24 36 28 M 64 16 C 64 20 64 24 64 28 M 57 56 a 7 7 0 1 0 -14 0 a 7 7 0 1 0 14 0',
  'chat': 'M 50 20 C 30 20 16 31 16 45 C 16 59 30 70 50 70 C 53 70 56 70 59 69 C 64 75 70 79 78 81 C 75 75 74 71 74 66 C 80 60 84 53 84 45 C 84 31 70 20 50 20 Z M 39 45 a 3.5 3.5 0 1 0 -7 0 a 3.5 3.5 0 1 0 7 0 M 53 45 a 3.5 3.5 0 1 0 -7 0 a 3.5 3.5 0 1 0 7 0 M 67 45 a 3.5 3.5 0 1 0 -7 0 a 3.5 3.5 0 1 0 7 0',
  'community': 'M 44 34 a 12 12 0 1 0 -24 0 a 12 12 0 1 0 24 0 M 80 34 a 12 12 0 1 0 -24 0 a 12 12 0 1 0 24 0 M 14 76 C 18 62 24 56 32 56 C 40 56 44 60 50 66 M 86 76 C 82 62 76 56 68 56 C 60 56 56 60 50 66',
  'health': 'M 84 50 a 34 34 0 1 0 -68 0 a 34 34 0 1 0 68 0 M 50 32 C 52 44 52 56 50 68 M 32 50 C 44 48 56 52 68 50',
  'filter': 'M 22 34 C 40 30 60 38 78 34 M 30 52 C 44 48 58 56 72 52 M 40 70 C 48 67 54 72 62 70',
  'add-station': 'M 82 50 a 32 32 0 1 0 -64 0 a 32 32 0 1 0 64 0 M 50 36 C 50 45 50 55 50 64 M 36 50 C 45 50 55 50 64 50',
  'ticket': 'M 20 40 C 20 34 24 30 30 30 H 70 C 76 30 80 34 80 40 C 74 42 74 58 80 60 C 80 66 76 70 70 70 H 30 C 24 70 20 66 20 60 C 26 58 26 42 20 40 Z M 50 42 C 50 47 50 53 50 58',
  'map': 'M 20 30 C 30 25 40 25 50 29 C 60 33 70 33 80 28 V 70 C 70 75 60 75 50 71 C 40 67 30 67 20 72 Z M 38 28 C 39 42 37 56 38 69 M 62 31 C 61 44 63 58 62 72',
  'after-dark': 'M 62 20 C 48 26 40 38 40 52 C 40 66 48 76 62 82 C 44 84 28 70 28 51 C 28 32 44 18 62 20 Z',
  'pride': 'M 32 84 C 31 64 33 40 32 20 M 32 24 C 46 17 58 30 74 23 C 74 31 74 39 74 47 C 58 54 46 41 32 48',
  'tune': 'M 22 38 C 40 34 60 42 78 38 M 22 62 C 40 58 60 66 78 62 M 47 37 a 7 7 0 1 0 -14 0 a 7 7 0 1 0 14 0 M 69 63 a 7 7 0 1 0 -14 0 a 7 7 0 1 0 14 0',
  'compass': 'M 84 50 a 34 34 0 1 0 -68 0 a 34 34 0 1 0 68 0 M 64 34 C 56 40 48 50 40 64 C 42 52 48 40 64 34 Z',
  'home-base': 'M 22 50 C 32 38 42 28 50 22 C 58 28 68 38 78 50 M 30 46 C 29 57 29 68 30 78 C 43 80 57 80 70 78 C 71 68 71 57 70 46 M 57 62 a 7 7 0 1 0 -14 0 a 7 7 0 1 0 14 0',
  'profile': 'M 62 32 a 12 12 0 1 0 -24 0 a 12 12 0 1 0 24 0 M 24 78 C 28 62 36 54 50 54 C 64 54 72 62 76 78',
  'alerts': 'M 30 64 C 30 46 34 30 50 30 C 66 30 70 46 70 64 C 74 66 76 68 78 70 C 60 74 40 74 22 70 C 24 68 26 66 30 64 Z M 44 82 C 48 85 52 85 56 82 M 50 30 C 50 26 50 24 50 21',
  'helpline': 'M 26 22 C 20 28 18 36 22 46 C 30 64 44 76 60 80 C 68 82 76 78 80 70 C 74 64 68 60 62 60 C 58 62 56 64 54 66 C 44 60 38 52 34 44 C 37 41 39 38 40 34 C 38 28 32 24 26 22 Z',
  'hours': 'M 84 50 a 34 34 0 1 0 -68 0 a 34 34 0 1 0 68 0 M 50 32 C 50 39 50 46 50 52 C 56 54 61 57 65 61',
  'library': 'M 50 28 C 42 22 32 20 22 22 C 21 38 21 54 22 72 C 32 70 42 72 50 78 C 58 72 68 70 78 72 C 79 54 79 38 78 22 C 68 20 58 22 50 28 C 50 44 50 60 50 78',
  'nightlife': 'M 40 76 a 9 9 0 1 0 -18 0 a 9 9 0 1 0 18 0 M 40 76 C 39 60 39 44 40 30 C 52 26 64 28 74 34 C 74 44 74 54 74 66 M 83 66 a 9 9 0 1 0 -18 0 a 9 9 0 1 0 18 0',
  'meetups': 'M 26 40 C 40 36 60 36 74 40 C 74 52 70 66 62 74 C 54 76 46 76 38 74 C 30 66 26 52 26 40 Z M 74 44 C 82 44 84 52 80 58 C 77 62 73 62 70 60 M 40 26 C 42 22 42 20 40 16 M 54 26 C 56 22 56 20 54 16',
  'housing': 'M 44 40 a 14 14 0 1 0 -28 0 a 14 14 0 1 0 28 0 M 43 47 C 54 57 66 68 78 78 M 64 70 C 61 74 59 77 57 80 M 74 78 C 71 81 69 83 67 85',
  'documents': 'M 28 24 C 28 42 28 60 28 78 C 42 80 56 80 72 78 C 72 64 72 50 72 36 C 66 32 60 28 54 24 C 45 23 36 23 28 24 Z M 54 24 C 54 28 54 32 54 36 C 60 36 66 36 72 36 M 40 52 C 46 50 54 54 60 52 M 40 64 C 46 62 54 66 60 64',
  'share': 'M 36 50 a 9 9 0 1 0 -18 0 a 9 9 0 1 0 18 0 M 82 26 a 9 9 0 1 0 -18 0 a 9 9 0 1 0 18 0 M 82 74 a 9 9 0 1 0 -18 0 a 9 9 0 1 0 18 0 M 35 45 C 45 40 55 36 65 31 M 35 55 C 45 60 55 64 65 69',
  'info-point': 'M 84 50 a 34 34 0 1 0 -68 0 a 34 34 0 1 0 68 0 M 50 46 C 50 53 50 60 50 68 M 53 32 a 3 3 0 1 0 -6 0 a 3 3 0 1 0 6 0',
  'sapphic': 'M 55 36 a 13 13 0 1 0 -26 0 a 13 13 0 1 0 26 0 M 79 36 a 13 13 0 1 0 -26 0 a 13 13 0 1 0 26 0 M 42 49 C 42 57 42 64 42 72 M 33 62 C 39 61 45 63 51 62 M 66 49 C 66 57 66 64 66 72 M 57 62 C 63 61 69 63 75 62',
  'achillean': 'M 59 60 a 15 15 0 1 0 -30 0 a 15 15 0 1 0 30 0 M 54 49 C 60 42 65 36 71 29 M 71 29 C 66 29 62 29 58 29 M 71 29 C 71 33 71 37 71 41 M 58 53 C 66 48 74 44 82 39 M 82 39 C 77 38 73 38 69 37 M 82 39 C 80 43 79 47 77 51',
  'trans-pride': 'M 64 58 a 14 14 0 1 0 -28 0 a 14 14 0 1 0 28 0 M 60 48 C 65 42 69 37 74 31 M 74 31 C 69 31 65 31 62 31 M 74 31 C 74 35 74 39 74 43 M 40 48 C 35 42 31 37 26 31 M 28 44 C 32 40 36 36 40 32 M 50 72 C 50 76 50 80 50 85 M 42 79 C 47 78 53 78 58 79',
  'rainbow': 'M 20 72 C 20 44 33 26 50 26 C 67 26 80 44 80 72 M 36 72 C 36 54 41 42 50 42 C 59 42 64 54 64 72',
  'march': 'M 50 86 C 49 72 49 58 50 46 M 24 32 C 24 24 30 18 38 18 H 62 C 70 18 76 24 76 32 C 76 40 70 46 62 46 H 38 C 30 46 24 40 24 32 Z M 57 32 a 7 7 0 1 0 -14 0 a 7 7 0 1 0 14 0',
  'disco': 'M 78 48 a 28 28 0 1 0 -56 0 a 28 28 0 1 0 56 0 M 50 20 C 44 38 44 58 50 76 M 24 40 C 40 44 60 44 76 40 M 26 58 C 41 54 59 54 74 58 M 50 12 C 50 14 50 16 50 20',
  'consent': 'M 84 50 a 34 34 0 1 0 -68 0 a 34 34 0 1 0 68 0 M 36 52 C 41 56 45 60 48 64 C 53 54 59 45 66 38',
  'safeword': 'M 50 22 C 32 22 18 32 18 45 C 18 58 32 68 50 68 C 53 68 56 68 59 67 C 64 73 70 77 78 79 C 75 73 74 69 74 64 C 80 58 82 52 82 45 C 82 32 68 22 50 22 Z M 50 34 C 50 41 50 48 50 56 M 38 39 C 46 43 54 47 62 51 M 62 39 C 54 43 46 47 38 51',
  'aftercare': 'M 50 62 C 38 52 32 45 32 38 C 32 31 37 27 43 27 C 46 27 50 29 50 33 C 50 29 54 27 57 27 C 63 27 68 31 68 38 C 68 45 62 52 50 62 Z M 22 72 C 32 79 68 79 78 72',
  'handcuffs': 'M 40 48 a 13 13 0 1 0 -26 0 a 13 13 0 1 0 26 0 M 86 48 a 13 13 0 1 0 -26 0 a 13 13 0 1 0 26 0 M 37 57 C 43 66 57 66 63 57',
  'rope-play': 'M 74 46 a 26 26 0 1 0 -52 0 a 26 26 0 1 0 52 0 M 62 46 a 14 14 0 1 0 -28 0 a 14 14 0 1 0 28 0 M 64 62 C 70 68 76 74 82 80',
  'collar': 'M 22 38 C 26 60 36 70 50 70 C 64 70 74 60 78 38 M 58 76 a 8 8 0 1 0 -16 0 a 8 8 0 1 0 16 0',
  'paddle': 'M 50 16 C 64 16 74 26 74 40 C 74 54 64 62 50 62 C 36 62 26 54 26 40 C 26 26 36 16 50 16 Z M 50 62 C 50 70 50 76 50 84 M 56 40 a 6 6 0 1 0 -12 0 a 6 6 0 1 0 12 0',
  'flogger': 'M 50 16 C 50 26 50 36 50 44 M 44 20 C 47 19 53 19 56 20 M 50 44 C 40 56 34 68 30 82 M 50 44 C 48 58 46 70 46 84 M 50 44 C 54 58 58 70 62 82 M 50 44 C 58 54 66 64 72 74',
} as const;

export type TransitIconName = keyof typeof TRANSIT_ICON_PATHS;
export const TRANSIT_ICON_NAMES = Object.keys(TRANSIT_ICON_PATHS) as TransitIconName[];
```

- [ ] **Step 3: Component**

`src/components/transit/TransitIcon.tsx`:

```tsx
import { TRANSIT_ICON_PATHS, type TransitIconName } from './transitIconPaths';

interface TransitIconProps {
  name: TransitIconName;
  /** Rendered box in px. Stroke weight bumps one step below 32px (Icon System usage rule). */
  size?: number;
  /** Accessible label. Omitted = decorative (aria-hidden). */
  label?: string;
  className?: string;
}

/** Wayfinding icon: stroke-only, currentColor, round caps. Ink on paper /
 *  paper on ink only — never track colors. */
export function TransitIcon({ name, size = 24, label, className }: TransitIconProps) {
  const strokeWidth = size >= 32 ? 9 : size >= 24 ? 10 : 11;
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <path
        d={TRANSIT_ICON_PATHS[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
```
(Note: React camelCase props serialize to `stroke-width` etc. in the DOM — the test's `getAttribute('stroke-width')` works.)

- [ ] **Step 4: Pass + commit**

```bash
npx vitest run src/components/transit 2>&1 | tail -5
git add src/components/transit
git commit -m "feat(design): TransitIcon — 42-icon wayfinding set" --no-verify
```

---

### Task 9: Transit primitives — StationRing, RouteBullet, DepartureRow, LineStepper

**Files:**
- Create: `src/components/transit/StationRing.tsx`, `RouteBullet.tsx`, `routeBulletMap.ts`, `DepartureRow.tsx`, `LineStepper.tsx`
- Test: `src/components/transit/__tests__/transitPrimitives.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StationRing } from '@/components/transit/StationRing';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { ROUTE_BULLET_MAP } from '@/components/transit/routeBulletMap';
import { DepartureRow } from '@/components/transit/DepartureRow';
import { LineStepper } from '@/components/transit/LineStepper';

describe('StationRing', () => {
  it('renders the three states', () => {
    const { container: open } = render(<StationRing state="open" />);
    expect(open.firstElementChild!.className).toContain('bg-background');
    const { container: done } = render(<StationRing state="done" />);
    expect(done.firstElementChild!.className).toContain('bg-foreground');
    const { container: typed } = render(<StationRing state="typed" track="green" />);
    expect(typed.firstElementChild!.className).toContain('bg-track-green');
  });
});

describe('RouteBullet', () => {
  it('maps entity types to letter + track and picks accessible text color', () => {
    render(<RouteBullet type="venue" />);
    const bullet = screen.getByText('V');
    expect(bullet.className).toContain('bg-track-pink');
    expect(bullet.className).toContain('text-background'); // paper on pink
    render(<RouteBullet type="event" />);
    expect(screen.getByText('E').className).toContain('text-foreground'); // ink on blue
  });
  it('covers the search entity vocabulary', () => {
    for (const t of ['venue', 'event', 'city', 'country', 'queer_village', 'personality', 'news', 'marketplace', 'guide', 'group', 'hotel', 'organization', 'landmark']) {
      expect(ROUTE_BULLET_MAP[t], t).toBeDefined();
    }
  });
  it('exposes the full type name to AT', () => {
    render(<RouteBullet type="hotel" />);
    expect(screen.getByLabelText('Hotel')).toBeInTheDocument();
  });
});

describe('DepartureRow', () => {
  it('lays out bullet / time / title / status', () => {
    render(<DepartureRow type="event" time="FRI 21:00" title="Ballroom Is Burning" status="Selling fast" />);
    expect(screen.getByText('FRI 21:00')).toBeInTheDocument();
    expect(screen.getByText('Ballroom Is Burning')).toBeInTheDocument();
    expect(screen.getByText('Selling fast')).toBeInTheDocument();
  });
});

describe('LineStepper', () => {
  it('renders one station circle per step, filled up to current', () => {
    const { container } = render(<LineStepper steps={['Basics', 'Details', 'Review']} current={1} />);
    const circles = container.querySelectorAll('circle');
    expect(circles).toHaveLength(3);
    expect(circles[0].getAttribute('fill')).toBe('hsl(var(--foreground))'); // done
    expect(circles[2].getAttribute('fill')).toBe('hsl(var(--background))'); // ahead
  });
});
```

Run: `npx vitest run src/components/transit/__tests__/transitPrimitives.test.tsx 2>&1 | tail -5` — Expected: FAIL.

- [ ] **Step 2: `routeBulletMap.ts`**

```ts
/** Content-type → route bullet (letter + track line). Colors distinguish
 *  duplicate letters (country C-yellow vs city C-green). This table is the
 *  single point of change; keys follow the search_documents entity vocab. */
export type Track = 'pink' | 'blue' | 'green' | 'yellow';
export interface BulletDef { letter: string; track: Track; label: string }

export const ROUTE_BULLET_MAP: Record<string, BulletDef> = {
  venue: { letter: 'V', track: 'pink', label: 'Venue' },
  event: { letter: 'E', track: 'blue', label: 'Event' },
  group: { letter: 'G', track: 'green', label: 'Group' },
  guide: { letter: 'Q', track: 'yellow', label: 'Guide' },
  city: { letter: 'C', track: 'green', label: 'City' },
  country: { letter: 'C', track: 'yellow', label: 'Country' },
  queer_village: { letter: 'D', track: 'green', label: 'District' },
  personality: { letter: 'P', track: 'pink', label: 'Person' },
  news: { letter: 'N', track: 'blue', label: 'News' },
  marketplace: { letter: 'M', track: 'yellow', label: 'Marketplace' },
  hotel: { letter: 'H', track: 'blue', label: 'Hotel' },
  organization: { letter: 'O', track: 'green', label: 'Organization' },
  landmark: { letter: 'L', track: 'green', label: 'Landmark' },
  milestone: { letter: 'M', track: 'pink', label: 'Milestone' },
  trip: { letter: 'T', track: 'blue', label: 'Trip' },
};

/** Paper text on pink; ink text on blue/green/yellow (WCAG 1.4.11 — see plan header). */
export const TRACK_TEXT: Record<Track, string> = {
  pink: 'text-background',
  blue: 'text-foreground',
  green: 'text-foreground',
  yellow: 'text-foreground',
};
export const TRACK_BG: Record<Track, string> = {
  pink: 'bg-track-pink',
  blue: 'bg-track-blue',
  green: 'bg-track-green',
  yellow: 'bg-track-yellow',
};
```

- [ ] **Step 3: Components**

`StationRing.tsx`:

```tsx
import { cn } from '@/lib/utils';
import { TRACK_BG, type Track } from './routeBulletMap';

interface StationRingProps {
  /** open = place · typed = typed entity (needs track) · done = done/past */
  state: 'open' | 'typed' | 'done';
  track?: Track;
  className?: string;
}

/** Map station marker: 18px circle, 3px ink ring. */
export function StationRing({ state, track = 'pink', className }: StationRingProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block h-4 w-4 rounded-full border-[3px] border-foreground',
        state === 'open' && 'bg-background',
        state === 'typed' && TRACK_BG[track],
        state === 'done' && 'bg-foreground',
        className,
      )}
    />
  );
}
```

`RouteBullet.tsx`:

```tsx
import { cn } from '@/lib/utils';
import { ROUTE_BULLET_MAP, TRACK_BG, TRACK_TEXT } from './routeBulletMap';

interface RouteBulletProps {
  type: string;
  /** Diameter in px; 38 is the standard row size, 30 for dense rows. */
  size?: number;
  className?: string;
}

/** NYC-style route bullet: letter = content type, color = its line. Falls
 *  back to an ink bullet for unmapped types so new entity types never crash. */
export function RouteBullet({ type, size = 38, className }: RouteBulletProps) {
  const def = ROUTE_BULLET_MAP[type];
  const bg = def ? TRACK_BG[def.track] : 'bg-foreground';
  const text = def ? TRACK_TEXT[def.track] : 'text-background';
  return (
    <span
      role="img"
      aria-label={def?.label ?? type}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}
      className={cn('grid shrink-0 place-items-center rounded-full font-bold', bg, text, className)}
    >
      {def?.letter ?? type.charAt(0).toUpperCase()}
    </span>
  );
}
```

`DepartureRow.tsx`:

```tsx
import { cn } from '@/lib/utils';
import { RouteBullet } from './RouteBullet';

interface DepartureRowProps {
  type: string;
  time: string;
  title: string;
  status?: string;
  /** Accent the status text (e.g. "Selling fast"). */
  urgent?: boolean;
  className?: string;
}

/** Departure-board row: bullet · time · title · status. Events, milestones,
 *  group calendars, Pride week. */
export function DepartureRow({ type, time, title, status, urgent, className }: DepartureRowProps) {
  return (
    <div className={cn('grid grid-cols-[34px_76px_1fr_auto] items-center gap-2 border-2 border-foreground px-2 py-2', className)}>
      <RouteBullet type={type} size={30} />
      <span className="text-13 font-bold">{time}</span>
      <span className="truncate font-display text-15">{title}</span>
      {status ? (
        <span className={cn('text-xs2 font-bold', urgent ? 'text-track-pink' : 'text-muted-foreground')}>{status}</span>
      ) : (
        <span />
      )}
    </div>
  );
}
```
Note: `text-track-pink` as small text is the one place track color meets type — it is bold-weight status metadata on paper at ~3.4:1. If `tokenContrast`'s fill-only gate (Task 5) is written to forbid this, use `text-foreground` here instead and reserve pink for a leading dot; resolve in whichever direction Task 5 landed. (Default: use `text-foreground` + a pink `StationRing state="typed"` dot — safest.) The test above doesn't assert the status color, deliberately.

`LineStepper.tsx`:

```tsx
interface LineStepperProps {
  steps: string[];
  /** Index of the current step; everything before it renders as done. */
  current: number;
  className?: string;
}

/** Progress is always a bending line with stations — onboarding, submit
 *  flows, quests. Filled = done (indexes < current+1), ringed = ahead. */
export function LineStepper({ steps, current, className }: LineStepperProps) {
  const n = steps.length;
  const xs = steps.map((_, i) => (n === 1 ? 150 : 20 + (260 * i) / (n - 1)));
  return (
    <div className={className} role="group" aria-label={`Step ${current + 1} of ${n}: ${steps[current]}`}>
      <svg viewBox="0 0 300 40" className="w-full" aria-hidden>
        <path
          d="M 8 22 C 60 16 110 26 150 21 C 190 16 240 26 292 19"
          fill="none"
          stroke="hsl(var(--track-green))"
          strokeWidth="6"
          strokeLinecap="round"
        />
        {xs.map((x, i) => (
          <circle
            key={i}
            cx={x}
            cy={21}
            r={8}
            fill={i <= current ? 'hsl(var(--foreground))' : 'hsl(var(--background))'}
            stroke="hsl(var(--foreground))"
            strokeWidth={3}
          />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-xs2 font-bold">
        {steps.map((s, i) => (
          <span key={s} className={i <= current ? '' : 'text-muted-foreground'}>{s}</span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Pass + commit**

```bash
npx vitest run src/components/transit 2>&1 | tail -5
git add src/components/transit
git commit -m "feat(design): transit primitives — station ring, route bullet, departure row, line stepper" --no-verify
```

---

### Task 10: Button + Card retune

**Files:**
- Modify: `src/components/ui/button.tsx`, `src/components/ui/card.tsx`
- Test: existing button/card tests under `src/components/ui/__tests__/` (adjust only if they assert old classes)

- [ ] **Step 1: Button variants**

Read `src/components/ui/button.tsx`. Adjust the cva variants (keep every variant NAME — call sites depend on them):
- `default`: ensure `bg-primary text-primary-foreground border-2 border-foreground font-bold` (ink fill, paper text — with the token remap this is mostly automatic; add the border + weight).
- `outline` (and the deprecated `secondary` alias): `border-2 border-foreground bg-background text-foreground font-bold hover:bg-primary hover:text-primary-foreground` (hover fills ink — never also add a shadow lift here; "fills ink or lifts, never both").
- `ghost`/`link`: leave as-is.
- Radius comes from the zeroed tokens automatically; remove any explicit `rounded-*` literal that isn't the semantic token.

- [ ] **Step 2: Card**

In `src/components/ui/card.tsx`: base Card gets `border-[3px] border-foreground` replacing the current border class (keep `bg-card text-card-foreground`). Do NOT bake `.card-lift` into Card — lift is opt-in for interactive cards via className (later phases wire it into EventCard/VenueCard etc.).

- [ ] **Step 3: Run UI tests, fix assertion drift, commit**

```bash
npx vitest run src/components/ui 2>&1 | tail -10
```
Fix any test that asserted the old border/radius classes (update expected strings — behavior, not snapshots, is what matters).

```bash
git add src/components/ui/button.tsx src/components/ui/card.tsx src/components/ui/__tests__
git commit -m "feat(design): ink-border button and card primitives" --no-verify
```

---

### Task 11: Brand components + Header/Footer swap

**Files:**
- Create: `src/components/brand/MasterSymbol.tsx`, `src/components/brand/Wordmark.tsx`
- Modify: `src/components/layout/Header.tsx` (~62–81), `src/components/layout/Footer.tsx`
- Test: `src/components/brand/__tests__/brand.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MasterSymbol } from '@/components/brand/MasterSymbol';
import { Wordmark } from '@/components/brand/Wordmark';

describe('brand', () => {
  it('MasterSymbol is stroke-only currentColor', () => {
    const { container } = render(<MasterSymbol />);
    const g = container.querySelector('g')!;
    expect(g.getAttribute('stroke')).toBe('currentColor');
    expect(g.getAttribute('fill')).toBe('none');
  });
  it('Wordmark reads queer.guide', () => {
    render(<Wordmark />);
    expect(screen.getByText('queer.guide')).toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/components/brand 2>&1 | tail -5` — Expected: FAIL.

- [ ] **Step 2: MasterSymbol (paths verbatim from Brand Guidelines / Logo Options 2a)**

```tsx
/** "Cupid's transit" master symbol. Black-only rule: ink on paper or reversed
 *  (paper on ink) via currentColor — the mark never takes track colors. */
export function MasterSymbol({ className, label }: { className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 360 210"
      className={className}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <g fill="none" stroke="currentColor" strokeWidth={12} strokeLinecap="round" strokeLinejoin="round">
        <path d="M 16 108 H 134" />
        <path d="M 58 84 L 92 108 L 58 132" />
        <path d="M 180 158 C 152 136 132 116 132 96 C 132 79 145 68 159 68 C 172 68 180 78 180 89 C 180 78 188 68 201 68 C 215 68 228 79 228 96 C 228 116 208 136 180 158 Z" />
        <path d="M 219.8 75.6 L 248 41 M 248 41 L 226 41 M 248 41 L 248 63" />
        <path d="M 180 158 L 180 196 M 165 180 L 195 180" />
        <path d="M 225.7 108 C 250 80 266 132 288 104 C 296 94 306 90 318 93 L 336 89 M 336 89 L 312 75 M 336 89 L 310 105" />
      </g>
    </svg>
  );
}
```

- [ ] **Step 3: Wordmark**

```tsx
/** Lowercase Anton wordmark with the heart nested at the descender of the g.
 *  The heart is the one place the mark takes color (track pink). */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`relative inline-block font-display lowercase leading-none tracking-tight ${className ?? ''}`}>
      queer.guide
      <svg viewBox="0 0 24 22" className="absolute bottom-[-0.12em] right-[1.94em] w-[0.225em]" aria-hidden>
        <path
          d="M12 21 C 5 15 1 10 1 6.5 C 1 3 3.5 1 6.2 1 C 8.6 1 12 3 12 6 C 12 3 15.4 1 17.8 1 C 20.5 1 23 3 23 6.5 C 23 10 19 15 12 21 Z"
          fill="hsl(var(--track-pink))"
        />
      </svg>
    </span>
  );
}
```
(The `em`-based offsets scale the heart with the font size; the design places it at the g's descender ≈ 233px right of a 120px wordmark → ratios above. Verify visually in Step 5 and nudge the two em values if the heart misses the descender.)

- [ ] **Step 4: Swap into Header + Footer**

In `Header.tsx` (~62–81) replace the current `<img src={branding.logoUrl ?? '/images/logo.png'}>`-plus-split-site-name block with `<Wordmark className="text-title" />` inside the existing home link (keep the link, its aria-label, and the `branding.logoUrl` escape hatch: if `branding.logoUrl` is set, keep rendering the img override; the Wordmark is the new default branch). In `Footer.tsx`, add `<MasterSymbol className="w-24 text-foreground" />` beside/above the existing footer brand line (read the file; place it in the brand column).

- [ ] **Step 5: Visual check + tests + commit**

```bash
npx vitest run src/components/brand src/components/layout 2>&1 | tail -5
npm run dev
```
Load http://localhost:8080, check the header wordmark (heart sits in the g descender — adjust the two em offsets if not) and footer symbol.

```bash
git add src/components/brand src/components/layout/Header.tsx src/components/layout/Footer.tsx
git commit -m "feat(design): Cupid's-transit master symbol + Anton wordmark in chrome" --no-verify
```

---

### Task 12: Favicon, manifest icons, OG image

**Files:**
- Create: `scripts/generate-brand-assets.mjs`, `public/favicon.svg`
- Regenerate: `public/icons/icon-{48,180,192,512}.png`, `public/images/og-image.png`, `public/favicon.ico`
- Modify: `index.html` (~156–197 icon links, ~231 og:image), `public/manifest.json` (theme/background colors)

- [ ] **Step 1: favicon.svg**

`public/favicon.svg` — the master symbol, ink on paper, square crop (heart-centered so it reads at 16px):

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 210">
  <rect width="210" height="210" fill="#FAFAF5"/>
  <g transform="translate(-75,0)" fill="none" stroke="#111111" stroke-width="14" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 180 158 C 152 136 132 116 132 96 C 132 79 145 68 159 68 C 172 68 180 78 180 89 C 180 78 188 68 201 68 C 215 68 228 79 228 96 C 228 116 208 136 180 158 Z"/>
    <path d="M 219.8 75.6 L 248 41 M 248 41 L 226 41 M 248 41 L 248 63"/>
    <path d="M 180 158 L 180 196 M 165 180 L 195 180"/>
  </g>
</svg>
```
(At favicon scale the full 360-wide mark is illegible; the heart+arrow core is the icon crop. The full mark stays for OG/social.)

- [ ] **Step 2: Generation script**

`scripts/generate-brand-assets.mjs` — uses sharp for PNGs and Playwright (already a devDep) for the OG image:

```js
// One-shot: regenerate favicon PNGs + OG image from the brand SVGs.
// Usage: node scripts/generate-brand-assets.mjs   (needs: npm i -D sharp)
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { chromium } from 'playwright';

const svg = await readFile('public/favicon.svg');
for (const size of [48, 180, 192, 512]) {
  await sharp(svg).resize(size, size).png().toFile(`public/icons/icon-${size}.png`);
}
await sharp(svg).resize(32, 32).png().toFile('public/favicon-32.png'); // used for .ico below

const og = `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: Anton; src: url('file://${process.cwd()}/public/fonts/anton/anton-latin-wght-normal.woff2') format('woff2'); }
body { margin:0; width:1200px; height:630px; background:#FAFAF5; color:#111;
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:24px; }
.wm { font-family:Anton; font-size:110px; letter-spacing:-1px; }
</style><body>
<svg viewBox="0 0 360 210" width="480"><g fill="none" stroke="#111" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"><path d="M 16 108 H 134"/><path d="M 58 84 L 92 108 L 58 132"/><path d="M 180 158 C 152 136 132 116 132 96 C 132 79 145 68 159 68 C 172 68 180 78 180 89 C 180 78 188 68 201 68 C 215 68 228 79 228 96 C 228 116 208 136 180 158 Z"/><path d="M 219.8 75.6 L 248 41 M 248 41 L 226 41 M 248 41 L 248 63"/><path d="M 180 158 L 180 196 M 165 180 L 195 180"/><path d="M 225.7 108 C 250 80 266 132 288 104 C 296 94 306 90 318 93 L 336 89 M 336 89 L 312 75 M 336 89 L 310 105"/></g></svg>
<div class="wm">queer.guide</div>
</body>`;
await writeFile('/tmp/og.html', og);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto('file:///tmp/og.html');
await page.waitForTimeout(500); // font load
await page.screenshot({ path: 'public/images/og-image.png' });
await browser.close();
console.log('done');
```

```bash
npm i -D sharp
node scripts/generate-brand-assets.mjs
```
For `favicon.ico`: sharp can't write .ico — use the 32px PNG: `npx png-to-ico public/favicon-32.png > public/favicon.ico && rm public/favicon-32.png` (or if `png-to-ico` is unavailable offline, keep the existing .ico and rely on the `<link rel="icon" type="image/svg+xml">` taking precedence in modern browsers).

- [ ] **Step 3: Wire up**

In `index.html`: add `<link rel="icon" type="image/svg+xml" href="/favicon.svg">` before the PNG fallbacks (keep existing PNG links — files are regenerated in place, same paths). Update `<meta name="theme-color">` to `#FAFAF5`. In `public/manifest.json`: `"background_color": "#FAFAF5"`, `"theme_color": "#FAFAF5"` (icons keep their paths). The apple-touch-startup splash set (~40 images) is out of scope — old splashes are acceptable until the Public phase.

- [ ] **Step 4: Verify + commit**

```bash
ls -la public/icons/icon-*.png public/images/og-image.png
```
Open `public/images/og-image.png` and confirm the wordmark rendered in Anton (not a fallback serif — if serif, the font path in the OG HTML is wrong).

```bash
git add scripts/generate-brand-assets.mjs public/favicon.svg public/favicon.ico public/icons public/images/og-image.png public/manifest.json index.html package.json package-lock.json
git commit -m "feat(design): subway-map favicon, app icons, OG image" --no-verify
```

---

### Task 13: e2e `design-system.spec.ts` rewrite + visual snapshots

**Files:**
- Modify: `e2e/design-system.spec.ts`
- Regenerate: its visual snapshots

- [ ] **Step 1: Rewrite assertions**

Read the spec file, then apply:
- **Radius checks**: keep — they read the CSS custom properties live, so they now assert 0 — but verify the assertions don't hardcode nonzero px anywhere; fix if so.
- **`boxShadow` on `.bg-card` `toBe('none')`**: keep for at-rest. ADD a hover check:

```ts
test('interactive cards lift with the hard ink shadow on hover', async ({ page }) => {
  await page.goto('/');
  await page.addStyleTag({ content: '' }); // ensure styles settled
  const probe = page.locator('.card-lift').first();
  if ((await probe.count()) === 0) test.skip(true, 'no .card-lift on home yet — wired in Public phase');
  await probe.hover();
  const shadow = await probe.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(shadow).toContain('6px 6px 0');
});
```
(The skip guard is honest: Foundation ships the utility; pages adopt it in the Public phase. The test auto-arms the moment the first card adopts it. **Zero rows = skip is explicit here, not a silent vacuous pass** — the skip reason prints in the report.)
- **Font check**: replace "no Plus Jakarta Sans" with: no stylesheet references `Inter` or `Plus Jakarta Sans`; body computed font-family starts with `Space Grotesk`; an `h1`'s computed font-family starts with `Anton`.
- **Sanctioned-color canvas scan**: update the allowed set to paper/ink/neutrals + the four track hues (330/193/136/50) + destructive (hue 0). Same saturation-threshold mechanics, new hue allowlist.
- **Border/line budget (≤6 / ≤12)**: DELETE the test with a comment — ink borders are now the system's core idiom, a border count is no longer a smell metric.

- [ ] **Step 2: Run against local build, regenerate snapshots**

```bash
npx playwright test e2e/design-system.spec.ts --update-snapshots 2>&1 | tail -10
npx playwright test e2e/design-system.spec.ts 2>&1 | tail -5
```
Expected: pass (snapshots regenerated; note per repo memory that visual baselines are per-PLATFORM — CI regenerates its own on the update run if the workflow supports it, otherwise commit the darwin baselines and let CI's first run flag the linux set).

- [ ] **Step 3: Commit**

```bash
git add e2e/design-system.spec.ts e2e/**/*-snapshots 2>/dev/null; git add e2e
git commit -m "test(e2e): design-system gates for subway-map tokens" --no-verify
```

---

### Task 14: Docs — README rank table + CLAUDE.md Design section

**Files:**
- Modify: `docs/design-system/README.md`, `CLAUDE.md` (the `## Design` section)

- [ ] **Step 1: Rewrite `docs/design-system/README.md`**

Update: the type-scale rank table (96/76/52/32/20 ladder, Anton for display ranks, Space Grotesk elsewhere), the radius rule (squared everywhere; `rounded-full` circles only), the shadow rule (hard ink shadow on interactive lift — `.card-lift` — replaces "no shadows"), the color section (paper/ink + 4 semantic track colors, fill-only, text-on-fill rule, one-accent-per-context, intersection gradient reserved), the icon rule (TransitIcon grammar; lucide allowed until surfaces are migrated but never mixed with TransitIcon in the same surface), the token-change lockstep procedure (unchanged in shape; radius tokens were zeroed, not deleted).

- [ ] **Step 2: Update `CLAUDE.md` `## Design`**

Rewrite the Color/Typography/Shape/Shadows/Gradients/Icons bullets to the new system (keep the Documented-exceptions block: destructive, trip-safety traffic light, functional categorical scales, inline-link underlines, card-overlay-sibling pattern, crisis pages animation-free — all still true). Mark the PASTE-UP description as historical. State explicitly: dark mode removed; `--spot`/`--ink-blue`/`--ink-over` are deprecated aliases of track colors pending Public/Admin migration.

- [ ] **Step 3: Commit**

```bash
git add docs/design-system/README.md CLAUDE.md
git commit -m "docs(design): subway-map system — rank table, color, shape, shadow rules" --no-verify
```

---

### Task 15: Full verification sweep

- [ ] **Step 1: Unit tests**

```bash
npm test 2>&1 | tail -15
```
Expected: all pass. Investigate any failure — most likely candidates: components with tests asserting old token values, `dark:` class assertions, or Header/Footer snapshot drift.

- [ ] **Step 2: Lint + typecheck**

```bash
npm run lint 2>&1 | tail -10
npm run typecheck && npm run typecheck:functions
```
Expected: lint clean (we added no hex-in-JSX, no banned classes; `.card-lift` etc. live in CSS). Typecheck: no NEW errors vs baseline; functions gate at 0.

- [ ] **Step 3: Edge-function tests (branding.ts touched)**

```bash
npm run test:functions 2>&1 | tail -5
```
Expected: pass (COLOR_KEYS is additive).

- [ ] **Step 4: Build + local e2e smoke**

```bash
npm run build 2>&1 | tail -3
npx playwright test e2e/design-system.spec.ts e2e/nested-interactive.spec.ts 2>&1 | tail -5
```

- [ ] **Step 5: Manual browser pass**

`npm run dev` → check `/`, `/events`, `/cities`, `/help` (crisis page must remain sober — track colors must NOT have leaked onto it via tokens; its palette is neutral foreground/background driven, verify), one admin page (`/admin` renders legibly with new tokens even though unstyled-for-the-brand). Screenshot anything broken; token-level breakage found here is in scope, page-level ugliness is the later phases' job.

- [ ] **Step 6: Final commit + graph update**

```bash
graphify update . 2>/dev/null || true
git add graphify-out 2>/dev/null || true
git status --short
git commit -m "chore(design): foundation phase verification artifacts" --no-verify || true
```

---

## Self-review notes

- **Spec coverage**: §1 color → Tasks 2–5,7; §2 type → Tasks 1–2; §3 shape → Task 2; §4 depth → Tasks 2,10,13; §5 primitives → Tasks 8–10 (buttons/card/ring/bullet/row/stepper) + icons Task 8; logo → Tasks 11–12; dark-mode drop → Task 6; gates → Tasks 3–5,13; docs → Task 14. Non-goals honored (no page rebuilds; no transit-map poster).
- **Deviation from source recorded**: text-on-blue contrast fix (plan header + Task 9), favicon crop (Task 12).
- **Migration version**: MUST be re-verified against remote max at execution time (Task 4 Step 2) — concurrent agent sessions apply migrations directly.
- **Active-nav underline** (Button pattern #1's fourth item) is a nav-component concern; nav restyle belongs to the Public phase — noted here so it isn't read as missed.
