# Docs index

Project documentation. Start here.

## Operations & runbooks

- [operations.md](operations.md) — deploy/runtime operations
- [runbooks/deploy-edge-functions.md](runbooks/deploy-edge-functions.md)
- [runbooks/emergency-rollback.md](runbooks/emergency-rollback.md)
- [runbooks/failed-pipelines.md](runbooks/failed-pipelines.md) — pipeline DAG failures
- [runbooks/failed-edge-functions.md](runbooks/failed-edge-functions.md) — ad-hoc edge fn failures
- [runbooks/rotate-secrets.md](runbooks/rotate-secrets.md)
- [runbooks/security-audit-followups.md](runbooks/security-audit-followups.md)
- [runbooks/meilisearch-reindex.md](runbooks/meilisearch-reindex.md) — **legacy** (Meili decommissioned code-side 2026-06-07; kept for history)
- [observability.md](observability.md) — error routing map (Sentry / pipeline_errors / api_error)
- [migrations.md](migrations.md) — migration workflow & gotchas

## Architecture

- [architecture/repo-map.md](architecture/repo-map.md)
- [architecture/folder-structure.md](architecture/folder-structure.md)
- [architecture-guardrails.md](architecture-guardrails.md)
- [architecture/email-ingestion.md](architecture/email-ingestion.md)
- [architecture/geo-data-ops.md](architecture/geo-data-ops.md)
- [adrs/](adrs/) — architecture decision records
- [build-pipeline.md](build-pipeline.md)

## Search

- [search-intelligence/](search-intelligence/) — design series `01`–`06`
- [search-intelligence/meili-to-postgres-migration-plan.md](search-intelligence/meili-to-postgres-migration-plan.md) — ✅ completed cutover (historical)
- [deploy/search-rollout.md](deploy/search-rollout.md)
- [SEARCH_SYSTEM.md](../SEARCH_SYSTEM.md) (repo root)

## Design system

- [design-system/README.md](design-system/README.md)
- The authoritative design tokens & rules live in the root `CLAUDE.md` Design section + `src/index.css`.

## Quality & security

- [audits/](audits/README.md) — audit index
- [rls-audit.md](rls-audit.md), [security-definer-function-audit.md](security-definer-function-audit.md)
- [security-localstorage-session.md](security-localstorage-session.md)
- [a11y-audit/](a11y-audit/), [a11y-manual-tests.md](a11y-manual-tests.md)
- [dependency-audit/](dependency-audit/)
- [testing/CONVENTIONS.md](testing/CONVENTIONS.md), [test-coverage-analysis.md](test-coverage-analysis.md)

## Plans

- [plans/](plans/) — design & strategy docs (dated). `DB-1-migration-squash.md` is the deferred migration-squash evaluation.

---

_The main product screenshot referenced by the root README lives at `docs/screenshot.png` — replace the placeholder with a real product screenshot/GIF._
