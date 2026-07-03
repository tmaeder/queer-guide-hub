# Search relevance eval harness

Offline relevance gate for the Postgres `search_hybrid` RPC. Originally built
as the cutover gate of the Meilisearch → Postgres migration (complete since
2026-06); it now guards against silent ranking drift.

## What's here

| File | Purpose |
|------|---------|
| `search-test.mjs` | **End-to-end API/contract/resilience suite — no credentials needed.** Hits the live `search-proxy` HTTP API (`/search`, `/autocomplete`, `/health`) and asserts the contract, filters, geo, pagination, edge cases, entity-type coverage + a latency sample. Agent-runnable (see below). |
| `run.mjs` | Dependency-free Node runner. Hits `search_hybrid` via PostgREST, checks a curated golden set + a zero-hit probe + p95 latency, exits non-zero on regression. (Needs Supabase service key.) |
| `golden.json` | Curated query → expected result assertions + thresholds. |
| `known-item.sql` | SQL-side known-item retrieval eval (Recall@10 / MRR@10) over a random sample. Run in `psql` / Supabase SQL editor. |

## Running the E2E suite (for a Claude / cowork agent)

`search-test.mjs` needs **no secrets** — it tests the public search endpoint. Just run it:

```bash
node scripts/search-eval/search-test.mjs            # against prod (search.queer.guide)
SEARCH_URL=https://search.queer.guide node scripts/search-eval/search-test.mjs
node scripts/search-eval/search-test.mjs --json     # machine-readable summary for an agent to parse
```

- **Exit 0** = all HARD assertions passed; **non-zero** = a contract/functional regression.
- **HARD** assertions = deterministic invariants (status codes, response shape, filter correctness,
  pagination, clamping, graceful validation). These gate the run.
- **SOFT** checks = relevance/ranking (data-dependent) — printed as warnings, never fail the run, so an
  agent can eyeball quality without flakiness.
- Prints a server + wall-clock latency sample (p50/p95). Last green baseline: 36/36 hard, server p50 ~430 ms / p95 ~640 ms (warm).

**Scenario coverage:** smoke/contract (S*), relevance (R*, soft), keyword robustness — typo/diacritics (K*),
filters incl. type/city/facets (F*), geo radius (G*), autocomplete (A*), pagination (PG*), edge cases —
injection/long/unicode/clamp (X*), entity-type coverage (E*), latency (L*).

**SQL-side scenarios** (parity + recall) that need DB access — run via the Supabase MCP / SQL editor:
- **Embedding-move parity** (PR #1421 gate): compare `search_hybrid` vs the candidate `search_hybrid_v3`
  across keyword / keyword+vector / pure-vector — totals + ordered `_rankingScore` sequences must match.
- **Known-item recall** (`known-item.sql`): per-type Recall@10 / MRR@10 vs the baselines below.

## Running

```bash
SUPABASE_URL="https://<project>.supabase.co" \
SUPABASE_SERVICE_KEY="<service-role-key>" \
node scripts/search-eval/run.mjs
```

Without the env vars it prints a skip notice and exits 0 (so the opt-in
workflow stays green where the secret isn't configured).

`run.mjs` is **keyword-only** (`p_query_vec = null`) so it's deterministic in CI
and isolates the FTS + trigram + ranking legs (what the title/known-item
assertions target). The semantic leg runs only in the live Worker path.

## Assertions

Golden cases match on **title + city within top-K**, not exact slug — well-known
venues legitimately have duplicate slugs (`berghain-1` / `berghain-3`), so a
slug-exact assertion would be brittle. `minResults` cases assert a non-empty,
on-topic result set.

## Baselines (full corpus, 2026-05-31)

Per-type known-item Recall@10 / MRR@10 (see `known-item.sql`):

| Type | Recall@10 | MRR@10 | Notes |
|------|-----------|--------|-------|
| country | 1.00 | 1.00 | |
| marketplace | 1.00 | 0.96 | |
| tag | 1.00 | 0.95 | |
| personality | 1.00 | 0.92 | |
| queer_village | 1.00 | 0.86 | |
| city | 1.00 | 0.77 | globally-duplicate city names |
| venue | 0.89 | 0.61 | **the reliable regression gate** |
| event / news | — | — | intentionally noisier (below) |

- **Venues** are the reliable gate (distinct names): Recall@10 0.89, MRR@10 0.61, rank-1 ~48%.
- **Events** — noisier and intentionally so:
  - Past events are **hidden** by `search_hybrid` (`start_date >= now-1d`), so a
    random sample that includes past events scores near-zero — expected, not a defect.
  - Even among upcoming events, titles are highly **non-unique** (recurring nights,
    per-city variants) and the **imminence boost** ranks sooner same-title events
    first, so a randomly sampled future event is often not top-10 for its own bare
    title. Judge event relevance with distinctive queries, not bare titles.

## Thresholds (in `golden.json`)

- `maxZeroHitRate` — fraction of the zero-hit probe allowed to return nothing.
- `venueKnownItemRecallAt10` — gate for the SQL known-item eval (run separately).
- `p95LatencyMs` — p95 over all harness calls.

The corpus now covers all 9 canonical entity types (not just the venues+events
pilot); the per-type baselines above are the reference for regression checks.
