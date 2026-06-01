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
- Delete D1 `operator_notify` (0 tables), Worker `broken-bar-05d3-nlweb`, duplicate `scraper-api`, R2
  `ai-search-broken-bar-05d3-25f0b8` — **only after** the AutoRAG decision (B2) and confirming unused.
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
- **Precondition:** resolve `redis-*` backing store. Tear down VPS only after Meili retired + vLLM + Nominatim + Plane relocated.
- **Rollback:** keep VPS until all four confirmed healthy elsewhere.

### C4. Optional — Hyperdrive
- Front hot Postgres read paths from Workers. **Test:** latency improvement, correctness. **Rollback:** remove binding.

## Sequencing gates
- A1/A3/A4 independent — do first.
- B1 must precede C3 (vLLM needs a new home before VPS dies).
- C2 before C3 (Meili lives on VPS). C1 before C2 (search needs vectors).
- Resolve `redis-*` (open Q6) before C3.
