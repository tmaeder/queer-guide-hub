# Repo merge: queer-guide-search → queer-guide-hub

This branch (`merge/queer-guide-search`) folds [queer-guide-search](https://github.com/tmaeder/queer-guide-search) into [queer-guide-hub](https://github.com/tmaeder/queer-guide-hub) so the project lives in a single monorepo. Both git histories are preserved via a subtree merge — see the merge commit's second parent for the full search history.

## Layout after merge

| Path                        | Origin                          |
|-----------------------------|---------------------------------|
| `src/`, `index.html`, …     | hub (frontend, untouched)       |
| `supabase/`                 | hub (canonical functions + migrations) |
| `workers/search-proxy/`     | **search** `worker/` — replaces hub's older v1 with the canonical v2 (personalised hybrid search, AI Gateway, KV cache, query rewrite + rerank) |
| `workers/ingest/`           | search `worker-ingest/`         |
| `workers/submit/`           | search `worker-submit/`         |
| `workers/snapshot-archiver/`| hub (unchanged)                 |
| `extension/`                | search `extension/` (Chrome MV3 capture extension) |
| `client-sdk/`               | search `client-sdk/`            |
| `scraper/`                  | hub (canonical)                 |
| `meilisearch/`              | hub (canonical)                 |
| `infra/plane/`              | search `infra/plane/`           |
| `infra/nominatim/`          | search `infra/nominatim/`       |
| `infra/{ci,ipfs,monitoring,nginx,terraform,tor,export.sh}` | hub (unchanged) |
| `CLAUDE.md`                 | search `Dev/CLAUDE.md` (hub had none) |
| `CHANGELOG.md`              | search (hub had none)           |
| `SEARCH_SYSTEM.md`          | search                          |
| `docs/scraper-legacy/`      | search `Dev/docs/{dependency-audit,deploy-runbook-data-quality,geo-data-ops,how-to-run,page-types}` |
| `docs/plans/2026-04-14-meili-cf-vectors-design.md` | search `docs/plans/` |
| `docs/plans/2026-{03-30,04-07,04-14}-*.md` | search `Dev/docs/plans/` |
| `scripts/{backfill,configure-meili,migrate-to-bge-m3,setup-all,setup-webhooks,smoke}*` | search `scripts/` |
| `.github/workflows/extension-ci.yml`, `sync-extension-zip.yml` | search (rewritten to use new paths and to stay in this repo) |

## What was dropped from queer-guide-search

| Path in search          | Reason                                                                 |
|-------------------------|------------------------------------------------------------------------|
| `Dev/web/**`            | Was a CI-synced mirror of hub — hub *is* canonical now.                |
| `Dev/scraper/**`        | Stub gitlinks only; hub `scraper/` is canonical.                       |
| `Dev/src/**`            | Older parallel scraper; hub `scraper/` is canonical.                   |
| `Dev/supabase/**`       | Only stale `generate-trip-pdf` stub; hub `supabase/` is canonical.     |
| `Dev/workers/**`        | Orphan submodule gitlinks (no `.gitmodules`); hub `workers/` canonical.|
| `Dev/{geo-boundaries-worker,tiles-worker}` | Orphan gitlinks.                                       |
| `Dev/meilisearch/**`    | Hub `meilisearch/` is canonical.                                       |
| `Dev/.vite/**`          | Build artefacts.                                                       |
| `Dev/{eslint.config.js,tsconfig.json,vitest.config.ts,package*.json,README.md}` | Old scraper config; hub `scraper/` has its own. |
| `Dev/.github/workflows/scrape.yml`, search root `.github/workflows/deploy.yml` | Hub workflows are canonical. |
| `Dev/docs/{add-a-source,compliance}.md` | Duplicated by hub `scraper/docs/{adding-a-source,compliance}.md`. |
| Search root `.gitignore`| Hub `.gitignore` is canonical.                                         |

## Path rewrites applied

In a third commit (`chore(merge): rewrite paths after subtree relocation`):

- `Dev/web/` prefixes dropped throughout docs, READMEs, and one frontend file (`src/components/admin/feedback/claudePrompts.ts`) — the referenced files now live at repo root.
- `worker-submit/` → `workers/submit/` and `worker-ingest/` → `workers/ingest/` in non-history files.
- `.github/workflows/extension-ci.yml` `working-directory` updated.
- `.github/workflows/sync-extension-zip.yml` rewritten to commit the rebuilt extension zip back into this repo (the cross-repo bot PR via `HUB_PR_TOKEN` is obsolete now that both repos are one).

## Outstanding follow-ups

These are known but intentionally **not** addressed in this merge PR — open issues / smaller PRs after landing:

1. **Archive `tmaeder/queer-guide-search`.** Once this PR merges and CI is green: `gh repo archive tmaeder/queer-guide-search`. Add a redirect README pointing to this repo first.
2. **Reconcile `CHANGELOG.md`**: it references migration `Dev/src/db/migrations/002_user_submissions.sql` which now lives only in scraper-legacy / git history. Either re-anchor the entry to the equivalent migration in `supabase/migrations/` or leave as a historical record.
3. **Rationalise `docs/scraper-legacy/` vs `scraper/docs/`**. Some content in scraper-legacy duplicates or supersedes scraper/docs (compliance, adding-a-source, etc.). Pick one canonical home.
4. **Audit `docs/a11y-audit/findings.md` line numbers**: paths now resolve correctly but the `:LINE` suffixes were captured against an older revision and may have drifted.
5. **HUB_PR_TOKEN secret** can be removed from repo / org secrets after the rewritten `sync-extension-zip.yml` ships.
6. **wrangler.toml KV namespace IDs** in `workers/search-proxy/wrangler.toml` are pre-existing live IDs (`EMBED_CACHE`, `SESSION_CACHE`) — no action, just noting for awareness.
