# Backlog (issue-tracker ready)

_Prioritized. P0 = do now, low risk. Audit date 2026-06-01._

## P0 — Quick wins
- [x] **AI Gateway: route OpenAI + edge-fn Workers-AI calls through the gateway** — code landed
  (`_shared/ai-gateway.ts` + wired into `_shared/openai-client.ts` & `_shared/llm-client.ts`).
  **Activation (no code):** set `AI_GATEWAY_NAME` (= `qg-search` or a new `qg-ai`) on Supabase edge secrets;
  optional `AI_GATEWAY_TOKEN` for an authenticated gateway; configure short/zero log retention in the gateway.
  Inert until `AI_GATEWAY_NAME` is set. Then `supabase functions deploy` the AI functions.
- [x] **PII-redaction helper** created (`_shared/pii-redact.ts`). _Wire into sensitive flows (trip/cms/submission) in P1._
- [ ] **Resend EU region** enabled; **inbound → Cloudflare Email Routing**.
- [ ] **Sentry PII scrub** + disable session replay + sampling. (`src` + `_shared` sentry init)
- [ ] **GitHub feedback: strip submitter identifiers** before forward. (`forward-feedback-to-github`, `push-feedback-to-github`)
- [x] **Fix 2 security-advisor ERRORs + 3 `function_search_path_mutable`** — **APPLIED to prod 2026-06-01**
  (`supabase/migrations/20260601130000_security_advisor_fixes.sql`): `personality_data_health` view →
  security_invoker; `personality_profession_tags` → RLS (public read / authenticated write); pinned
  search_path on `hamming_hex`, `find_near_duplicate_assets`, `collapse_duplicate_image_assets`.
  **Verified:** `get_advisors security` → 0 ERROR, 0 search_path_mutable (656 → 652 advisories).
- [ ] _(separate effort)_ **651 WARN advisories** — pg_graphql table exposure + security-definer-executable.
  Largely by-design for PostgREST; review whether `pg_graphql` should be locked down.
- [x] **Confirm `redis-*` backing store** → **Upstash Redis** (external, not Infomaniak). Does not block teardown.
- [ ] **Consolidate Upstash Redis → Cloudflare KV** (or Upstash EU region) to drop a US vendor. (`_shared/redis-client.ts`)

## P1 — Decisions + relocations
- [ ] **Decide vLLM relocation target** (CH/EU GPU VPS vs EU managed endpoint). _Open Q1._
- [ ] **Relocate sensitive-inference vLLM** off Infomaniak; route trip/submission/cms-ai flows to it.
- [ ] **AutoRAG decision** for `assistant.knowledge_search`: activate (define corpus) or delete trial. _Open Q2._
- [ ] **Standardize `tag_embeddings`** ada-002 → bge-m3 (1024-d).
- [ ] **Delete dormant CF resources** (`broken-bar-05d3-nlweb`, dup `scraper-api`, stale R2) via wrangler — after AutoRAG decision. _(NOT D1 `operator_notify` — active env.DB of operator-notify-inbound.)_

## P2 — Structural (gated)
- [ ] **pgvector → Vectorize**: indexes per entity type, dual-write, rebuild RRF+geo fusion in `search-proxy`.
- [ ] **Search latency (investigated 2026-06-02 — NOT a query-rewrite fix):** two `search_hybrid_v2`
  rewrites (rank-then-hydrate, inline-kwvec) were built, benchmarked + parity-tested on the live DB, and
  **both regressed** (553ms / 876ms vs 270ms baseline) — dropped. Warm is ~270ms; p95 4.4s is **cold-cache
  I/O on a 1.23GB table**. Real levers (each to be measured): `pg_prewarm` GIN+HNSW, move the 4KB
  `vector(1024)` embedding to a sibling table (keyword queries skip it), VACUUM/repack + ANALYZE. Full
  evidence in [search-latency-finding.md](search-latency-finding.md).
- [ ] **Shadow-validate** Vectorize search vs the live Postgres `search_hybrid` path (overlap + p95) before cutover.
- [x] **Retire Meilisearch (search serving)** — DONE in PR #1405 (search → Postgres; `meilisearch-sync` deleted; ingest worker Meili write removed upstream).
- [ ] **Shut down the Infomaniak Meili node** — serving-safe now: no writers left; the only readers
  (`trip-concierge`, `ai-plan-trip`) are guarded (`if (!MEILISEARCH_URL) return []`) and throw-safe (`.catch`).
  **Order matters:** (1) unset `MEILISEARCH_URL` / `MEILISEARCH_SEARCH_KEY` / `MEILISEARCH_ADMIN_KEY` secrets on
  those two functions first — else each call eats a dead-node fetch timeout before `.catch` fires (adds latency);
  with the secret unset they short-circuit instantly. (2) Then stop the node. _(Needs Supabase secrets access +
  Infomaniak SSH — no agent tool for either.)_
- [ ] **Follow-up: migrate `trip-concierge` + `ai-plan-trip` candidate retrieval off Meili** → pg `search_hybrid`
  / search-proxy. Until then, killing Meili degrades trip suggestions to empty candidate lists (graceful, not an outage).
- [ ] **Relocate Nominatim** (min EU host / CF Container) — Mapbox geocoding then deprecated.
- [ ] **Move Plane off VPS** (Plane Cloud EU / Linear / small host). _Open Q3._
- [ ] **Decommission Infomaniak VPS** (after vLLM + Nominatim + Plane relocated — Meili already gone, #1405).
- [ ] _Optional:_ **Hyperdrive** front for hot Postgres reads.

## search-intelligence cleanup (post-#1405) — scoped, NOT a blind strip
- [x] **BUG FIXED: `startReindex` drove the deleted `meilisearch-sync`** — now returns a clear 410
  ("search moved to Postgres #1405; re-embedding via search-ingest /backfill") instead of spawning a
  job that can never complete. Removed the dead `driveSyncTypeAndUpdate` + `failJob` helpers. Route is
  unused by the admin UI (FE only calls `indexes` + `synonyms`). Also fixed a pre-existing unrelated
  type error in `_shared/ai-suggestions.ts:188` (cast-through-unknown) so `deno check` passes clean.
- [ ] **Full Meili-route removal is a FE+BE refactor, not a no-op strip.** Meili routes (`indexStats`,
  `searchDebug`, `getTask`, `cronReconcile`, reindex, + meili branches in `listIndexes`/`getIndexSettings`/
  `patch`/`rollback`/`syncSynonyms`/`consistencyCheck`) are interwoven with still-useful DB-backed routes
  (synonyms, clusters, suggestions, visibility, settings-versions, audit) AND called by the admin UI
  (`AdminSearchIntelligence.tsx`, `useSearchIntelligence.ts`, `SetupTab.tsx`, `adminNavigation.ts`,
  `routes.tsx`, + test). Do as a scoped, reviewed PR across edge fn + ~7 frontend files — not an autonomous gut.

## Accept (no action)
- Stripe (necessary, PCI-scoped, DPA on file).
- 18 read-only ingestion sources (no user PII egress).
- Supabase Postgres as system of record (Zürich, EU-resident).

## Cross-cutting
- [ ] **Residency note**: document processing regions of Workers AI, AI Gateway logs, Vectorize, AutoRAG.
- [ ] **Until decommission**: CF-proxy or Tunnel the Infomaniak subdomains (origin IP currently exposed).
