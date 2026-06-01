# Backlog (issue-tracker ready)

_Prioritized. P0 = do now, low risk. Audit date 2026-06-01._

## P0 — Quick wins
- [ ] **AI Gateway: route OpenAI calls through `qg-ai`** + short/zero retention. (`_shared/openai-client.ts`)
- [ ] **AI Gateway: route edge-function Workers-AI REST calls** through the gateway (unify with the 4 Workers already on it).
- [ ] **PII-redaction helper** applied before every model prompt. (`_shared/`)
- [ ] **Resend EU region** enabled; **inbound → Cloudflare Email Routing**.
- [ ] **Sentry PII scrub** + disable session replay + sampling. (`src` + `_shared` sentry init)
- [ ] **GitHub feedback: strip submitter identifiers** before forward. (`forward-feedback-to-github`, `push-feedback-to-github`)
- [ ] **Fix 2 security-advisor ERRORs** (RLS-disabled public table; security-definer view) + 3 `function_search_path_mutable`.
- [ ] **Confirm `redis-*` backing store** (Upstash / VPS / Plane redis). _Blocks Infomaniak teardown._

## P1 — Decisions + relocations
- [ ] **Decide vLLM relocation target** (CH/EU GPU VPS vs EU managed endpoint). _Open Q1._
- [ ] **Relocate sensitive-inference vLLM** off Infomaniak; route trip/submission/cms-ai flows to it.
- [ ] **AutoRAG decision** for `assistant.knowledge_search`: activate (define corpus) or delete trial. _Open Q2._
- [ ] **Standardize `tag_embeddings`** ada-002 → bge-m3 (1024-d).
- [ ] **Delete dormant CF resources** (D1 `operator_notify`, `broken-bar-05d3-nlweb`, dup `scraper-api`, stale R2) — after AutoRAG decision.

## P2 — Structural (gated)
- [ ] **pgvector → Vectorize**: indexes per entity type, dual-write, rebuild RRF+geo fusion in `search-proxy`.
- [ ] **Shadow-validate** Vectorize+PG search vs Meili (overlap + p95) before cutover.
- [ ] **Retire Meilisearch** after SLOs met.
- [ ] **Relocate Nominatim** (min EU host / CF Container) — Mapbox geocoding then deprecated.
- [ ] **Move Plane off VPS** (Plane Cloud EU / Linear / small host). _Open Q3._
- [ ] **Decommission Infomaniak VPS** (after vLLM + Meili + Nominatim + Plane all relocated).
- [ ] _Optional:_ **Hyperdrive** front for hot Postgres reads.

## Accept (no action)
- Stripe (necessary, PCI-scoped, DPA on file).
- 18 read-only ingestion sources (no user PII egress).
- Supabase Postgres as system of record (Zürich, EU-resident).

## Cross-cutting
- [ ] **Residency note**: document processing regions of Workers AI, AI Gateway logs, Vectorize, AutoRAG.
- [ ] **Until decommission**: CF-proxy or Tunnel the Infomaniak subdomains (origin IP currently exposed).
