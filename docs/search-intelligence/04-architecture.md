# Architecture overview

```
                   ┌─────────────────────────────────────────────┐
                   │                Admin browser                │
                   │   /admin/search-intelligence (feature-flag) │
                   └───────────────────┬─────────────────────────┘
                                       │  supabase.functions.invoke
                                       │  (user JWT)
                                       ▼
                   ┌─────────────────────────────────────────────┐
                   │       search-intelligence edge function     │
                   │  - requireAdmin(req)                        │
                   │  - routes by URL pathname (router())        │
                   │  - never returns Meili admin key            │
                   └─────┬──────────────────────┬────────────────┘
                         │                      │
            service role │                      │ MEILI_ADMIN_KEY
                         │                      │
                         ▼                      ▼
              ┌──────────────────┐   ┌──────────────────────┐
              │  Postgres (RLS)  │   │   Meilisearch        │
              │  - synonyms      │   │   - settings         │
              │  - settings_ver. │   │   - documents        │
              │  - audit_log     │   │   - tasks            │
              │  - reindex_jobs  │   │                      │
              │  - visibility    │   │                      │
              └──────────────────┘   └──────────────────────┘

                                 unaffected:
                ┌──────────────────────────────────────────────┐
                │ Existing read path                            │
                │ workers/search-proxy → Meili + pgvector       │
                ├──────────────────────────────────────────────┤
                │ Existing write path                           │
                │ DB triggers → meilisearch-sync (Supabase fn)  │
                └──────────────────────────────────────────────┘
```

## Boundaries

- **Frontend**: only knows `supabase.functions.invoke('search-intelligence/<route>', ...)`. Carries the user's JWT, never any infra secret.
- **Edge function**: the only component that holds `MEILISEARCH_ADMIN_KEY`. It validates the JWT against `user_roles` (via `requireAdmin`), routes by path, and persists side-effects to Postgres before/after touching Meili.
- **Postgres**: stores the desired-state of synonyms and settings, the audit trail, the reindex job records, and visibility scores. RLS keeps writes service-role-only.
- **Meilisearch**: applied state. The function is the only writer that goes through this app; humans and the existing shell scripts are not blocked, but their changes show up as drift in the admin UI.

## Why an edge function (not a Cloudflare worker) for the admin path

- The existing admin auth (`requireAdmin`) and role-fetching pattern lives in Supabase edge functions; reusing it is cheap and consistent.
- The audit trail and synonym table are in Supabase; an edge function avoids cross-system service-role token shipping.
- The read path stays on the existing Cloudflare worker (low-latency, cached). The admin path is low-traffic, so an edge function is appropriate.

## Drift-aware design

For each managed object, the function exposes both **desired** (from Postgres) and **applied** (from Meili) state:

- `GET /indexes/:name/settings?source=desired` → latest `search_settings_versions` row.
- `GET /indexes/:name/settings?source=applied` → live `GET /indexes/<name>/settings` from Meili.
- The Settings tab renders both side by side and highlights diffs.

Same pattern for synonyms (DB rows vs. Meili `synonyms` map).

## Reindex orchestration

```
admin clicks "Reindex venues"
  │
  ▼
POST /reindex { index: "venues", scope: { full: true } }
  │
  ▼
edge function:
  1. insert into search_reindex_jobs (status='pending')
  2. record_search_audit('reindex.start', ...)
  3. invoke meilisearch-sync action='sync-type' type='venues'
     - meilisearch-sync returns { count, taskUids[] }
  4. update job: status='running', total=count, meili_task_uids
  5. respond { jobId }
  │
  ▼
admin polls GET /reindex/:jobId
  - edge function reads job row
  - for each task uid, polls Meili /tasks/<uid>, aggregates
  - if all tasks 'succeeded', mark job completed
```

Reindex never bypasses `meilisearch-sync` so document-shape rules stay in one place.

## Feature flag

`VITE_FEATURE_SEARCH_INTELLIGENCE` (compile-time). When unset/false:
- The route still exists but renders a "coming soon" notice.
- The nav entry is hidden.
- The edge function is fully deployed but only reachable for admins (no public surface change).

## Security posture

- Admin role check uses the same `user_roles` table as every other admin function.
- All writes record an audit row in the same edge-function call (best-effort, never blocking the response).
- `MEILISEARCH_ADMIN_KEY` and `SUPABASE_SERVICE_ROLE_KEY` exist only in the edge function's env; never in browser bundles.
- Destructive routes (settings.apply, reindex full) are POST only and require an explicit `confirm: true` payload field validated server-side.
- Rate limit: edge function reads `search_audit_log` to throttle to 60 admin-write actions / minute / actor. (Soft; not in Phase 0 MVP — listed under doc 06.)

## Observability

- Every mutation writes to `search_audit_log`.
- Reindex jobs record progress in `search_reindex_jobs`.
- The Overview tab surfaces: index counts, last-sync ages, pending tasks, drift counts, recent audit entries.
- The Search Debugger logs each test query to `search_audit_log` with `action='debug.query'` so we can later analyse what admins were probing.

## Future hooks (intentionally not in Phase 0)

- `topic_clusters` and `unified_tags.name_i18n` are referenced in the unified model but their migrations are deferred to Phase 2.
- Image embeddings + perceptual hashing slot into `quality_breakdown.images` without contract change.
- A polygon-based geo search (PostGIS) slots into `geo.polygon_id` without contract change.
