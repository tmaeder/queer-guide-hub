# Search relevance eval harness

Offline relevance gate for the Postgres `search_hybrid` RPC — part of the
Meilisearch → Postgres migration (`docs/search-intelligence/meili-to-postgres-migration-plan.md`, §8.2).
It exists to (1) validate the Postgres path is at least as good as Meili before
cutover and (2) guard against silent ranking drift afterwards.

## What's here

| File | Purpose |
|------|---------|
| `run.mjs` | Dependency-free Node runner. Hits `search_hybrid` via PostgREST, checks a curated golden set + a zero-hit probe + p95 latency, exits non-zero on regression. |
| `golden.json` | Curated query → expected result assertions + thresholds. |
| `known-item.sql` | SQL-side known-item retrieval eval (Recall@10 / MRR@10) over a random sample. Run in `psql` / Supabase SQL editor. |

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
assertions target). The semantic leg is exercised end-to-end by the live
shadow-mode comparison in the Worker.

## Assertions

Golden cases match on **title + city within top-K**, not exact slug — well-known
venues legitimately have duplicate slugs (`berghain-1` / `berghain-3`), so a
slug-exact assertion would be brittle. `minResults` cases assert a non-empty,
on-topic result set.

## Baselines (venues+events pilot, 2026-05-31, n=200)

- **Venues** — Recall@10 **0.89**, MRR@10 **0.61**, rank-1 48%. The reliable gate.
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

Tune these as the pilot expands from venues+events to the remaining entity types.
