# ADR 0001 — UI library consolidation

**Status:** Accepted (forcing function landed 2026-05-02)
**Date:** 2026-05-01 (status updated 2026-05-02)

> **Update 2026-05-02.** Between the ADR landing and this update, the team's tech-debt sweep migrated MUI imports from 502 files down to **19**. The migration timeline in this doc (4–7 months) is now overstated; clearing the remaining 19 is plausibly a single sprint. The ESLint forcing function (`eslint-mui-allowlist.json` + `no-restricted-imports`) shipped to ensure no net-new MUI imports while the tail is migrated.

**Decision driver:** consolidation sprint Phase 3

## Context

The frontend currently ships **two** complete UI component libraries:

- **MUI v7** (`@mui/material` + `@mui/icons-material`) — 502 source files import it.
- **shadcn/ui** (50 components vendored under `@/components/ui`) — 449 source files import it.
- **356 files import BOTH** — the hybrid surface is bigger than either library's share alone.

This is the largest consolidation cost in the codebase. Each library brings its own theming primitives (`muiTheme.ts` vs Tailwind tokens in `index.css`), its own form patterns, its own a11y conventions. Designers and engineers must cross-translate every change. Bundle size carries both — the Vite manual-chunks config already names `MUI` as a dedicated chunk.

The codebase trend over the last 6 months has been new components written in shadcn (e.g. all `_shared` admin tables, the data-table, dialog patterns). MUI usage is mostly in older admin pages and wherever an MUI primitive (Box, Typography, sx) was the convenient hook. There has been no decision; both libraries grew in parallel.

## Decision

**Consolidate to shadcn/ui.** Migrate the 502 MUI-importing files to the existing `@/components/ui` set + Tailwind tokens. Delete `@mui/material`, `@mui/icons-material`, `@mui/lab`, and `theme/muiTheme.ts` once migration completes.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| **A. Consolidate to shadcn** *(chosen)* | Lighter bundle (no MUI runtime). Tailwind already in repo for shadcn anyway. shadcn is copy-pasted source you can edit, no dependency lock-in. Aligns with the past 6 months of new-component direction. Design system already half-shadcn. | Migrate ~502 files (heavier raw count). MUI's `Box`/`Typography`/`sx` patterns are pervasive — replacements are `<div className="...">` + Tailwind. Some MUI-specific components (DataGrid, Autocomplete) need shadcn equivalents written. |
| **B. Consolidate to MUI** | Migrate fewer files (449). Established design system, deep TypeScript types, complete component coverage out of the box. | Bundle stays large (MUI runtime is ~300KB gzipped). Locks in to MUI's update cadence. Conflicts with Tailwind tokens — would need to either remove Tailwind or maintain dual theming. Reverses 6 months of repo direction. |
| **C. Permanently support both** | No migration cost up front. | Permanent ~150KB bundle bloat. Every new component needs a "which library?" decision. Hybrid files (356) keep accumulating. Engineering velocity tax compounds. **Rejected** — the cost is invisible and ongoing, the hardest kind to course-correct later. |

## Consequences

- **Bundle:** removes ~300KB gzipped (MUI runtime + icons). Improves Largest Contentful Paint, especially on the admin pages that load both libraries today.
- **A11y:** shadcn (Radix UI primitives) gives keyboard/focus/screen-reader behavior out of the box; MUI is also good but the migration is an opportunity to enforce one a11y story.
- **Designers:** single source of truth for spacing, color, typography (Tailwind tokens in `index.css` + the existing `motion.ts` / `sx.ts` helpers). The `web/src/theme/muiTheme.ts` file can be deleted.
- **Tests:** any test selectors keying off MUI classnames (`.MuiBox-root`, `.Mui-disabled`, etc.) need updating. ~150 such selectors across the e2e suite (estimate from grep).
- **Migration cost:** ~502 files. Realistic pace: 30–50 files per week for 10–17 weeks. The 356 hybrid files are simpler — they already have shadcn equivalents in place; remove the MUI imports and switch the JSX.

## Action items (forcing functions)

These must land within 30 days of acceptance, or the decision drifts:

1. **ESLint rule** — add `no-restricted-imports` rule banning net-new imports of `@mui/material`, `@mui/icons-material`, `@mui/lab`. Existing files allowlisted via `ignorePatterns` in a generated allowlist file (`eslint-mui-allowlist.json`) — every removed file is one closer to deletion of the rule and the dependency.

2. **Migration milestone:** all 356 hybrid files de-MUI'd by **2026-09-01** (4 months). One PR per ~20 files; no big-bangs. Each PR removes the file from `eslint-mui-allowlist.json`.

3. **Final cutover:** remaining 146 MUI-only files migrated by **2026-12-01** (7 months). Then `npm uninstall @mui/material @mui/icons-material @mui/lab @emotion/react @emotion/styled`, delete `theme/muiTheme.ts`, remove the eslint allowlist mechanism.

4. **Component coverage gap inventory** — before migration starts, audit MUI usage to find any component without a shadcn equivalent (likely candidates: DataGrid, advanced Autocomplete, Tabs with reorderable behavior). Build the missing shadcn components first; otherwise the migration stalls on the hard cases.

5. **Codemod** — write a single jscodeshift transform for the trivial cases: `<Box>` → `<div>`, `<Typography variant="h1">` → `<h1>`, `sx` → `className` for the common spacing/color combinations. This handles ~60% of files mechanically.

## Rollback

If the migration stalls before completion, the worst case is the current state (both libraries shipped). The ESLint rule prevents bleeding; revert it if the team needs to ship MUI for an emergency. No code rollback needed — uninstalling MUI is the final step, not the first.
