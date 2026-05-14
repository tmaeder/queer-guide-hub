# Refactor Baseline — 2026-03-03

> **Update 2026-05-01 (tech-debt BUILD-1):** Build time has dropped from
> ~9m 48s baseline to ~34s. The improvement appears to come from
> intervening Vite version bumps + lazy-loading. The historic numbers
> below are kept for reference; current numbers are recorded in the
> "Update 2026-05-01" section at the bottom of this doc.

## Environment
- Node 22.22.0, npm 10.9.4
- Vite 6.4.1 (upgraded from 5.4.x), React 18.3.1, TypeScript 5.5.3
- Vitest 4.0.18, ESLint 9.x

## Build
- **Command:** `npm run build` (vite build)
- **Time:** ~9m 48s (production build, includes terser minification)
- **dist output:** 275 files total (251 JS chunks, 3 CSS files)
- **JS total:** 14.3 MB raw, **1.88 MB gzipped**
- **dist total:** 15.5 MB raw

### Top JS chunks (raw)
| Chunk | Size |
|-------|------|
| maplibre-JWPSa8Wu.js | 1.0 MB |
| index-Q4IWtAIN.js (main bundle) | 605 KB |
| RichTextEditor-DkDmXi8d.js | 593 KB |
| mui-CLN4WLMp.js | 413 KB |
| xlsx-ChPHbVhZ.js | 407 KB |
| UmamiAnalyticsDashboard-BZi4XAOM.js | 347 KB |
| graph-BgqCEUys.js | 232 KB |
| PasskeyButton-Cu7uM3bp.js | 154 KB |
| vendor-DHyoorgM.js | 137 KB |

## Tests
- **Command:** `npm test` (vitest run)
- **Result:** BROKEN — esbuild version mismatch (host 0.27.3 vs binary 0.21.5). Needs `npm install` to fix.
- **Test files:** 6

## Lint
- **Command:** `npx eslint src/`
- **Result:** 1,069 problems (940 errors, 129 warnings)
- **Dominant issue:** `@typescript-eslint/no-explicit-any` (~90% of errors)
- **Other:** `react-hooks/exhaustive-deps` warnings, `no-case-declarations`, `no-empty`

## Source Code
- **Total files:** 599 (.ts + .tsx)
- **Components:** 530 .tsx files
- **Utilities/types:** 63 .ts files
- **Directories:** 69 directories under src/

## Dependencies
- **Runtime deps:** 54 packages (was 61 before cleanup)
- **Dev deps:** 17 packages
- **node_modules:** 538 MB

## Key Observations
1. **xlsx chunk still 407 KB** — `xlsx` was removed from package.json but old dist still contains it. `exceljs` replacement needs rebuild.
2. **maplibre is the biggest chunk** (1 MB) — lazy-loaded, acceptable for a map app.
3. **Main bundle (index) at 605 KB** — too large, needs code splitting analysis.
4. **RichTextEditor at 593 KB** — tiptap is heavy, but lazy-loaded via chunk. OK if admin-only.
5. **MUI chunk at 413 KB** — recently added; verify tree-shaking and usage scope.
6. **UmamiAnalyticsDashboard at 347 KB** — admin-only, should be lazy-loaded.
7. **251 JS chunks** — very aggressive code splitting, may cause waterfall on slow networks.
8. **9:48 build time** — extremely slow, likely terser minification bottleneck.
9. **Tests broken** — need npm install to fix esbuild binary mismatch.

---

## Update 2026-05-01 (tech-debt BUILD-1 / tech-debt cleanup pass)

### Build
- **Command:** `npm run build`
- **Time:** **~34s** (down from 9m 48s — ~17× faster)
- **Likely sources of the win:** Vite 6 maturity, npm install no longer needs `--legacy-peer-deps` (BUILD-5), supabase types as type-only imports (BUILD-2), App.tsx split (ARCH-6), various large-file splits (ARCH-2/4/7/9/10/11), no `any` (LINT-1 already at error), strict mode adds zero errors (LINT-2).
- **Bundle shape regression guard:** `npm run build:check` (BUILD-3) fails CI if any chunk-name-prefix exceeds its KB limit or any `index-*` chunk contains `xyflow` / `PipelineBuilder` / `WorkflowDashboard` (admin-only code that must never leak public).

### Tests
- 250 files / 2210 tests pass on `main` (was 250/2208 before LINT-2; counts move as old tests are deleted alongside their hooks).

### Plan-target outcome
- BUILD-1 plan target was "build < 3 minutes". 34s comfortably clears it. Sourcemap upload to Sentry is intentionally disabled in this env (no auth token in dev), so the historic Sentry-upload bottleneck doesn't apply locally; production CI deploys may still want the post-build async upload pattern from the plan, but that's separate scheduling.
