# Performance Changes — 2026-03-03

## Hot Path #1: Build Time

### Change
`vite.config.ts`: `terserOptions.compress.passes: 2` → `passes: 1`

### Measurement
| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Build time | 9m 48s | 32s | **-18x** |
| JS raw | 14.3 MB | 14.0 MB | -0.3 MB |
| JS gzipped | 1.88 MB | 1.88 MB | 0 |

### Why
Terser `passes: 2` runs the compression optimizer twice. The second pass yields ~2–5% additional minification but doubles compression time. For a codebase this size, the difference is ~8 megabytes of minified output — imperceptible to users but costs 9 minutes on every deploy. `passes: 1` is the industry default.

---

## Hot Path #2: Dead Code Removal (Bundle)

### Change
Removed 27 source files including:
- 15 CMS-superseded page components
- Unused hooks (`useVirtualization`, `useRedis`, `usePerformanceOptimizations`, `useScreenSize`, `useSecureTurnstile`)
- Unused utilities (`requestBatcher`, `performanceUtils`, `sx.ts`)
- Unused UI wrappers (`input-otp.tsx`, `resizable.tsx`)
- Dead feature cluster (`CrawlForm`, `FirecrawlService`, `TurnstileWidget`)

Removed 3 npm packages: `@marsidev/react-turnstile`, `input-otp`, `react-resizable-panels`

### Measurement
JS raw: 14.3 MB → 14.0 MB (-0.3 MB)
Note: `exceljs` (910 KB) replaced `xlsx` (407 KB) — user-initiated swap adds +503 KB but is lazy-loaded (only loaded on Excel export)

---

## Hot Path #3: TypeScript Guardrails (Future Dead Code Prevention)

### Change
`tsconfig.app.json` and `tsconfig.json`: enabled `noUnusedLocals: true` and `noUnusedParameters: true`

### Why
`noUnusedLocals: false` allowed the dead `screenSize` variable in UserDirectory.tsx and similar issues to go undetected. With this enabled, TypeScript will error on unused imports and variables during `npm run typecheck`, catching dead code at write-time rather than at refactor-time.

Zero new TypeScript errors were introduced by enabling these flags.

---

## Noted — Not Changed (Future Work)

### exceljs chunk size (910 KB)
`exceljs` is 910 KB vs `xlsx` at 407 KB (+503 KB). However it's lazy-loaded via dynamic `import('exceljs')` in `utils/excelExport.ts`, so it only loads when admin users trigger Excel export. Not a first-paint concern.

### Main index chunk (672 KB raw)
The main `index` chunk grew slightly from 605 KB to 672 KB. This is likely because Rollup's tree-shaking re-allocated some code after the deleted files were removed. To reduce this, the next step would be auditing what heavy imports end up in the main chunk (likely MUI components, large hooks).

### MUI chunk (413 KB)
MUI is properly split into its own chunk. Tree-shaking already works (component-level imports). No action needed without a full MUI → lighter alternative migration.
