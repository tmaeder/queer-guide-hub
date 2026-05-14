# Tech debt remediation — Claude Code execution plan

**Source register:** `docs/tech-debt-register-2026-05.xlsx`
**Generated:** 2026-05-01
**Scope:** All 27 items, ordered by priority and dependency.

This document is written for Claude Code as the executing agent. Every task is self-contained: scope, files, exact commands, verification gates, and the PR shape it should produce. Pick the next pending task, do it, ship it, move on.

---

## Ground rules

Read these once. They apply to every task below.

### Before starting any task

1. `cd /Users/tobiasmaeder/queer-guide-hub`
2. `git status` — must be clean. If not, stash or branch off current work.
3. `git checkout main && git pull`
4. `npm install --legacy-peer-deps` (until BUILD-5 lands)
5. `npm run lint` and `npm test` must pass on `main` before you start. If they don't, that's task zero — fix the regression first.
6. Create a branch named `tech-debt/<ID>-<short-slug>`, e.g. `tech-debt/DOC-1-claude-md-refresh`.

### Verification gate (run before every commit)

```bash
npm run lint        # must pass clean (warnings allowed unless task says otherwise)
npm run typecheck   # must pass clean
npm test            # must pass clean
npm run build       # must pass clean (skip if task is doc-only)
```

If any of these regress *because of your change*, fix them in the same commit. Don't paper over with `eslint-disable` — the audit is partly about removing those.

### PR shape

- One PR per item. Title: `tech-debt(<ID>): <short title>`.
- PR description: link to the register row, summarise the change in 3-5 bullets, paste the verification gate output.
- Keep PRs <500 lines diff where possible. If an item is bigger (ARCH-1, DUP-3, ARCH-9), split into a tracking issue + a series of PRs and update the parent issue as each lands.
- Do not bundle items. The register IDs are the unit of work.

### When in doubt

- File location: re-grep, don't trust this doc — the codebase moves fast.
- Behaviour: read the existing tests. If there are none, write one before you change behaviour.
- Risk: if the change touches RLS, payments, auth, or pipelines that write to production tables, stop and write a 1-pager in `docs/plans/` for human review before merging.

---

## Phase 1 — Quick wins (12 items, ship in 2-4 sprints alongside features)

Each Phase 1 item is effort ≤ 2: an afternoon to a day. Order is by priority score; do top-down unless a dependency forces a swap.

---

### DOC-1 · Refresh CLAUDE.md to reflect actual repo state

**Priority 30. Effort 1.**

#### Goal

The agent/onboarding contract should match reality. Right now it lies about counts, paths, workers, and references dead code.

#### Steps

1. Run the audit script to gather current numbers:

   ```bash
   echo "src files: $(find src -type f \( -name '*.ts' -o -name '*.tsx' \) | wc -l)"
   echo "edge functions: $(ls supabase/functions/ | grep -v '^_' | wc -l)"
   echo "migrations: $(ls supabase/migrations/ | wc -l)"
   echo "legacy migrations: $(ls supabase/migrations/ | grep -c '_legacy')"
   echo "workers: $(ls workers/ | tr '\n' ' ')"
   echo "hooks: $(find src/hooks -name '*.ts' -o -name '*.tsx' | wc -l)"
   echo "pages: $(find src/pages -name '*.tsx' | wc -l)"
   ```

2. Update `CLAUDE.md`:
   - Architecture section: replace "118 Deno edge functions" → actual count, "435+ migrations" → actual count.
   - Workers list: replace `email-ingest` + `scraper-api` with the real four (`ingest`, `search-proxy`, `snapshot-archiver`, `submit`).
   - Design section: replace every `web/src/...` path with `src/...`.
   - Gotchas: remove the `useSecureMapbox` line — that hook does not exist (`grep -r useSecureMapbox src` returns 0).
   - News pipeline note: drop the "fetch-news still exists for manual triggers" caveat (will be true once ARCH-3 lands; if ARCH-3 hasn't landed yet, leave it but add a `// TODO ARCH-3` marker).

3. Add a CI guard. Create `.github/workflows/claude-md-drift.yml`:

   ```yaml
   name: claude-md-drift
   on: [pull_request]
   jobs:
     check:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - run: |
             actual_fns=$(ls supabase/functions/ | grep -v '^_' | wc -l)
             actual_mig=$(ls supabase/migrations/ | wc -l)
             grep -E "^- \*\*Edge functions:\*\* $actual_fns" CLAUDE.md \
               || (echo "::error::CLAUDE.md edge-function count is stale ($actual_fns expected)" && exit 1)
             grep -E "^- \*\*Migrations:\*\* $actual_mig" CLAUDE.md \
               || (echo "::error::CLAUDE.md migration count is stale ($actual_mig expected)" && exit 1)
   ```

   Add the `Edge functions:` and `Migrations:` bullets to CLAUDE.md so the grep can find them.

#### Verification

Doc-only — run the verification gate but `npm run build` is optional. CI must pass the new drift check.

#### PR scope

`CLAUDE.md`, `.github/workflows/claude-md-drift.yml`. Single commit.

---

### LINT-3 · Make `unused-imports` the only unused-vars rule

**Priority 16. Effort 2.**

#### Goal

Remove the duplicated config and promote to `error` so unused symbols can't slip in.

#### Steps

1. Edit `eslint.config.js`:
   - Delete the line `"@typescript-eslint/no-unused-vars": "off",` (around line 30-40).
   - Promote `"unused-imports/no-unused-vars"` from `"warn"` to `"error"`. Keep the `argsIgnorePattern` etc.
   - Promote `"unused-imports/no-unused-imports"` from `"warn"` to `"error"`.

2. Audit existing `@ts-ignore`/`@ts-expect-error`:

   ```bash
   grep -rn '@ts-ignore\|@ts-expect-error\|@ts-nocheck' src --include='*.ts' --include='*.tsx'
   ```

   For each of the 5 hits, decide: legitimate (replace with a typed assertion or a real fix) or stale (remove). Document the reason in the PR description.

3. Run lint and fix any errors that surface:

   ```bash
   npm run lint -- --fix
   npm run lint  # must be clean
   ```

#### Verification

Full gate. Lint must be 0 errors, 0 warnings.

#### PR scope

`eslint.config.js` + whatever files lint-fix touches. If the autofix is large, split into "config change" + "cleanup" commits.

---

### ARCH-6 · Extract `routes.tsx` and `AppProviders.tsx` from `App.tsx`

**Priority 16. Effort 2.**

#### Goal

`App.tsx` is 590 lines with 59 `lazyRetry` imports. Single point of merge conflict, hard to test.

#### Steps

1. Create `src/routes.tsx`:
   - Move all `const X = lazyRetry(() => import('./pages/X'));` declarations.
   - Move the `<Routes>...</Routes>` JSX.
   - Export a default `<AppRoutes />` component.

2. Create `src/providers/AppProviders.tsx`:
   - Move `QueryClientProvider`, `AuthProvider`, `AccessibilityProvider`, `CookieConsentProvider`, `ThemeProvider`, `CurrencyProvider`, `ActiveTripProvider`, `TooltipProvider`.
   - Accept `children` prop. Wrap them in the same nesting order.

3. `App.tsx` becomes:

   ```tsx
   import { BrowserRouter } from 'react-router';
   import { ErrorBoundary } from '@/components/ErrorBoundary';
   import { AppProviders } from '@/providers/AppProviders';
   import { AppRoutes } from '@/routes';
   import { LayoutShell } from '@/components/layout/LayoutShell';
   // … minimal imports

   export default function App() {
     return (
       <ErrorBoundary>
         <BrowserRouter>
           <AppProviders>
             <LayoutShell>
               <AppRoutes />
             </LayoutShell>
           </AppProviders>
         </BrowserRouter>
       </ErrorBoundary>
     );
   }
   ```

   Target <100 lines. If `LayoutShell` doesn't exist, create one to hold `<Header>`, `<Footer>`, `<TripContextBar>`, `<CookieConsentBanner>`, `<InstallBanner>`, `<FeedbackButton>`, analytics trackers.

4. Move the `installErrorBuffer()` / `installNetworkBuffer()` calls into `src/main.tsx` (they are module-load-side-effect; `main.tsx` is the right home).

#### Verification

Full gate. Manually click through 3-4 routes locally to confirm lazy chunks still load. Run `npm run build` — chunk graph should be unchanged (same number of `pages/*` chunks).

#### PR scope

`src/App.tsx`, `src/routes.tsx` (new), `src/providers/AppProviders.tsx` (new), `src/components/layout/LayoutShell.tsx` (new), `src/main.tsx`. Plus tests if there were App.tsx tests.

---

### BUILD-2 · Trim `supabase/types.ts` impact

**Priority 20. Effort 2.**

#### Goal

17,033-line auto-generated types file slows tsc and IDE. Make sure it's not silently pulled into runtime, and minimise regen churn.

#### Steps

1. Audit imports:

   ```bash
   grep -rn "from '@/integrations/supabase/types'" src --include='*.ts' --include='*.tsx' | grep -v "import type"
   ```

   Every result is a non-type import — that's a runtime cost (tree-shakers usually elide it but don't rely on it). Convert each to `import type { ... }`.

2. Confirm exclusions:
   - `eslint.config.js` already has `ignores: ["dist", "src/integrations/supabase/types.ts"]` — good.
   - Check `tsconfig.app.json` — types.ts IS still type-checked because it's under `src`. That's correct (we want the types valid) but verify `skipLibCheck: true` is on (it is, line ~7).

3. Optional: cache supabase type regeneration in CI based on migration hash. Add to the type-gen script (likely `scripts/gen-supabase-types.sh` or similar; create if missing):

   ```bash
   #!/bin/bash
   set -euo pipefail
   HASH=$(find supabase/migrations -name '*.sql' -exec md5sum {} + | sort | md5sum | cut -d' ' -f1)
   CACHED_HASH=$(cat src/integrations/supabase/.types-hash 2>/dev/null || echo "none")
   if [ "$HASH" = "$CACHED_HASH" ]; then
     echo "Supabase types up to date (migration hash $HASH)."
     exit 0
   fi
   supabase gen types typescript --project-id xqeacpakadqfxjxjcewc > src/integrations/supabase/types.ts
   echo "$HASH" > src/integrations/supabase/.types-hash
   ```

   Add `src/integrations/supabase/.types-hash` to git (it acts as the cache key).

#### Verification

Full gate. Time `npm run typecheck` before and after — record in PR description.

#### PR scope

Codemod across files that import from `types` non-typewise + the gen-types script + `.types-hash`. Could be 30-60 file touch but each diff is a single keyword.

---

### ARCH-2 · Split `contentTypeRegistry.ts`

**Priority 28. Effort 2.**

#### Goal

1,430-line single file holding every content type's field config. Split per type for review velocity and code-splitting.

#### Steps

1. Create `src/config/contentTypes/`:
   - `venue.ts` — exports `venueFields`, `venueValidation`, `venueIcon`, optionally a `venueContentType: ContentTypeConfig`.
   - Same for `event.ts`, `city.ts`, `country.ts`, `news.ts`, `personality.ts`, `hotel.ts`, `marketplace.ts`, `group.ts`, `village.ts`, `tag.ts`.
   - Move the lucide icon imports into the file that uses them.

2. Create `src/config/contentTypes/index.ts`:

   ```ts
   import { venueContentType } from './venue';
   import { eventContentType } from './event';
   // … one per type

   export const contentTypeRegistry = {
     venue: venueContentType,
     event: eventContentType,
     // … etc
   } as const;

   export type ContentTypeKey = keyof typeof contentTypeRegistry;

   export function getContentType(key: ContentTypeKey) {
     return contentTypeRegistry[key];
   }
   ```

3. Replace the old `src/config/contentTypeRegistry.ts` with a re-export shim so external consumers don't break:

   ```ts
   export * from './contentTypes';
   export { contentTypeRegistry as default } from './contentTypes';
   ```

   In a follow-up PR (separate item, low effort) migrate the imports to point at `@/config/contentTypes` directly and delete the shim.

4. Each of the new files: target <200 lines. The big arrays (e.g. category options) can stay inline; if a type has truly large reference data (countries list etc.) extract to `data/` and import.

#### Verification

Full gate. Plus: open the CMS in the browser, create one of each content type, confirm field rendering and validation work.

#### PR scope

`src/config/contentTypes/*.ts` (new, ~10 files), `src/config/contentTypeRegistry.ts` (becomes shim). No consumer changes in this PR.

---

### ARCH-3 · Remove `fetch-news` legacy path

**Priority 24. Effort 2.**

#### Goal

Per CLAUDE.md, news ingestion cut over to the canonical pipeline 2026-04-30, but `NewsSourcesManager.tsx` lines 595-609 still call `fetch-news` which writes directly to `news_articles`. Two write paths = drift.

#### Steps

1. Read `src/components/admin/NewsSourcesManager.tsx` around line 595-609. Confirm it's invoking `fetch-news` via `supabase.functions.invoke('fetch-news', ...)`.

2. Replace with an enqueue to the canonical pipeline. Look at how `WorkflowDashboard.tsx` triggers a workflow run (likely `supabase.functions.invoke('workflow-dispatcher', ...)` or an insert into `workflow_runs`/`scheduled_jobs`). Mirror that pattern.

   The new manual trigger should:
   - Enqueue a `news-ingestion` workflow run scoped to the selected source.
   - Show a toast: "Manual ingestion enqueued — see /admin/pipelines for status."
   - Link the toast action to `/admin/pipelines?tab=news`.

3. Add a Vitest test: given a source row, clicking the manual-trigger button calls the workflow dispatcher with the correct source id (mock supabase.functions.invoke).

4. Once the new path is wired and tested:
   - Delete `supabase/functions/fetch-news/index.ts`.
   - Delete `supabase/functions/fetch-news/deno.json` if present.
   - Run `supabase functions deploy --prune` (deploys remove deletions).
   - Migration `20260429310000` already disabled the cron and dispatcher trigger — verify it's applied.

5. Add a SQL guard to prevent future direct writes. New migration `20260501000000_news_articles_writer_guard.sql`:

   ```sql
   create or replace function news_articles_no_legacy_writes()
   returns trigger language plpgsql as $$
   begin
     if current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
        and tg_op = 'INSERT'
        and current_setting('app.pipeline_commit', true) is null
     then
       raise exception 'Direct INSERT into news_articles is forbidden. Use news_commit_staging_batch().';
     end if;
     return new;
   end $$;

   drop trigger if exists trg_news_articles_no_legacy on news_articles;
   create trigger trg_news_articles_no_legacy
     before insert on news_articles
     for each row execute function news_articles_no_legacy_writes();
   ```

   And update `news_commit_staging_batch` (in supabase/functions/_shared or a migration) to set `app.pipeline_commit = 'true'` at the start of its txn.

   **Risk note:** This is a behaviour-changing migration on a live table. Ship it in a maintenance window or with the trigger initially logging-only:

   ```sql
   -- swap exception → notice for first 24 hours
   raise notice 'BLOCKED legacy news_articles insert (dry-run)';
   ```

   Verify zero notices in 24h, then promote to exception.

#### Verification

Full gate. E2E click test on `/admin/news-sources` to manually trigger an ingestion, verify it shows up in pipeline runs.

#### PR scope

`src/components/admin/NewsSourcesManager.tsx`, deletion of `supabase/functions/fetch-news/`, new migration. Two PRs is fine if you want the trigger to ride independently.

---

### DUP-2 · Centralise CORS headers in edge functions

**Priority 20. Effort 2.**

#### Goal

37 of 48 edge functions inline `const corsHeaders = { ... }` despite `getCorsHeaders` already living in `_shared/supabase-client.ts`. CORS policy changes are currently a 37-file find-replace.

#### Steps

1. List the offenders:

   ```bash
   grep -lr "const corsHeaders" supabase/functions --include='*.ts' | grep -v _shared
   ```

2. For each file:
   - Add `import { getCorsHeaders } from '../_shared/supabase-client.ts';` (or the right relative path).
   - Replace the inlined `const corsHeaders = { ... };` with `const corsHeaders = getCorsHeaders(req);` placed at the top of the request handler (it needs `req` so move it inside).
   - Keep the same usage at every existing reference.

3. Add a banned-pattern check. Append to `.github/workflows/lint.yml` (or create a new `repo-grep` job):

   ```yaml
   - name: ban inlined cors in edge functions
     run: |
       hits=$(grep -rEl "Access-Control-Allow-Origin.*\\*" supabase/functions --include='*.ts' \
         | grep -v _shared || true)
       if [ -n "$hits" ]; then
         echo "::error::Inlined CORS headers in: $hits"
         exit 1
       fi
   ```

#### Verification

`supabase functions deploy <name> --no-verify-jwt` for one or two changed functions in a staging project, hit the endpoint with `curl -H 'Origin: https://example.com'`, confirm CORS still negotiates correctly. Or run the existing edge-function tests if they cover CORS.

#### PR scope

37 files, mostly mechanical. Could split into 2-3 PRs by directory cluster (pipeline-*, source-*, import-*, fetch-*, others) for easier review.

---

### BUILD-3 · Lock down PipelineBuilder to admin paths

**Priority 20. Effort 2.**

#### Goal

`PipelineBuilder.tsx` is 1,357 lines, pulls `@xyflow/react`, ships as a 651KB chunk. Must never leak into a non-admin route.

#### Steps

1. Add a bundle-shape assertion. Create `scripts/check-bundle-shape.mjs`:

   ```js
   import { readdirSync, readFileSync, statSync } from 'fs';
   import { join } from 'path';

   const dist = 'dist/assets/js';
   const files = readdirSync(dist);

   const PUBLIC_ROUTE_LIMITS = {
     // chunk-name-prefix: max KB
     'index': 1500,        // main app shell
     'maplibre': 1200,
     'vendor': 200,
     'router': 80,
   };

   const FORBIDDEN_IN_PUBLIC = ['xyflow', 'PipelineBuilder', 'WorkflowDashboard'];

   let failed = false;

   for (const f of files) {
     const size = statSync(join(dist, f)).size / 1024;
     for (const [prefix, limit] of Object.entries(PUBLIC_ROUTE_LIMITS)) {
       if (f.startsWith(prefix) && size > limit) {
         console.error(`::error::Chunk ${f} (${size.toFixed(0)}KB) exceeds limit ${limit}KB`);
         failed = true;
       }
     }
   }

   // Spot check: index chunks must not contain forbidden libs
   const indexChunks = files.filter(f => f.startsWith('index-'));
   for (const f of indexChunks) {
     const contents = readFileSync(join(dist, f), 'utf8');
     for (const banned of FORBIDDEN_IN_PUBLIC) {
       if (contents.includes(banned)) {
         console.error(`::error::Public chunk ${f} contains forbidden ${banned}`);
         failed = true;
       }
     }
   }

   if (failed) process.exit(1);
   console.log('Bundle shape OK.');
   ```

2. Wire into `package.json`:

   ```json
   "build:check": "npm run build && node scripts/check-bundle-shape.mjs"
   ```

3. Add to CI (`.github/workflows/ci.yml` or wherever `build` runs): replace `npm run build` with `npm run build:check`.

4. If the assertion fails today (it shouldn't — `App.tsx` already lazy-loads the admin routes), trace the import: `npm i -D rollup-plugin-visualizer`, add to `vite.config.ts`, run a build, identify the leaking import path, fix.

#### Verification

`npm run build:check` passes locally. CI passes.

#### PR scope

`scripts/check-bundle-shape.mjs`, `package.json`, CI workflow. If it caught a real leak, also the import-fix file.

---

### BUILD-4 · Lazy-load `exceljs` and `mammoth`

**Priority 16. Effort 2.**

#### Goal

`exceljs` is 917KB, `mammoth` is 489KB. Both are infrequent on-demand actions but bundled at app start.

#### Steps

1. Find static imports:

   ```bash
   grep -rn "from 'exceljs'\|from 'mammoth'" src --include='*.ts' --include='*.tsx'
   ```

2. For each consumer, swap to dynamic import inside the click handler:

   **Before:**
   ```tsx
   import ExcelJS from 'exceljs';
   // …
   async function handleExport() {
     const wb = new ExcelJS.Workbook();
     // …
   }
   ```

   **After:**
   ```tsx
   async function handleExport() {
     setExporting(true);
     try {
       const ExcelJS = (await import('exceljs')).default;
       const wb = new ExcelJS.Workbook();
       // …
     } finally {
       setExporting(false);
     }
   }
   ```

   Same shape for `mammoth`.

3. Keep the chunk names clean by removing the `exceljs` and `mammoth` entries from `vite.config.ts` `manualChunks` — Vite will produce a dynamic-import chunk automatically and the manual chunk would force eager bundling.

4. Add a small "Loading exporter…" UI hint while the chunk loads (hooked to the `setExporting` state).

#### Verification

`npm run build` — `exceljs-*.js` and `mammoth-*.js` should still appear in `dist/assets/js/` (as dynamic chunks), but `index-*.js` should be smaller. Compare before/after sizes in the PR description. Click the export buttons in admin and verify they still work.

#### PR scope

~5-15 files (consumer swaps) + `vite.config.ts`. Single PR.

---

### LINT-4 · Audit and clean up `eslint-disable` clusters

**Priority 15. Effort 3.**

#### Goal

185 `eslint-disable` comments concentrated in 5-6 files. Most are `react-hooks/exhaustive-deps`, often hiding stale-closure bugs.

#### Steps

1. Generate the audit list:

   ```bash
   grep -rn 'eslint-disable' src --include='*.ts' --include='*.tsx' \
     | sort > docs/plans/eslint-disable-audit.txt
   ```

2. For each comment in the top files (`CountryDetail.tsx`, `CityDetail.tsx`, `QueerVillageDetail.tsx`, `useSecureRoleManagement.tsx`, `useFeedbackAnalytics.ts`, `useExploreMapData.ts`):

   - Read the surrounding code.
   - Decide:
     - **Stale closure** → fix by adding the missing dep, wrapping in `useCallback`, or hoisting to a ref.
     - **Genuinely intentional** (e.g. mount-only effect) → replace `useEffect(() => {...}, [])` with `useEffect(() => {...}, [])` plus a `// React Compiler will lint this once enabled` comment, OR migrate to `useEffectEvent` (React 19+, available here).
     - **Should be a query** → replace the effect with a `useQuery` call (this overlaps with DUP-4 — link the PR).

3. Track progress: keep `docs/plans/eslint-disable-audit.txt` updated, mark each line ✅ as you fix it. Goal: zero `eslint-disable` in those 6 files.

4. After the cleanup, the codebase total should drop from ~185 to <50. The remaining ones should be in vendored or generated code only.

#### Verification

Full gate. The fix-rate per disable is high (you'll find real bugs); add Vitest cases for any bug found.

#### PR scope

One PR per file. Keeps review small and bisects bugs cleanly.

---

### ARCH-11 · Split PatternLibrary

**Priority 12. Effort 2.**

#### Goal

`src/pages/PatternLibrary/patterns.tsx` is 2,021 lines. Internal docs file — low-risk but unwieldy.

#### Steps

1. Create `src/pages/PatternLibrary/patterns/`.

2. Identify the natural pattern groupings inside `patterns.tsx` (likely already sectioned with comments: Buttons, Cards, Forms, Tables, Pills, etc.). One file per section.

3. Each child file exports a `Pattern{Name}Section` component. A new `src/pages/PatternLibrary/patterns/index.tsx` stitches them:

   ```tsx
   export const PATTERN_SECTIONS = [
     { id: 'buttons', label: 'Buttons', Component: ButtonsSection },
     { id: 'cards', label: 'Cards', Component: CardsSection },
     // …
   ] as const;
   ```

4. The main `PatternLibrary.tsx` page renders the index + side nav.

#### Verification

Full gate. Visit `/pattern-library` locally, check every section renders.

#### PR scope

One PR. New folder + the index + the page swap.

---

### BUILD-5 · Remove `--legacy-peer-deps` requirement

**Priority 15. Effort 3.**

#### Goal

CLAUDE.md says `--legacy-peer-deps` is mandatory at root because of the date-fns v4 vs react-day-picker v8 conflict. The conflict is likely transitive — find and fix.

#### Steps

1. Find the offending dep:

   ```bash
   npm ls date-fns 2>&1 | grep -B2 'date-fns@3'
   ```

   (Or whatever version it's pinning to — could be v2 from a transitive dep.)

2. Three remediation options, in preference order:

   - **a) Upgrade the transitive offender directly.** If `npm ls` shows e.g. `react-day-picker@8.x` requires `date-fns@^3`, upgrade `react-day-picker` to v9 (already on v9.14 in package.json — confirm it's resolving) or whatever version supports v4.
   - **b) Use `overrides` in `package.json`:**
     ```json
     "overrides": {
       "date-fns": "^4.1.0"
     }
     ```
     Run `rm -rf node_modules package-lock.json && npm install` (no `--legacy-peer-deps`). Verify the build still works — the override might break the consuming package's runtime code.
   - **c) Replace `react-day-picker`.** Last resort. The shadcn calendar uses it — check what shadcn recommends for date-fns v4.

3. Once `npm install` succeeds without `--legacy-peer-deps`:
   - Update CLAUDE.md to remove the gotcha.
   - Update any CI scripts using `--legacy-peer-deps`.
   - Update `scripts/feedback-runner-local.mjs` line that hard-codes `--legacy-peer-deps` in `npm ci`.

#### Verification

Full gate. `rm -rf node_modules && npm install` (no flags) must succeed. `npm run build` must succeed.

#### PR scope

`package.json`, `package-lock.json`, `CLAUDE.md`, any CI/script files. Single PR.

---

## Phase 2 — Strategic refactors (13 items, ~1 quarter)

Each is effort 3-4. Schedule ~20% capacity per sprint or block 2 weeks per quarter. Items have soft dependencies — a recommended order is given.

---

### LINT-1 · Promote `no-explicit-any` to `error`

**Priority 21. Effort 3.**

Do this BEFORE LINT-2 (strict mode) — fixes the `any`s while there are still few of them.

#### Steps

1. Audit current `any` usage:

   ```bash
   grep -rEn ': any[ ;,)>=&|]|as any|<any>' src --include='*.ts' --include='*.tsx' \
     > docs/plans/any-audit.txt
   ```

2. For each result, replace with the right type or `unknown`. Common patterns:
   - `catch (e: any)` → `catch (e: unknown)` then `if (e instanceof Error) ...`
   - `as any` cast → use a typed cast or `as unknown as TargetType` with a comment.
   - Generic `any` parameters → use `unknown` and narrow inside.

3. Flip `eslint.config.js`:

   ```js
   "@typescript-eslint/no-explicit-any": "error",
   ```

4. Run `npm run lint` — must be clean.

#### Verification

Full gate. The `any` audit file should be empty by the end.

---

### DUP-1 · Consolidate CMS hooks

**Priority 21. Effort 3.**

#### Goal

10 `useCMS*` hooks with overlap between `useCMS` and `useUniversalCMS`. Pick one canonical surface, deprecate the other.

#### Steps

1. Read both hooks side by side. List which consumers use which:

   ```bash
   grep -rl "from '@/hooks/useCMS'" src --include='*.ts' --include='*.tsx'
   grep -rl "from '@/hooks/useUniversalCMS'" src --include='*.ts' --include='*.tsx'
   ```

2. Pick `useUniversalCMS` as canonical (more recent surface). Mark `useCMS.tsx`:

   ```ts
   /** @deprecated Use useUniversalCMS instead. Will be removed 2026-Q3. */
   ```

3. Codemod each `useCMS` consumer to `useUniversalCMS`. Adjust call sites to match the canonical API. Some consumers may use specific features only `useCMS` had — port them onto `useUniversalCMS`.

4. The specialised hooks (`useCMSAudit`, `useCMSComments`, `useCMSEditor`, `useCMSFilters`, `useCMSMedia`, `useCMSRevisions`, `useCMSShortcuts`, `useCMSWorkflow`) stay — they're feature-scoped. But their internal `supabase.from('cms_*')` calls should re-root through `useUniversalCMS` where possible.

5. Once zero consumers remain, delete `src/hooks/useCMS.tsx`.

#### Verification

Full gate. Manual click-through of CMS list, edit, publish, revision viewer.

#### PR scope

Two PRs:
1. Add `@deprecated` and migrate consumers (no deletion).
2. Delete the old hook (after one release tick — gives reviewers / branches time to rebase).

---

### LINT-2 · Flip `tsconfig.app.json` to `"strict": true`

**Priority 18. Effort 4.**

Do AFTER LINT-1.

#### Steps

1. Edit `tsconfig.app.json`:

   ```jsonc
   "strict": true,
   ```

   Keep the explicit flags too (they're redundant but harmless).

2. Run `npm run typecheck`. Expect 50-200 errors.

3. Sort by file:

   ```bash
   npm run typecheck 2>&1 | grep 'error TS' | cut -d'(' -f1 | sort | uniq -c | sort -rn > docs/plans/strict-mode-errors.txt
   ```

4. Fix in batches by file. Common errors and fixes:
   - **`useUnknownInCatchVariables`** — `catch (e)` → `catch (e: unknown)` then narrow.
   - **`strictNullChecks`** (already on, but `strict` may surface more) — add `?` chaining or null guards.
   - **`strictFunctionTypes`** — usually a callback variance issue. Often a real bug.
   - **`strictPropertyInitialization`** — class field init. Add `!` or initial value.

5. Land each batch as its own commit on the same branch:
   - Commit 1: flip tsconfig, fix `src/lib/`.
   - Commit 2: fix `src/hooks/`.
   - … etc.

#### Verification

Full gate after each batch commit. `npm run typecheck` must reach 0 errors before merging.

#### PR scope

One large PR with logical commits. Tag a reviewer who knows the codebase deeply — strict-mode bugs found are usually real.

---

### ARCH-1 · Extract `EntityDetailLayout` and `useEntityDetail`

**Priority 27. Effort 3.**

This is the highest-payoff Phase 2 item. ~6.1k lines across 6 detail pages collapse to ~1.5k.

#### Steps

1. Read `VenueDetail.tsx` end to end. Identify:
   - Data shape: entity row + tabs for related sets (events, similar, news, photos…).
   - UI shape: Hero, breadcrumbs, tabs, sidebar, actions (report, admin-edit, share).
   - Layout primitives already in `@/components`.

2. Design the abstraction. Draft `src/components/entity/EntityDetailLayout.tsx`:

   ```tsx
   interface EntityDetailLayoutProps<T> {
     entity: T | null;
     loading: boolean;
     error: Error | null;
     hero: ReactNode;
     tabs: { id: string; label: string; content: ReactNode }[];
     sidebar?: ReactNode;
     breadcrumbs?: { label: string; href?: string }[];
     entityType: 'venue' | 'event' | 'city' | …;
     entityId: string;
   }
   ```

   And `src/hooks/useEntityDetail.ts`:

   ```ts
   export function useEntityDetail<T>(opts: {
     table: string;
     slug: string;
     joinSpec?: string;  // supabase select() argument
     queryKey: string;
   }): UseQueryResult<T> {
     return useQuery({
       queryKey: [opts.queryKey, opts.slug],
       queryFn: async () => {
         const { data, error } = await supabase
           .from(opts.table)
           .select(opts.joinSpec ?? '*')
           .eq('slug', opts.slug)
           .single();
         if (error) throw error;
         return data as T;
       },
       staleTime: 60_000,
     });
   }
   ```

3. Migrate `VenueDetail.tsx` first as the canonical example. Should drop from 999 lines to <300.

4. Migrate the rest in sequence: City, Country, Event, News, Personality, QueerVillage, Marketplace, Group, Hotel.

5. Each migration is its own PR. Keep the diff focused: extract, don't change behaviour. Behavior changes go in follow-up PRs.

#### Verification

Full gate per PR. Plus: visit the migrated detail page in the browser, click every tab, click every button.

#### PR scope

One PR for the layout + hook (with VenueDetail migration as proof). Then 1 PR per remaining detail page. Total: 7-10 PRs.

---

### DUP-4 · Migrate `useEffect` data fetching to `useQuery`

**Priority 16. Effort 4.**

Pairs naturally with ARCH-1 — many will fall out as detail pages migrate.

#### Steps

1. Find offenders (effect-based fetches in pages):

   ```bash
   grep -rln 'useEffect' src/pages --include='*.tsx' \
     | xargs grep -l 'supabase\.from' \
     > docs/plans/useeffect-fetch-pages.txt
   ```

2. For each page, replace each fetching `useEffect`:

   **Before:**
   ```tsx
   const [venues, setVenues] = useState<Venue[]>([]);
   const [loading, setLoading] = useState(true);
   useEffect(() => {
     supabase.from('venues').select('*').then(({ data }) => {
       setVenues(data ?? []);
       setLoading(false);
     });
   }, []);
   ```

   **After:**
   ```tsx
   const { data: venues = [], isLoading } = useVenuesList();
   ```

   Where `useVenuesList` is a hook you write or already exists in `src/hooks/`.

3. Convention: `supabase.from()` is allowed only in:
   - Files under `src/hooks/`
   - Files under `src/integrations/supabase/`
   - Edge functions (not src/)

4. Add a custom ESLint rule. Create `eslint-rules/no-supabase-from-in-pages.js`:

   ```js
   module.exports = {
     meta: { type: 'problem', schema: [] },
     create(ctx) {
       const file = ctx.getFilename();
       if (!file.includes('/src/pages/') && !file.includes('/src/components/')) return {};
       return {
         CallExpression(node) {
           if (
             node.callee.type === 'MemberExpression' &&
             node.callee.property.name === 'from' &&
             node.callee.object.name === 'supabase'
           ) {
             ctx.report({ node, message: 'supabase.from() must live in a hook (src/hooks/), not a component or page.' });
           }
         },
       };
     },
   };
   ```

   Wire into `eslint.config.js`. Promote to `error` once the count is zero.

#### Verification

Full gate per page. Compare before/after for each page — pages should typically lose 30-100 lines and 1-3 useState calls.

#### PR scope

One PR per page. ~15-20 PRs total (the 21 pages with raw `supabase.from`).

---

### DUP-3 · Finish admin-page migration to `useAdminTableQuery`

**Priority 18. Effort 4.**

#### Goal

`useAdminTableQuery` and `useAdminTableState` exist and work, but only ~25% of admin pages use them. 24 admin pages still each implement their own filter/sort/pagination boilerplate (14,681 total lines).

#### Steps

1. Build `<AdminEntityTable>` shell:

   ```tsx
   interface AdminEntityTableProps<T> {
     entityName: string;
     tableName: string;
     columns: ColumnDef<T>[];
     filters?: FilterConfig[];
     bulkActions?: BulkActionConfig[];
     rowActions?: RowActionConfig<T>[];
     searchColumns: string[];
   }
   export function AdminEntityTable<T>(props: AdminEntityTableProps<T>) {
     const state = useAdminTableState({ /* ... */ });
     const query = useAdminTableQuery<T>({ /* ... */ });
     return <DataTable {...} />;
   }
   ```

2. Migrate one admin page first as a canonical example. **Pick `AdminTags.tsx` (525 lines)** — small, simple, low-risk.

3. After that proves out, migrate the larger pages one at a time:
   - AdminVenueServices, AdminVenueAmenities, AdminEventServices, AdminEventAmenities (smallest entities, ~300-350 lines each).
   - AdminCities, AdminCountries, AdminPersonalities, AdminQueerVillages, AdminHotels, AdminGroups (mid-tier, ~400-600 lines).
   - AdminVenues (1103), AdminEvents (912), AdminMarketplace (674), AdminNewsSources (621) — largest with most custom logic.

4. AdminFeedback and AdminSubmissions have heavy custom UI (kanban, drawer) — don't force them into the table abstraction. Address separately in ARCH-7.

#### Verification

Full gate per PR. Manual click-through on each migrated admin page: list, filter, sort, paginate, edit, bulk-action, delete.

#### PR scope

One PR per admin page. ~15-20 PRs.

---

### ARCH-4 · Split UserDirectory.tsx

**Priority 18. Effort 3.**

#### Steps

Standard component split:
- `src/components/user-directory/UserDirectoryFilters.tsx`
- `src/components/user-directory/UserDirectoryGrid.tsx`
- `src/components/user-directory/UserDirectoryProfileDrawer.tsx`
- `src/hooks/useUserDirectoryQuery.ts` (covers DUP-4 for this page)

The page itself becomes <300 lines of layout glue.

#### Verification

Full gate. Visit `/users`, exercise filters, drawer, friend actions.

---

### ARCH-5 · Refactor ContentListPanel.tsx onto useAdminTableQuery

**Priority 18. Effort 3.**

Complements DUP-3. The CMS list panel has the same shape as admin tables — share the abstraction.

---

### ARCH-7 · Split AdminFeedback.tsx

**Priority 15. Effort 3.**

Three modes (inbox, kanban, stories) → three components. AdminFeedback.tsx becomes a small router.

---

### ARCH-8 · Hook hygiene pass

**Priority 15. Effort 3.**

#### Steps

1. List hooks <30 lines and <3 consumers:

   ```bash
   for f in src/hooks/*.{ts,tsx}; do
     lines=$(wc -l < "$f")
     name=$(basename "$f" | sed 's/\.[^.]*$//')
     uses=$(grep -rl "from '@/hooks/$name'" src --include='*.ts' --include='*.tsx' | wc -l)
     if [ "$lines" -lt 30 ] && [ "$uses" -lt 3 ]; then
       echo "$lines lines, $uses uses: $f"
     fi
   done | sort -n > docs/plans/hook-hygiene.txt
   ```

2. For each hit:
   - Single consumer → inline at the call site, delete the hook.
   - Two consumers → judgment call. Inline if the duplication is small.

3. Write `docs/plans/hook-naming-adr.md` — short ADR establishing convention:
   - `useEntityList(opts)` → returns array + meta.
   - `useEntityDetail(slug)` → returns single + meta.
   - `useEntityMutation()` → returns mutate fn + meta.
   - When NOT to make a new hook (encourage colocation under <30 lines).

#### Verification

Full gate. After the pass, hook count should drop noticeably (~40-60 deletions reasonable).

---

### ARCH-9 · Split MediaLibrary.tsx

**Priority 14. Effort 4.**

#### Goal

1,654 lines covering upload + grid + preview + folders + R2/Storage + alt text. The heaviest single refactor on the list.

#### Steps

1. Read top to bottom. Map state and effects.
2. Extract bottom-up:
   - `<MediaUploader />` — drop-zone + R2/Storage routing.
   - `<MediaFolderTree />` — sidebar.
   - `<MediaGrid />` — main grid + selection.
   - `<MediaPreviewDrawer />` — selected-item editor.
   - Hooks: `useMediaUpload`, `useMediaList`, `useMediaFolders`.
3. `<MediaLibrary />` becomes <300 lines of layout glue.
4. Ship behind `?next-media-library=1` query flag for one release, then flip the default.

#### Verification

Full gate. Heavy manual regression testing in admin. Upload, drag, tag, alt-text, delete, folder ops.

---

### ARCH-10 · Split PipelineBuilder.tsx

**Priority 14. Effort 4.**

Same shape as ARCH-9: bottom-up extraction (`<PipelineCanvas>`, `<PipelineNodePalette>`, `<PipelineNodeInspector>`, `<PipelineToolbar>`), shell stays as glue.

---

### TEST-1 · Triage and revive e2e suite

**Priority 16. Effort 4.**

#### Steps

1. Run the suite locally:

   ```bash
   npm run test:e2e 2>&1 | tee docs/plans/e2e-triage.txt
   ```

2. For each spec:
   - **Green** → keep, move on.
   - **Red, fixable** → fix in the same PR.
   - **Red, broken by drift** → mark `test.skip(...)` with a TODO and a tracking issue.
   - **Red, irrelevant** → delete the spec.

3. Add a nightly CI workflow `.github/workflows/e2e-nightly.yml` that runs the suite at 03:00 UTC and Slack-alerts on failure.

4. Update CLAUDE.md: replace "not actively maintained" with the current truth.

#### Verification

Suite green or fully triaged. Nightly workflow runs successfully once.

---

## Phase 3 — Major investments (1 item)

### BUILD-1 · Cut production build below 3 minutes

**Priority 24. Effort 3.**

Effort is "3" because the work is well-scoped, but it requires CI changes and a Sentry coordination — schedule like a small project.

#### Steps

1. Profile the current build:

   ```bash
   time npm run build
   ```

   Run with `--profile` and compare to historic baseline (`docs/refactor-baseline.md` says ~9m 48s).

2. Hypotheses to confirm/reject (in priority order):

   **Sourcemap upload to Sentry.** `vite.config.ts` line ~40 has `sentryVitePlugin` running on every prod build. Sourcemap upload during build is the typical culprit.

   *Fix:* Set `sourcemaps.disable = true` in the build, generate sourcemaps to a CI artifact, run `sentry-cli sourcemaps upload` in a separate post-build step that doesn't block deploy.

   **Chunk count.** 250+ chunks (per refactor-baseline), each through esbuild minify. Mostly necessary, but `cssCodeSplit: true` is creating 1 CSS file per chunk; some bundlers can merge.

   *Fix:* Try `cssCodeSplit: false` and measure. Usually a small win.

   **Manual chunks too granular.** Each `manualChunks` branch is a separate bundle pass.

   *Fix:* Combine the niche ones (`hls`, `pdfjs`, `mammoth`, `boneyard`, `gsap`) into a single `niche-libs` chunk.

3. Set a budget: `npm run build` must finish in <180s. Add an assertion in `scripts/check-bundle-shape.mjs` (introduced in BUILD-3).

4. After landing, update `docs/refactor-baseline.md` with the new numbers.

#### Verification

`time npm run build` records the new number. Sentry dashboard still shows fresh sourcemaps after a deploy.

#### PR scope

One PR for the build change, one for the CI sourcemap-upload step. Coordinate with whoever owns Sentry config.

---

## Backlog (1 item, do not schedule yet)

### DB-1 · Squash 643 migrations into a baseline

**Priority 5. Effort 5.**

Rare and risky. Don't do this until:
- The team has a clear "fresh-start" moment (major version, repo split, new env).
- Local `supabase db reset` time becomes a real pain (>10 min).
- Engineers complain in retros.

If/when scheduled, plan as its own design doc in `docs/plans/migration-squash.md` covering: schema dump procedure, history archive, RLS replay, CI changes, dev-environment migration.

---

## Tracking dashboard

Maintain `docs/plans/tech-debt-progress.md` updated per PR:

```md
# Tech debt progress

| ID | Title | Status | PR |
|---|---|---|---|
| DOC-1 | CLAUDE.md refresh | ✅ Shipped 2026-05-04 | #1234 |
| LINT-3 | Unused-vars consolidation | ✅ Shipped 2026-05-06 | #1241 |
| ARCH-6 | App.tsx routes split | 🟡 In review | #1248 |
| ARCH-2 | contentTypeRegistry split | ⏳ Pending | — |
| … | … | … | … |
```

When all 27 are ✅, archive this plan to `docs/archive/` and delete the register.

---

## Coordination notes for Claude Code

- **One task at a time.** Do not start a new branch while one is open.
- **Stop on RLS / payment / auth / production-write changes.** Open a `docs/plans/<ID>-design.md` and request human review before merging.
- **Verification gate is non-negotiable.** No `--no-verify` commits, no skipped tests.
- **Re-grep before every task.** This plan was written 2026-05-01; line numbers and counts will drift. Treat counts as approximate and re-measure.
- **If a task's premise is wrong** (e.g. the file is no longer 1,400 lines because someone else refactored it), update the register row, mark the task ✅ as "obsolete", and move to the next.
