# Architecture Guardrails — 2026-03-03

These rules prevent re-accumulation of dead code and keep the codebase slim.

## TypeScript (tsconfig.app.json)

Both enabled as of 2026-03-03:
```json
"noUnusedLocals": true,
"noUnusedParameters": true
```
**Effect:** `npm run typecheck` fails on any unused import, variable, or function parameter.
**To bypass intentionally:** prefix with `_` (e.g., `_unusedParam`).

## ESLint (eslint.config.js)

Enabled as of 2026-03-03:
```js
"@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }]
```
**Effect:** Unused variables and imports produce ESLint warnings.

Already present:
- `react-hooks/exhaustive-deps` — warns on missing hook dependencies
- `jsx-a11y/*` — WCAG 2.2 AA accessibility warnings

## Dependency Rules

1. **Never add a shadcn UI wrapper component without a consumer.** If you generate a component from `shadcn add`, immediately integrate it or delete it. Dead wrappers (`input-otp.tsx`, `resizable.tsx`) accumulated this way.

2. **Verify both single- and double-quoted imports when searching for usage.** The `@bigheads/core` false-negative was caused by grepping only single-quoted imports (`from '@bigheads'`) while the real import used double quotes (`from "@bigheads/core"`).

3. **New npm packages need at least 2 actual consumers before committing.** Single-use packages that wrap in a single file (like Turnstile) should be inline if rarely used.

## Page Registration Rule

Any new file added to `src/pages/` **must** be registered as a route in `src/App.tsx` in the same PR/commit. Files in `src/pages/` with no route and no importer are dead code.

Exceptions: Admin pages not yet launched can stay if tracked in a TODO comment at the top of the file:
```tsx
// TODO: Register route at /admin/audio before shipping
```

## Build Rules

- `terser passes` must stay at `1`. Do not increase to `2` — it quadruples build time for <5% compression gain.
- `reportCompressedSize: false` must stay set — avoids redundant gzip pass during build.
- `sourcemap` must stay `false` for production — never ship source maps to CF Pages.

## Bundle Size Thresholds

Current warning threshold: `chunkSizeWarningLimit: 1000` (1 MB)

Chunks to watch (already over 500 KB raw):
| Chunk | Size | Status |
|-------|------|--------|
| maplibre | 1.0 MB | OK — lazy, map-specific |
| exceljs | 910 KB | OK — lazy, admin export only |
| index (main) | 672 KB | **Watch** — should stay below 700 KB |
| RichTextEditor | 594 KB | OK — lazy, CMS only |
| mui | 413 KB | OK — shared vendor chunk |

If `index` exceeds 700 KB, audit what's being pulled into the main bundle (likely a hook or component importing something heavy without lazy loading).
