# Search rollout runbook — Meilisearch → Postgres + Cloudflare

Operational guide for cutting `search.queer.guide` over from Meilisearch to the
Postgres `search_documents` engine, plus lighting up recommendations and the
assistant. Plan: `docs/search-intelligence/meili-to-postgres-migration-plan.md`.

The DB side is **already live** on Supabase `xqeacpakadqfxjxjcewc` (the
`search_documents` table, `search_hybrid`/`search_facets` RPCs, triggers, and the
discovery RPCs). What remains is worker rollout + flag flips below.

## Auth (run from a checkout of this repo)

`wrangler` is a **local devDependency** of each worker — not a global command.
This environment can't auth interactively (`wrangler login` needs a pty/browser),
so use a non-interactive API token:

```bash
export CLOUDFLARE_API_TOKEN=<token>          # "Edit Cloudflare Workers" template
export CLOUDFLARE_ACCOUNT_ID=7aa3765cc5f50f2b681b782eb4a8d296
cd workers/search-proxy && npm install        # provides ./node_modules/.bin/wrangler
npx wrangler deploy
```

## Stage 0 — deploy search-proxy (safe)

`SEARCH_BACKEND` defaults to `meili`, so deploying the new code changes **nothing**
in live ranking except `/similar` (now the cleaner `related_entities` RPC) and the
new `/recommendations` endpoint. Existing secrets persist across deploys.

Smoke test:
```bash
curl -s https://search.queer.guide/health
curl -s -XPOST https://search.queer.guide/search -H 'content-type: application/json' \
  -d '{"query":"berlin","hitsPerPage":3}'
curl -s -XPOST https://search.queer.guide/recommendations -H 'content-type: application/json' \
  -d '{"limit":3}'
```

## Stage A — shadow mode (validate PG vs live)

Serves Meili to users; runs the Postgres path in parallel and logs a comparison.

```bash
npx wrangler deploy --var SEARCH_BACKEND:shadow     # or set in wrangler.toml
npx wrangler tail --format json | grep search_shadow
```

> ⚠️ The log tag is **`search_shadow`** (not `shadow_diff`). Each `/search` emits:
> ```json
> {"tag":"search_shadow","q":"berlin","overlap_at_10":7,
>  "meili_top":[...],"pg_top":[...],"pg_total":179,"pg_ms":120}
> ```
> - `overlap_at_10` — of the current production top-10 (Meili+pgvector fused), how
>   many also appear in the pure-Postgres `search_hybrid` top-10.
> - `pg_total` — PG result count (`0` while Meili returned hits = a real divergence
>   worth inspecting).
> - `pg_ms` — Postgres path latency.
>
> Only fires on the `/search` fusion path — not autocomplete, bare-stopword, or
> non-Latin queries (they short-circuit earlier).

Collect ~24h of real traffic, then assess against the **cutover gate**:
- median `overlap_at_10` ≳ **6–7**,
- near-zero cases of `pg_total=0` where Meili returned hits,
- `pg_ms` p95 within ~**500ms**,
- spot-check low-overlap queries: PG ordering should be *different-but-fine*
  (RRF weighting differs), not worse.

## Stage B — cut over to Postgres

```bash
npx wrangler deploy --var SEARCH_BACKEND:pg
```
Monitor zero-hit rate / latency / errors on **production** (queer.guide) for ~1
week. Instant rollback at any time:
```bash
npx wrangler deploy --var SEARCH_BACKEND:meili
```

## Stage C — frontend recommendations panel

The zero-query "For you" panel is wired but gated. After the worker is live
(it serves `/recommendations`), enable it in **Cloudflare Pages → queer-guide →
Settings → Environment variables**:
```
VITE_RECOMMENDATIONS_ENABLED = true
```
Redeploy Pages (or push to `main`). Until set, the panel shows trending and fires
no `/recommendations` request.

## Stage D — assistant (Phase 6)

```bash
cd workers/assistant && npm install
export CLOUDFLARE_API_TOKEN=<token>
export CLOUDFLARE_ACCOUNT_ID=7aa3765cc5f50f2b681b782eb4a8d296
npx wrangler deploy
printf '%s' '<anthropic-key>' | npx wrangler secret put ANTHROPIC_API_KEY
printf '%s' 'https://xqeacpakadqfxjxjcewc.supabase.co' | npx wrangler secret put SUPABASE_URL
printf '%s' '<service-role-key>' | npx wrangler secret put SUPABASE_SERVICE_KEY
curl -s -XPOST https://assistant.queer.guide/assistant -H 'content-type: application/json' \
  -d '{"message":"wheelchair accessible gay bars in berlin"}'
```

## Stage E — decommission Meilisearch (after B is validated)

Only once `pg` has run cleanly in production:
- delete `meilisearch-sync` edge function + its pg_net triggers + reconcile crons,
- remove `workers/search-proxy/src/meili.ts`, the `meilisearch/` dir, `configure-*.sh`,
- shut down the Infomaniak Meili node,
- update CLAUDE.md (Search section).

## Operational note — repopulating search_documents

`search_documents_rebuild()` is a single transaction; on ~74k vectors the HNSW
maintenance exceeds short client timeouts. To repopulate from scratch: drop the
HNSW index, run the per-type index functions (or `rebuild()`), then recreate the
index. Day-to-day freshness is automatic via the entity + `content_embeddings`
triggers.
