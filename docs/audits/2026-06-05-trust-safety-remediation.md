# Trust-&-Safety Audit — Remediation Log (2026-06-05)

Remediation of [`2026-06-05-trust-safety-audit.md`](./2026-06-05-trust-safety-audit.md).
All DB changes were applied to prod `xqeacpakadqfxjxjcewc` and verified; edge-function
and frontend changes deploy on merge to `main`.

## Release gates — all 4 Critical return 0

`select * from release_gate_checks()` after remediation:

| gate | severity | failures |
|---|---|---|
| `person_outing_guard` | critical | **0** |
| `hotline_unverified` | critical | **0** |
| `crim_consistency` | critical | **0** |
| `dup_integrity` | critical | **0** |
| `hotline_reachable` | high | 0 |
| `hotline_url_live` | high | 3 *(dead crisis links flagged needs_review — human URL fix)* |
| `venue_closed_seo` | high | 0 |
| `venue_url_freshness` | high | 4,690 *(drains as the now-daily url-checker runs)* |

Wired into CI (`.github/workflows/data-quality-gates.yml` → `npm run gates`), nightly,
skipping gracefully when secrets are absent. Critical > 0 blocks the PR.

## Fixed (verified on prod)

| ID | What shipped |
|---|---|
| **C-2 / H-5 / M-6** | `personalities.lgbti_connection` → controlled vocab + CHECK constraint; 5,096 public-living "Gay adult performer" rows demoted to `draft`; both scrape labels remapped to non-asserting `unclear` (raw preserved in non-public `lgbti_connection_source`); `death_date ⇒ is_living=false` trigger (14 rows fixed); search index restricted to public rows + draft docs purged; ingest enforcement in `pipeline-normalize`/`pipeline-validate` + shared `lgbti-connection.ts` (unit-tested). Outing guard 5,830 → **0**. |
| **C-1 / H-1 / H-2** | All 25 hotlines URL-liveness checked (phones validated for format, not dialed); 22 stamped `verified_at`/`verified_by`/`verified_method`; `du-bist-du.ch`→apex (TLS fix), `iglyo.com`→`.org`; 3 referral orgs tagged `kind='directory'` and rendered apart from call-now lines; 3 newly-found dead links flagged `needs_review` (phone CTA kept, dead website hidden). |
| **H-3** | `url_status='broken'` wired as a closure voter (+ venue's own link health fed to the consensus voter); `closed_at ⇒ seo_indexable=false` trigger; `venue_closed_seo` gate. |
| **H-4** | `venue-url-checker` rescheduled weekly→daily; 368 broken-URL venues demoted to `needs_attention`; dead public Website CTA hidden; `venue_url_freshness` gate. |
| **M-8** | 2,494 coords-without-country venues resolved **relationally** (own country text / city's country_id) — 9 genuinely-unresolvable remain (need geocoding). |
| **dup_integrity** | 9 chained `duplicate_of_id` pointers (events 2, news 7) the audit's venues/people-only check missed — collapsed to canonical. |
| **M-2** | `marketplace-link-checker` edge function built (probes `external_url`, writes `link_health`/`link_checked_at`, demotes broken→`inactive`); daily pg_cron; new column. |
| **L-1** | Marketplace validator rejects `price<=0` unless `price_type='free'`; 3 existing 0.00 listings → `inactive`. |
| **L-2** | `cleanText()` NFKC-normalizes + strips zero-width on ingest; 40 existing rows cleaned. |
| **L-3** | Venue validator flags mojibake (`W_MOJIBAKE`); 1 existing row flagged `needs_attention` (no auto-guess). |

## Deferred (with rationale)

These were assessed and intentionally not auto-fixed; each is a follow-up rather than
a quick remediation.

- **M-1 (marketplace queer-owned provenance).** Already honest by omission: the per-listing
  "Queer-owned" pill is driven by `business_type` (also empty), so no listing falsely
  claims queer ownership. Populating real provenance requires merchant self-declaration
  sourcing — fabricating it would be the opposite of the fix. **Do not back-fill a guess.**
- **M-3 (event timezone from coords).** Needs a tz-boundary dataset (tz shapefile in PostGIS
  or a lat/lng→tz service); no such data is present. Backfilling without it would guess.
- **M-4 (news geo/author).** Bulk LLM enrichment at scale; the P0 full-text path already
  shipped per the news closed-loop roadmap. Out of scope for a data-quality pass; run the
  enrichment pipeline rather than a one-shot backfill on a disk-constrained DB.
- **M-5 (drop `lgbt_legal_status`/`lgbt_rights_status`).** **Unsafe to drop** — the read-path
  audit found live consumers: the user-facing legality badge (`src/lib/lgbtLegality.ts`),
  admin CRUD (`AdminCountries.tsx`), city/village configs, and `event-agentic-enrich` safety
  context. Correct fix is a behaviour-preserving refactor to derive legality from the
  canonical `lgbti_criminalization` jsonb, then drop — a dedicated change, not a column drop.
- **M-7 (cross-source news syndication dedup).** Referential integrity fixed (chains collapsed);
  syndication *detection* (125 cross-source title/day groups) is an admin discovery
  enhancement to `find_duplicate_clusters('news')` — lower harm, deferred to avoid risk in a
  complex clustering RPC.
- **M-9 (venue accessibility metadata).** Requires sourcing structured accessibility tags
  (Google/OSM) into `accessibility_attributes` — a sourcing project, no data to populate today.

## Operational notes

- Batched DML scripts live in `scripts/data-quality/` (the per-row search re-index cascade
  exceeds the statement timeout in one transaction).
- Migrations `20260605120000`–`20260605170000`.
