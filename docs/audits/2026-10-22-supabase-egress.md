# Supabase egress: what used the quota (2026-10-22)

Incident: every edge-function call returned `exceed_egress_quota` from 2026-10-20 22:00 to 2026-10-21 05:00 UTC.

## Method

- Edge logs (`edge_logs`) for 2026-10-19/20 (before the fixes) and 2026-10-21 19:00 → 10-22 19:00 (after #4549).
- PostgREST responses go out gzipped and chunked, so most log rows have no `content_length`. Sizes below come from replaying each query with the public anon key and counting gzipped bytes. Multiplied by the daily request count.
- Not measured: the Supabase usage/billing page. This session could not read the org (permission denied). #4549 read it: PostgREST 3.03 of 3.1 GB on 21 Oct, storage 51 MB, functions 1 MB, Realtime 14 MB, Pro plan 250 GB/cycle.

## Top contributors (24 h after #4549)

| # | Source | Size (gz) | /day | ≈ MB/day | Status |
|---|---|---|---|---|---|
| 1 | `countries` all-rights lists (`useAllCountriesRights` + `…Full`/`…Trans`) | 486 / 536 KB | 351 + 181 | ~267 | **fixed here → ~10** |
| 2 | `news_sources` list (`useNews.fetchSources`) | 111 KB | 1,174 | ~130 | **fixed here → ~23** |
| 3 | `news_articles` 200-row list | 85 KB | 1,239 | ~106 | open |
| 4 | `unified_tags` 1,000 rows with `description` | 134 KB | 603 | ~81 | open |
| 5 | Storage `village-images` / `city-images` | ~0.8 GB/day total | | ~800 | open, mostly CDN cache HITs |

Already fixed before this report (#4549, 2026-10-21): `queer_villages?select=*` (~960 MB/day) and `unified_tags?select=*` (~460 MB/day). Both now read 0 requests/day.

High-count but tiny (under 20 MB/day each): `site_branding` (61k/day, 43 B), `glossary_link_terms_public` (31k/day, 606 B), `currencies` (27k/day). RPCs: none large. No worker connects to Postgres directly; pooler traffic is only CLI `db push`.

## Who calls

- **CI against production.** 53% of API requests on 2026-10-20 had `Referer: http://localhost:4173` (GitHub Actions driving the built app). #4558 moved *Critical paths* to a local Supabase; other e2e jobs still hit prod (128k requests in the 18:00 hour today). Per request these are small, so the byte cost is lower than the count suggests. 488 MB/day of the storage reads also came from localhost.
- **Crawlers** (Reflectionbot, meta-externalagent, AhrefsBot): storage MISSes and the countries list.
- **New database egress:** `db-snapshot.yml` dumps 251 MB per run. Nightly that is 0.25 GB/day. It ran 12 times on 2026-10-22 because PRs touching the snapshot script trigger it.

## Fixes in this PR

1. `lgbti_criminalization` minus `enforcement`. That key is ILGA free text: 1.13 of the column's 1.2 MB across 250 rows, and nothing in `src/` or `functions/` reads it. The three all-countries fetches select every other key with PostgREST JSON-path columns (`crim_legal:lgbti_criminalization->legal`, …). `withCriminalization()` rebuilds the object, so `isCriminalized` / `deathPenaltyRisk` see the same input. 486 KB → 16.6 KB.
2. `news_sources` dropdown selects `id, name, url`. The Source dropdown and `sourcesMap` read nothing else. 111 KB → 20 KB.

Saves ~360 MB/day.

## Open, not in this PR

- Storage images still served from Supabase `village-images` / `city-images`. Moving them to R2 (`img.queer.guide`) is a data migration.
- Remaining e2e jobs against production.
- `news_articles` 200-row list and the 1,000-row tag list: trim when their consumers are checked.

## Does not reconcile

~3 GB/day cannot exhaust a 250 GB cycle. Check the usage page's per-day chart for an earlier spike and whether the restriction counted cached egress (storage HITs) or another project in the org.
