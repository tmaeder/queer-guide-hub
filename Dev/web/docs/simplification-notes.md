# Simplification Notes — 2026-03-03

## What Was Simplified

### 1. Removed Migration Artifacts
**Before:** `src/lib/sx.ts` — MUI sx helper with `container`, `center`, `pageWrapper`, `stack()`, `row()` utilities, plus a re-export of `cn()` from `utils.ts`. Had a comment: "After migration, this will be removed."
**After:** Deleted. Migration was complete; nobody imported it.

### 2. Removed Parallel Mobile Detection Hooks
**Before:** Two hooks for detecting mobile viewport: `use-mobile.tsx` (MediaQuery-based, returns boolean) and `use-screen-size.tsx` (resize-listener, returns `{width, height, lessThan()}`). Both coexisted and `use-screen-size` was imported-but-unused in `UserDirectory.tsx`.
**After:** `use-screen-size.tsx` deleted. Unused assignment removed from `UserDirectory.tsx`. `use-mobile` is the canonical mobile detection hook (8 consumers).

### 3. Removed Dead Auth Feature (Turnstile)
**Before:** Full Cloudflare Turnstile integration: `TurnstileWidget.tsx` component + `useSecureTurnstile.tsx` hook + `@marsidev/react-turnstile` package. Never wired into any form or auth flow.
**After:** All deleted. Saves 1 package, 2 files.

### 4. Removed Dead Import Utility
**Before:** `utils/requestBatcher.ts` — a batch-request coalescer utility. Zero consumers.
**After:** Deleted.

### 5. Removed Dead Performance Utilities
**Before:** `utils/performanceUtils.ts` and `hooks/usePerformanceOptimizations.tsx` and `hooks/useVirtualization.tsx` — performance utilities that were never integrated.
**After:** All deleted.

## What Was NOT Simplified (Deliberate)

### Hook Count (95 hooks)
95 custom hooks is large. Many are thin Supabase query wrappers (e.g., `useHotels.ts`, `useFestivals.ts`). These provide consistent React Query caching and could theoretically be consolidated. However:
- Each hook has a distinct Supabase query and type
- They enable independent code-splitting
- Merging would create a large "god hook" file

Recommendation: Keep as-is. If a hook has <3 consumers and <30 lines, consider inlining at call sites on a case-by-case basis.

### `clsx` + `tailwind-merge` (two packages doing one job)
Both are consolidated into `src/lib/utils.ts` as the `cn()` helper. This is the correct and standard pattern. `clsx` and `tailwind-merge` serve different roles (clsx merges class strings; tailwind-merge resolves Tailwind conflicts). Two packages, one export.

### Dual Styling (Tailwind + MUI)
The codebase uses both Tailwind utility classes and MUI components. This is an ongoing migration state. Reducing to one system would require either:
- Replacing 392 MUI component usages with Tailwind equivalents
- Replacing all Tailwind classes with MUI's `sx` prop

Both are large projects. The current mixed state is functional and consistent.

## Remaining Architecture Notes

### Flagged for Future Removal (not deleted — no git safety)
Five dead page files not registered in any route:
- `src/pages/AdminAudio.tsx` — wire up or delete
- `src/pages/AdminVideos.tsx` — wire up or delete
- `src/pages/Videos.tsx` — wire up or delete
- `src/pages/SecurityDashboard.tsx` — superseded by SecurityMonitoringDashboard
- `src/pages/AdminSecurityDashboard.tsx` — not in routing

Total: ~760 lines of potentially dead code.
