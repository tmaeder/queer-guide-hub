# Knowledge quality pilot

The implementation is on `codex/knowledge-quality-pilot` in the isolated `knowledge-quality` worktree. It does not change production content by being built or imported.

## Delivered

- Frozen live baselines and a 30-entry English manifest: 20 terms in five topic groups and 10 profiles in five fields.
- Thirty authored candidate drafts, approximately 7,600 words. These are initial editorial candidates, not validated or approved articles. The profiles remain below the 500–900 word target; expand with additional checked evidence during review rather than padding them.
- Six custom vector figures (standalone SVGs are in `figures/`) with a shared text equivalent, private previews and publication-bound public display. Existing glossary TagPlates and the two incumbent infographics are preserved.
- Commons source, creator, licence, dimensions and attribution candidates for the portraits. Each image still needs identity, rights and suitability review. Low-resolution or unresolved candidates cannot be approved.
- An admin queue at `/admin/knowledge-editorial`: research, edit, compare, validate, approve, publish, reject, rollback, portrait review, reader-test recording, pilot acceptance, automation audit and factual-error reporting.
- A migration with private proposals, role checks, frozen manifests, optimistic concurrency, atomic publication, prior-text snapshots, image-library integration, public reference projections and a database guard against legacy automated prose overwrites.
- An authenticated edge worker with bounded source retrieval, an independent editorial evaluation, fail-closed budget handling, visible errors, daily publication limits and a resumable scheduled sweep.

## Publication state

Nothing in the manifest is marked human-reviewed, specialist-approved, published or accepted. No participant results or credentials have been fabricated. The hourly automation is registered disabled; batches cannot enable publication until pilot acceptance.

The initial source-retrieval report records successful downloads separately from blocked requests. A successful HTTP response does not establish claim support. Several publishers block automated retrieval, and some sources require additional research or an accessible alternative. These must remain exceptions until evidence can be checked.

Current production budgets have no glossary/personality allocation. The worker therefore checks that a budget exists **before** calling the central consume RPC (which otherwise self-registers unknown callers). Set `KNOWLEDGE_LLM_BUDGET_CALLER` to an explicitly assigned existing allocation before using paid drafting/evaluation. This change creates no budget and raises no cap. Budget allocation, source access and real reviewers are activation dependencies, not simulated successes.

## Install and review

1. Apply only `20261127175349_knowledge_editorial_workflow.sql` through the project's reviewed migration process. Do not push unrelated pending migrations from the main workspace.
2. Deploy `knowledge-editorial` with existing project secrets and a deliberately assigned existing budget caller. Its shared dependencies must be deployed with it. Do not enable automatic publishing during the pilot.
3. From this worktree, run `node scripts/knowledge/import-pilot.mjs` for a dry run. With `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` supplied through the operator's environment, add `--apply` to stage the thirty drafts. Import is atomic and idempotent; it aborts if any frozen baseline has changed. It never publishes.
4. Deploy the frontend. Open the queue, inspect each source, run checks, edit, and review the whole rendered draft and figures. Check portrait identity and file-specific rights before approving an asset. Health and safety require a named specialist and an explicit attestation.
5. Publish reviewed pilot entries individually. Check desktop, mobile, keyboard access, figures, captions and sources. Record five distinct reader references and at least 80% correct comprehension answers. Then accept the pilot.
6. Enable automation only after the activation dependencies above are satisfied. The existing automation registry owns cron reconciliation; enabling the batch enables its registry row. Source/model failures leave current content unchanged. A source failure is deferred for 24 hours so another entry can progress. Existing published entries are prepared for refresh after 90 days.
7. Audit the first twenty automatic publications before continuing. Report a material factual error to pause the batch. Resuming requires references to the correction and a regression test. Rollback also pauses automation and refuses to overwrite newer text.

## Evidence and maintenance

`pilot-baseline.json` contains the original live snapshots and database-computed hashes. `pilot-manifest.json` is the import artifact. `drafts/` contains readable copies. `source-receipts.json` records retrieval status, final URLs, content hashes and time, without redistributing source articles. `portrait-rights.json` records Commons metadata, not a legal or editorial approval.

The authoring inputs are `scripts/knowledge/pilot-copy.mjs` and `pilot-sources.mjs`. Run `build-pilot.mjs` before the first import to regenerate drafts and manifest. **After import, do not regenerate or replace a frozen batch**: use queue revisions. Source and portrait checks are operator research tools and never confer publication approval.

The pilot excludes ambiguous short labels such as “Middle”, “Strawberry” and “Tiger”, and unsupported microlabels. Those need a separate vocabulary/content-role review rather than padded essays. Existing identities, roles, visibility, sensitive-content gates and translations are not automatically rewritten.

## Reproduce verification

- `node scripts/knowledge/test-database.mjs` starts and removes an isolated PostgreSQL fixture cluster. Set `PG_BIN` if PostgreSQL tools are not on PATH. It tests authorization, draft isolation, publishing, stale and expired evidence, specialist gates, immutable membership, approved-copy replacement, the five-per-day cap, rollback and the full idempotent import. It never contacts the hosted project.
- `node node_modules/vitest/vitest.mjs run src/lib/knowledge/__tests__ src/components/knowledge/__tests__/KnowledgeFigure.test.tsx src/pages/admin/__tests__/AdminKnowledgeEditorial.test.tsx src/config/__tests__/adminNavigation.test.ts src/pages/__tests__/TagDetail.test.tsx src/pages/__tests__/PersonalityDetail.parts.test.tsx`
- `npx deno check --no-config --node-modules-dir=none supabase/functions/knowledge-editorial/index.ts`
- `node node_modules/vite/bin/vite.js build`
- `node node_modules/tsx/dist/cli.mjs scripts/knowledge/export-figures.tsx` regenerates the standalone vectors using the same renderer as the interface.

The full repository typecheck currently reports existing errors in `ErrorBoundary.test.tsx` and `useMarketplaceRows.tsx`. The knowledge implementation's scoped TypeScript diagnostics are clean; the baseline was not changed. Browser checks used local pilot fixtures at 1440×1000 and 390×844, including overflow and the figure text toggle. This is not an authenticated production smoke test or a completed reader study.
