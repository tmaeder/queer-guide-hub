# Migration Plan

_Phased: quick wins → swaps → structural. Each step: test · rollback · cutover. Audit date 2026-06-01._

_Locked decisions: (1) AI residency hybrid-by-sensitivity; (2) full pgvector→Vectorize; (3) minimize Infomaniak._

## Phase A — Quick wins (low risk, reversible; ~1 wk)

### A1. Unify all model traffic behind AI Gateway `qg-ai`
- **Change:** route every OpenAI call (`_shared/openai-client.ts`) and edge-function Workers-AI REST call
  through AI Gateway; add a PII-redaction helper applied before every prompt; set short/zero log retention.
- **Test:** response parity on a sample; AI Gateway analytics populate; grep shows no direct `api.openai.com`
  / direct `api.cloudflare.com/.../ai/` calls remain.
- **Rollback:** unset `AI_GATEWAY_NAME` / revert base URL.
- **Cutover:** env flag, function-by-function.

### A2. Clean dormant resources
- Delete Worker `broken-bar-05d3-nlweb`, duplicate `scraper-api`, R2 `ai-search-broken-bar-05d3-25f0b8` —
  **only after** the AutoRAG decision (B2) and confirming unused. Requires wrangler (no Worker-delete MCP tool).
- **NOT a candidate:** D1 `operator_notify` is the active `operator-notify-inbound` mail Worker's `env.DB`. Keep.
- **Test:** no references in code/wrangler. **Rollback:** recreate (config is in repo).

### A3. Email residency
- Enable **Resend EU region**; move inbound to **Cloudflare Email Routing**.
- **Test:** test send shows EU headers; inbound routes to a real address; `resend-webhook` still verifies.
- **Rollback:** revert region flag.

### A4. PII hardening on egress vendors
- Sentry: `beforeSend` scrub + disable session replay + sample. GitHub: strip submitter identifiers.
- **Test:** trigger an error → verify no PII in Sentry event. **Rollback:** revert config.

### A5. Security advisors (spin off)
- Fix 2 ERRORs (RLS-disabled public table; security-definer view) + 3 `function_search_path_mutable`.
- Separate task; run `get_advisors security` → 0 ERROR after.

## Phase B — Swap & relocate (medium; ~2 wks)

### B1. Relocate sensitive-inference vLLM off Infomaniak
- Stand up minimal EU GPU host **or** EU managed inference endpoint; repoint `QG_LLM_BASE_URL`; front with AI Gateway.
- Route user-identifiable flows (`trip-concierge`, submission enrich, `cms-ai`) to it as primary.
- **Test:** those flows resolve to EU endpoint; latency within budget. **Cutover:** dual-config + fallback; flip when green. **Rollback:** repoint to old endpoint.

### B2. AutoRAG decision
- Activate Cloudflare AutoRAG for `assistant.knowledge_search` (define corpus) **or** delete the trial (A2).
- **Test:** assistant retrieval quality vs current. **Rollback:** disable tool, revert to prior path.

### B3. Standardize embeddings
- Re-embed `tag_embeddings` from legacy ada-002 (1536-d) to bge-m3 (1024-d); converge all tables on 1024-d.
- **Test:** tag-similarity parity. **Rollback:** keep old column until verified.

## Phase C — Structural (high; ~2–3 wks, gated)

### C1. pgvector → Vectorize
- Create one Vectorize index per entity type (1024-d, cosine). **Dual-write** embeddings (Postgres + Vectorize)
  during validation. Rebuild **RRF fusion + PostGIS geo + recency decay in `search-proxy`**:
  Vectorize ANN top-k ⨝ Postgres keyword(tsvector)+geo, fuse in Worker.
- Move clean pure-ANN paths first (`related_entities`, tag similarity, dedup ANN leg), then fused paths.
- **Test:** shadow harness (`scripts/search-eval/shadow-analyze.mjs` pattern) — result overlap ≥ target and
  p95 < Meili baseline; recommendations/dedup parity. **Cutover:** flip after N days green. **Rollback:** keep pgvector.

### C2. Retire Meilisearch
- After Vectorize+PG path meets SLOs (resolves current NO-GO). **Test:** prod search parity. **Rollback:** flip `SEARCH_BACKEND` back to `meili`.

### C3. Decommission Infomaniak
- Relocate Nominatim (min EU host or CF Container); move Plane (Plane Cloud EU / Linear / small host).
- **Precondition:** `redis-*` backing store confirmed = **Upstash** (external, not on the VPS — no longer a blocker).
  Tear down VPS only after Meili retired + vLLM + Nominatim + Plane relocated.
- **Rollback:** keep VPS until all four confirmed healthy elsewhere.

### C4. Optional — Hyperdrive
- Front hot Postgres read paths from Workers. **Test:** latency improvement, correctness. **Rollback:** remove binding.

## Execution status (2026-06-01)

| Step | Status | Who can finish |
|---|---|---|
| A1 gateway routing code | **done** (branch) | agent ✅ |
| A1 gateway **activation** | pending | human (set secret + deploy + watch dashboard) |
| A4 PII-redact helper | **done** (branch) | agent ✅ |
| A5 security advisors | **APPLIED to prod** ✅ (0 ERROR verified) | agent ✅ |
| Q6 redis backing store | **resolved** = Upstash | agent ✅ |
| A2 clean dormant CF resources | pending | agent-capable (needs go-ahead — destructive) |
| A3 Resend EU + CF Email Routing | pending | human (Resend + CF dashboards) |
| B1 vLLM relocation | pending | human (server provisioning) |
| B2 AutoRAG | pending | human (corpus choice + dashboard) |
| C1 Vectorize | pending | human+agent (no Vectorize MCP tool; needs wrangler + Worker rebuild; gated on PG cutover) |
| C2/C3 Meili/Infomaniak retire | pending | human (infra) |

## Activation commands (for the human-gated steps)

### A1 — activate AI Gateway (reversible: unset the secret)
```bash
# 1. set the gateway name as a Supabase edge secret (qg-search exists, or make a qg-ai chat gateway)
supabase secrets set AI_GATEWAY_NAME=qg-search --project-ref xqeacpakadqfxjxjcewc
#    (optional, authenticated gateway) supabase secrets set AI_GATEWAY_TOKEN=<token> ...
# 2. deploy the AI edge functions so they pick up the new _shared routing code, e.g.
supabase functions deploy pipeline-enrich-news pipeline-enrich-events pipeline-enrich-venue \
  pipeline-quality-enhance event-agentic-enrich trip-concierge cms-ai packing-suggestions-llm \
  --project-ref xqeacpakadqfxjxjcewc
# 3. watch the gateway dashboard fill (requests, cache hits, cost). Rollback: `supabase secrets unset AI_GATEWAY_NAME`
```
Also set short/zero log retention on the gateway (dashboard) and confirm processing region before flipping.

### A2 — clean dormant CF resources (destructive; confirm unused first)
```bash
# NOTE: do NOT delete D1 operator_notify — it is the active operator-notify-inbound Worker's env.DB.
wrangler delete --name broken-bar-05d3-nlweb     # dormant AutoRAG/NLWeb trial
wrangler delete --name scraper-api               # duplicate of queer-guide-scraper-api
wrangler r2 bucket delete ai-search-broken-bar-05d3-25f0b8   # only if NOT activating AutoRAG (B2)
```

### A3 — email residency
- Resend dashboard → enable EU data region; rotate `RESEND_API_KEY`.
- CF dashboard → Email Routing for inbound `*@queer.guide` (already own the zone).

### C1 — Vectorize (no MCP tool; needs wrangler + Worker work)
```bash
wrangler vectorize create qg-venues --dimensions=1024 --metric=cosine   # repeat per entity type
```
Then: dual-write embeddings (Postgres + Vectorize) from the `ingest` Worker; rebuild RRF+geo fusion in
`search-proxy`; shadow-validate overlap + p95 vs Meili before flipping `SEARCH_BACKEND`.

## Sequencing gates
- A1/A3/A4 independent — do first.
- B1 must precede C3 (vLLM needs a new home before VPS dies).
- C2 before C3 (Meili lives on VPS). C1 before C2 (search needs vectors).
