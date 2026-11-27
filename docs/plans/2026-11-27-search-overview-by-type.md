# Search results: an overview by type

2026-11-27. Status: steps 1 and 2 live (#5817, deployed 09:50Z). Step 3 in progress.

## Problem

`/search?q=berlin` returns one flat, mixed ranking of 1,823 results. Measured
on prod at 1440px and 390px:

- The reader sees one interleaved list: the City card, then Berlin,
  Connecticut, then an adult event, then drag shows. Unrelated types compete
  for the same ranking.
- The scope chips (Venues, Events, …) carry no counts, although the page
  already receives `facetDistribution.type`.
- On a phone, the first result starts below the fold.

### The finding that reshaped the plan

For `berlin`, the type facet contained only city-bearing types (venue 1006,
event 561, organization 230, milestone 12, queer_village 9, guide 3, city 2),
and those counts sum to exactly the 1,823 total. News, marketplace, people and
tags were missing entirely, although `search_documents` holds 107 news and 213
marketplace rows titled Berlin.

The cause is `workers/search-proxy/src/index.ts`: when the LLM rewrite
extracted a city that the reader had typed, the city became a hard
`filters.city`. That keeps only rows filed under the city. A query that IS the
city therefore lost every type without a city, so a grouped overview of a city
query could only ever show venue/event/place sections.

## Decisions (with the owner, 2026-11-27)

1. Build a grouped overview for the "All" tab.
2. Leave ranking as it is. Adult results stay on relevance.
3. Order sections by the mixed ranking: where each type's first hit falls.
4. A bare city query no longer hard-filters. "bars in berlin" still does.

## Steps

### 1. Bare city queries stop filtering (this PR)

- `cityFilterApplies(texts, city)` in `queryPrep.ts`: filter only when the
  city is typed as a whole word AND something other than connectors
  (`in`, `at`, `im`, `en`, …) remains. Whole-word matching also stops
  "berliner" counting as typing "berlin".
- Fix `workers/search-proxy/package-lock.json`. `deploy-search` has failed on
  `npm ci` since 2026-11-22, so no search-worker change has shipped since.
  The same drift in image-cdn/assistant/submit is a separate task.
- Verify on prod after the deploy: the `berlin` type facet includes `news`,
  the total is above 1,823, the City card is still first, and
  `bars in berlin` still narrows to Berlin.

Known edge: "berlin germany" still filters, because "germany" counts as a
topic. Fix later if it matters.

**Measured on prod after the deploy:** `berlin` went from 1,823 to 2,906
results, now including 159 news, 905 marketplace and 5 people, with the City
card still first.

Correction: the verification list above expected "bars in berlin" to still
narrow to Berlin. It never did. The rewrite only runs on queries under 3 words
(`shouldRewrite`), so a 3-word query never had a city extracted, before or
after this change. "bars berlin" (2 words) does narrow.

### 2. Worker `groupBy: 'type'`

- `POST /search` gains `groupBy: 'type'` and `perType` (default 4, max 8).
  Without `groupBy`, behaviour is unchanged.
- Rewrite, synonyms and embedding run once. Then, in parallel:
  - one mixed `search_hybrid` (`hitsPerPage` 50), used only for section order;
  - one `search_hybrid` per scope type with `hitsPerPage = perType`;
  - one `search_facets`, which provides section totals.
- Response: `{ groups: [{ type, hits, total }], facetDistribution, totalHits }`.
  Empty types are dropped. Types missing from the mixed top 50 go last, by
  facet count.
- Safety gating (`include_gated`) and personalization pass through every
  call. Add a test that a gated row cannot appear in any group for anon.
- Section counts are each per-type call's own `search_hybrid` `total`, which
  is exact. So per-type calls skip `search_facets` (`skipFacets`), and only
  the mixed call runs facets.
- Within a section, ranking is the scoped list's: same page size, same
  `personalizedRank` and `prioritizeQueryMatches`. The reranker is skipped in
  grouped mode, because it would mean one model call per section.
- A failed per-type call drops that section and is named in `groupErrors`; a
  failed mixed call answers 503.

**Cost gate.** Measure in the worker with `debug.timings` before enabling
the overview: overview p95 must be at most 1.5× today's single-call p95. A
client-side proxy (9 separate worker requests, each also running facets)
gave p50 1.0–1.9 s against 0.5–0.8 s for one call. That overstates the
in-worker cost, but it is close enough to the bar that the gate must be
measured, not assumed. Fallback: skip per-type calls for types whose facet
count is 0.

**Measured on prod (2026-11-27, 8 warmed runs × 4 queries):** the first build
failed the gate. Grouped p95 was 1.91× the flat search overall, and "berlin"
alone was 2.15× ("drag show" 1.30×, "leather" 1.34×, "pride events" 0.98×).
Timing each call on its own pinned the cause: the ordering call fetched 50
rows and took ~1.95 s for "berlin", against ~0.87 s at 20, while the slowest
per-type call (marketplace) took 0.72 s. The ordering call now uses the flat
page size.

Rejected alternatives: client fan-out (8× LLM rewrites and simultaneous
embedding cache misses per page view), and a grouped SQL RPC (the top-200
vector pool can starve small types, and it adds a second ranking
implementation that can drift).

### 3. Page: `SearchOverview`

- With a query and no scope: one section per type, showing its route bullet,
  label, count, up to 4 `SearchResultCard` rows, and a "See all N" link that
  sets the scope exactly as the chip does (URL stays the source of truth).
- A selected scope keeps today's flat list, sort, views and Load more.
- The overview has no Load more and no map, grid or calendar views.
- Scope chips show counts from facets.
- Click analytics add `section` and `position`.
- Fix `countActiveFilters`, which counts `tags` twice.

### 4. Verification

- Worker unit tests: grouping, ordering, gating.
- vitest for `SearchOverview`.
- Prod e2e for `?q=berlin`: sections render in mixed-ranking order, a News
  section is present (it proves step 1), and "See all" lands on the scoped
  list. Positive control first: a scoped call returns results.

## Later

- Header so the query becomes the title (the fold problem on phones).
- Quieter feedback thumbs.
