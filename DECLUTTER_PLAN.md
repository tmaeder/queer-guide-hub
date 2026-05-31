# Declutter Plan

Working record for the `/codebase-declutter` pass. Companion docs:
[`docs/architecture/repo-map.md`](docs/architecture/repo-map.md) and
[`DECLUTTER_CANDIDATES.md`](DECLUTTER_CANDIDATES.md).

## Project Info
- Type: monorepo — React 19 + Vite 6 SPA (frontend) + Supabase Deno edge functions + Cloudflare Workers + Node scraper + MV3 extension
- Package manager: npm (root `package-lock.json`); scraper has its own `package.json`
- Test runner: vitest + jsdom (`src/**/*.{test,spec}.{ts,tsx}`); Playwright for e2e
- Linter: ESLint flat config (`eslint.config.js`) + custom rules in `eslint-rules/`
- Formatter: Prettier (`.prettierrc`)
- Typecheck: `tsc --noEmit` (TS 5.8, `moduleResolution: bundler`)

## Verification Commands
- Install: `npm ci`
- Build: `npm run build`
- Test: `npm test`
- Lint: `npm run lint`
- Smoke: `npm run typecheck` (fast; catches broken imports)

## Baseline (before any change)
Run on branch `claude/quizzical-cannon-5f1ce6`, commit `4dc9aa7d`:

| Check | Command | Result |
|-------|---------|--------|
| Install | `npm ci` | ✅ 871 packages, 0 vulnerabilities |
| Typecheck (smoke) | `npx tsc --noEmit` | ✅ exit 0 |
| Lint | `npm run lint` | ✅ exit 0 |
| Test | `npm test` | ⚠️ 5335 passed / **4 pre-existing failures** in 3 files (intimate pages — `useAuth must be used within an AuthProvider`; unrelated to declutter targets) |

> Baseline failures are pre-existing and untouched by this work. Per-batch verification uses
> `npm run typecheck` + `npm run lint` + targeted `vitest run <affected files>` (the full suite
> takes ~20 min); the full suite is run once before the final push.

## Branch
`claude/quizzical-cannon-5f1ce6` (existing worktree branch — no new branch created).

## Scope (user-approved)
- UI components: **aggressive** — delete all zero-importer components + tests.
- Backend edge functions: **full audit** — live-DB-gated per-function deletion.
- Deliverables: **full skill ceremony** — this file, repo-map, candidates ledger, folder READMEs, folder-structure.

## Result (post-declutter, verified on branch)
- `npx tsc --noEmit` ✓ · `npm run lint` ✓ · `npm run build` ✓ (built 11.5s)
- `npm test`: 5330 passed / **4 failed** — the *same* 4 pre-existing failures as baseline
  (useVisitorLocation, securityHeaders.middleware, IntimateDiscovery); **0 new failures**, none
  reference any removed code.
- Removed: 1 shadowed hook, 9 unused UI components (+ tests/docs), 2 orphaned npm deps,
  7 unused edge functions (+ registry/config entries) — ~3,000 lines net.
- Phase 5 (perf): **no PERF_NOTES** — the removed components had zero importers and were already
  tree-shaken out of the bundle, so there is no honest before/after bundle delta to report. Value
  is maintainability + 2 fewer deps to audit/update.
- Kept (conservative): disabled scrape-source adapters (technical block, not permanent retirement);
  `source-email-ingestions` (live pipeline node).

## Notes / Gotchas
- iCloud-synced `.git`: if git hangs, `brctl download .git`.
- Pushing `claude/*` auto-opens+merges a PR to `main`; a bot may push CLAUDE.md count-sync commits — `git fetch` before follow-up pushes.
- Edge-function deletion needs `supabase functions delete <name>` (repo deletion does NOT undeploy).
- Live DB (`cron.job`, `workflow_definitions`) is authoritative for "is this function still invoked" — repo migrations only seed it.
