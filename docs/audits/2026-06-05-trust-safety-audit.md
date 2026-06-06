# queer.guide — Data-Quality & Trust-&-Safety Audit

**Date:** 2026-06-05 · **Auditor mode:** senior data-quality + trust-&-safety
**Stakes model:** listings are *vetted* is treated as a contract. On an LGBTQ+ safety platform a dead crisis line, a closed venue surfaced as a "safe space," a criminalizing destination with no risk warning, or a person labeled without consent are **direct harms**, not cosmetic defects. Findings are severity-ranked by harm, not volume.

---

## 0. Access mode, sampling & limits (read first)

- **Access:** Live **read-only** SQL (SELECT-only, bounded aggregates) against production Supabase `xqeacpakadqfxjxjcewc` via MCP. No writes. Every Critical/High prevalence number below is reproducible by re-running the inlined query.
- **External checks:** `WebFetch` URL-liveness + on-page number cross-check on **all 25** hotline URLs (see §2b) + web spot-corroboration of the 7 death-penalty travel records. Phone numbers **cannot be dialed** — "corroborated" means the DB number equals the number published on the org's own live site, **not** call-tested.
- **Privacy:** No individual is named or surfaced anywhere in this report — people findings are aggregate counts only. Contact-PII scans returned zero leakage (verified, see F-P2).
- **Honesty rule:** "found wrong" vs "could not verify" are kept distinct. Unchecked ≠ healthy. Samples are never extrapolated to "all" without the word *sample*.
- **What could not be reached:** actual telephone connectivity of hotlines; ground-truth of each person's self-identified identity; per-listing marketplace link liveness (checker has never run); whether the 921 venue URL-checks are representative of the 22,267 unchecked.

**Corpus (live / merged-duplicate):** venues 23,188 / 9,568 · events 3,307 / 319 · countries 250 · cities 3,857 / 19 · marketplace 6,532 · news 16,752 / 427 · personalities 12,528 / 91 · news_sources 25 (18 active) · hotlines 25.

---

## 1. Executive summary

| Entity | Health | Headline issue |
|---|---|---|
| **help-hotlines** | **40** | **0 / 25 carry `verified_at`**, AND active verification found **~5 broken/wrong entries** (2 dead URLs, 1 301→404, 1 wrong number, 1 TLS-invalid) — the actual dead-crisis-line harm. See Hotline Verification Appendix. |
| **travel / countries** | **88** | Healthiest entity: complete real-destination coverage, internally consistent, fresh, externally corroborated. Two legacy text columns dead. |
| **people / personalities** | **45** | **5,096 living individuals publicly labeled "Gay adult performer"** via an uncontrolled free-text identity field; 2,106 lack any Wikidata anchor → outing + misidentification risk. |
| **venues** | **50** | Only 1.6% vetted; `closed_at` never populated (closed venues can't be filtered); 26% broken among the 4% of URLs ever checked. |
| **events** | **58** | Structurally sound (dates/coords/refs clean) but 98% liveness-unknown, 97% no venue link, 82% no timezone. |
| **news** | **62** | Clean URLs/sources/dedup; 98% no geo, 42% thin content, 12% no author. |
| **marketplace** | **60** | Cleanest structurally, but **queer-owned provenance 0% populated** and **link health 100% unchecked** (so "0 broken" = unknown). |

**Top Critical / High, one line each**
- **C-1 (hotlines):** 0/25 hotlines have `verified_at`; the "we vet this" promise has no freshness evidence on a crisis page.
- **C-2 (people):** 5,096 living, publicly-visible people carry an assigned "Gay adult performer" identity string; 2,106 without Wikidata provenance — outing/dignity + misidentification harm.
- **C-3 (hotlines):** active verification found **~5 / 25 with broken/wrong contact** — `trans-telefonberatung-de` (dead URL), `mindline-trans-uk` (404), `bzga-aids-beratung-de` (301→404), `lgbt-youthline-ca` (number `1-800-268-9688` ≠ live `1-888-687-9688`), `du-bist-du-ch` (TLS-invalid). A dead/wrong crisis line is the Critical harm itself.
- **H-1 (hotlines):** 3 crisis-page entries (ILGA, IGLYO, du-bist-du) offer **no phone and no contact channel** — a user in crisis reaches a website, not help.
- **H-2 (hotlines):** `du-bist-du.ch` fails TLS cert validation in-sample — a browser-level security warning on a crisis link.
- **H-3 (venues):** `closed_at` is NULL for **all 23,188** live venues — the closure-filter mechanism writes no data, so a closed venue cannot be suppressed.
- **H-4 (venues):** Of the 921 venues ever URL-checked, **239 (26%) are `broken`**; 96% of venues have never been checked.
- **H-5 (people):** `lgbti_connection` is an uncontrolled free-text field (3 values incl. NULL); the documented controlled vocab is not enforced.

---

## 2. Profiling appendix (field-level)

### help-hotlines (`cms_pages.body_json.hotlines[]`, slug=`help`) — n=25
| Field | Fill | Notes |
|---|---|---|
| `verified_at` | **0%** | Never populated. Type marks it "required for any newly-edited entry." |
| `phone` | 88% (22/25) | All format-valid, region-appropriate (988, 116 123, 142, 143, 116 111…). |
| `channels[]` | **0%** | Modern multi-channel array unused; everything rides legacy `phone`. |
| reachable (phone OR channel) | 88% | 3 entries have neither (F-H1). |
| `url`, `languages`, `hours` | 100% | Complete. |
| country coverage | 11 distinct | AT, AU, CA, CH, DE, FR, GB, IE, INT, NL, US — Global North only. |

### travel / countries — n=250
| Field | Fill | Notes |
|---|---|---|
| `equality_score` | 95.6% (239) | min 0, max 100; 2 at 0 (Mauritania, Uganda — corroborated). |
| `lgbti_criminalization` (non-empty) | 95.6% (239) | 11 empty are all **uninhabited territories**. |
| `lgbti_data_last_updated` | 100% | 240 distinct dates, 2026-04-21 → 2026-06-05 (genuinely per-country, recent). |
| `lgbt_legal_status` (text) | **0%** | Legacy column, dead. |
| `lgbt_rights_status` (text) | **0%** | Legacy column, dead. |

### people / personalities — n=12,528 (live)
| Field | Value | Notes |
|---|---|---|
| `visibility` | public 6,185 / draft 6,343 / private 0 | Half correctly gated as draft. |
| `lgbti_connection` | "Gay adult performer" 5,326 · "lgbtq_listed_source" 4,852 · NULL 2,350 | **Uncontrolled vocab**; single-value dominance. |
| contact-PII in `social_links`/`bio` | **0** | No email/phone leakage detected. |
| `is_living` ∧ `death_date` set | 13 | Down from 321 in the prior audit. |
| `birth_date` future / `death_date<birth_date` | 0 / 0 | Clean. |

### venues — n=23,188 (live)
| Field | Value | Notes |
|---|---|---|
| `verified` (bool) | 361 (1.6%) | Only vetting signal in use. |
| `verification_status='verified'` | 0 | Newer column never set. |
| `closed_at` | 0 | Closure detection not writing. |
| coords missing | 7,840 (33.8%) | Null Island holds at 0. |
| `url_status` | never-checked 22,267 · ok 340 · redirect 325 · **broken 239** · timeout 17 | Check coverage 4%. |
| merge-pointer integrity | 0 dangling / 0 dup→dup | Clean. |
| `accessibility_attributes` populated | 0 (0%) | No structured accessibility metadata anywhere (M-9). |
| coords valid-range / coords-but-no-country | 100% / 1,591 (6.9%) | No out-of-range coords; 1,591 unresolved to country (M-8). |

### events — n=3,307 · news — n=16,752 · marketplace — n=6,532
| Entity | Field | Value |
|---|---|---|
| events | no timezone | 2,729 (82.5%) |
| events | no `venue_id` | 3,197 (96.7%) · orphan venue_id: 0 |
| events | `liveness_status='unknown'` | 3,238 (97.9%) |
| events | past-but-active / end<start / no-coords | 1 / 0 / 0 |
| news | no geo (`country_ids` empty) | 16,415 (98.0%) |
| news | thin content (<200 chars) / no author | 7,015 (41.9%) / 2,017 (12.0%) |
| news | no url / future-dated / orphan source | 0 / 0 / 0 |
| marketplace | `community_owned_tags` populated | **0 (0%)** |
| marketplace | `link_health='unchecked'` | **6,532 (100%)** |
| marketplace | price ≤ 0 / bad currency / orphan merchant | 3 / 0 / 0 |

---

## 2b. Hotline verification appendix (active external checks, 2026-06-05)

All 25 hotlines were checked by `WebFetch` (URL liveness + on-page phone cross-check). Phones are **not** dialed — number match means the DB number equals the number published on the org's own live site. This is a full pass, not a sample.

| ID | Country | URL liveness | DB number vs site | Verdict |
|---|---|---|---|---|
| telefonseelsorge-de | DE | live | — (matches org) | ✅ live |
| telefonseelsorge-at | AT | live | 142 = 142 | ✅ corroborated |
| courage-beratung-at | AT | live | 01 585 69 66 = +43 1 585 69 66 | ✅ corroborated |
| lifeline-au | AU | live | 13 11 14 = 13 11 14 | ✅ corroborated |
| qlife-au | AU | live | 1800 184 527 = 1800 184 527 | ✅ corroborated |
| dargebotene-hand-ch | CH | live | 143 = 143 | ✅ corroborated |
| nummer-gegen-kummer-de | DE | live | 116 111 = 116 111 | ✅ corroborated |
| hilfetelefon-gewalt-frauen-de | DE | live | 08000 116 016 = 116 016 | ✅ corroborated |
| samaritans-uk | GB | live | 116 123 = 116 123 | ✅ corroborated |
| lgbt-helpline-ie | IE | live | 1800 929 539 = 1800 929 539 | ✅ corroborated |
| switchboard-nl | NL | live | 020 623 6565 = 020-6236565 | ✅ corroborated |
| 988-us | US | live | 988 = 988 | ✅ corroborated |
| trans-lifeline-us | US | live | 1-877-565-8860 = 877-565-8860 | ✅ corroborated |
| trevor-project-us | US | live | — (matches org) | ✅ live |
| **lgbt-youthline-ca** | CA | live | **DB 1-800-268-9688 ≠ site 1-888-687-9688** (+ text 647-694-4275) | 🔴 **wrong number** (C-3) |
| **trans-telefonberatung-de** | DE | **ECONNREFUSED** (tgns.de) | dead host | 🔴 **dead URL** (C-3) |
| **mindline-trans-uk** | GB | **404** (bristolmind deep link) | dead path | 🔴 **dead URL** (C-3) |
| **bzga-aids-beratung-de** | DE | **301 → liebesleben.de → 404** | dead via redirect | 🔴 **dead URL** (C-3) |
| **du-bist-du-ch** | CH | **TLS cert altname invalid** | no phone (referral) | 🟠 TLS-invalid (H-2) |
| lsvd-beratung-de | DE | live | DB 030 789541-77 vs site 030-78954778 / 0221 925961-0 | 🟡 number differs — verify (M-10) |
| tgns-ch | CH | live | no number on page | ⚪ org live, number not corroborated |
| sos-homophobie-fr | FR | live | no number on page (chat/listening) | ⚪ org live, number not corroborated |
| iglyo | INT | **301** iglyo.com → iglyo.org | referral, no phone | 🟡 link-rot (M-11) |
| ilga-directory | INT | 403 (bot-block) | referral, no phone | ⚪ inconclusive |
| switchboard-lgbt-uk | GB | 403 (bot-block) | could not verify | ⚪ inconclusive |

**Tally:** 14 fully corroborated · 4 dead/wrong (Critical) · 1 TLS-invalid · 2 link-rot/number-diff · 2 live-but-uncorroborated · 2 inconclusive (bot-block, *not* confirmed dead).

---

## 3. Findings register

> Assertions are portable: `SQL` = release-gate `SELECT` that must return 0; `GE` = Great-Expectations-style; `dbt` = dbt test. Prevalence queries are reproducible against prod.

| ID | Entity | Field(s) | Dimension | Sev | Description | Evidence (redacted) | Prev. | Root-cause hypothesis | Remediation | Proposed assertion |
|---|---|---|---|---|---|---|---|---|---|---|
| **C-1** | hotlines | `verified_at` | Safety/Vetting | **Critical** | Zero hotlines carry a verification date; "vetted" is asserted on a crisis page with no freshness backing. | `SELECT count(*) FILTER (WHERE NOT(hl?'verified_at'))` over `body_json->'hotlines'` = **25/25** | 100% | Seed migration never set `verified_at`; no re-verification job. | Backfill `verified_at`+`verified_by` after manual re-check of all 25; add 90-day staleness job + admin reminder. | `SQL`: every hotline has `verified_at` within 90d → gate. |
| **C-2** | personalities | `lgbti_connection`, `visibility`, `is_living` | Safety/Outing | **Critical** | 5,096 living, public people carry assigned identity string "Gay adult performer"; 2,106 lack Wikidata provenance (misID risk). Identity asserted as DB fact without consent. | `count(*) FILTER (WHERE lgbti_connection='Gay adult performer' AND visibility='public' AND is_living)` = **5,096**; `…AND wikidata_qid IS NULL` = **2,106** | 41% of people | Bulk import from an adult-content source wrote a sexual-identity label into the connection field; no consent gate. | Demote to `draft` pending provenance review; require Wikidata/self-ID anchor before public; replace free-text with controlled, source-cited vocab. | `SQL`: `lgbti_connection IN (controlled_vocab)` AND no public-living record without a provenance anchor. |
| **C-3** | hotlines | `url`,`phone` | Accuracy/Safety | **Critical** | Active verification: ~5/25 hotlines have broken/wrong contact. A dead or wrong crisis line is the headline harm of the whole platform. | `trans-telefonberatung-de` ECONNREFUSED; `mindline-trans-uk` 404; `bzga-aids-beratung-de` 301→404; `lgbt-youthline-ca` DB `1-800-268-9688` ≠ site `1-888-687-9688`; `du-bist-du-ch` TLS-invalid | 5/25 (20%) | Static seed, no liveness/number re-check; orgs moved URLs / changed numbers. | Correct the 5 now (update URL + number from each org's live site); add URL-liveness + number re-check to the 90-day verification job. | `GE`: every hotline URL returns TLS-valid 2xx, no dead host; number present. |
| **H-1** | hotlines | `phone`,`channels` | Completeness/Safety | High | 3 crisis-page entries have no phone and no channel — only a website. | ids: `ilga-directory`, `iglyo`, `du-bist-du-ch` | 3/25 | Referral orgs mixed into the dial-now list. | Separate "directories" from "call-now" hotlines in the UI, or add a reachable channel. | `SQL`: every `topics`⊇crisis hotline has ≥1 phone/channel. |
| **H-2** | hotlines | `url` | Validity | High | `du-bist-du.ch` returns TLS cert altname-invalid in-sample (browser security warning). `switchboard.lgbt` returned 403 (bot-block — *could not verify*, not confirmed dead). | WebFetch 2026-06-05: `https://www.du-bist-du.ch` → ERR_TLS_CERT_ALTNAME_INVALID | 1 confirmed of 6 sampled | Cert covers apex not `www`. | Fix linked host / use apex; add URL-liveness to the 90-day hotline check. | `GE`: hotline URLs return TLS-valid 2xx/3xx. |
| **H-3** | venues | `closed_at` | Consistency/Safety | High | No venue is marked closed; the closure signal that should suppress "safe-space" listings writes nothing. | `count(*) FILTER (WHERE closed_at IS NOT NULL)` = **0 / 23,188** | 100% | Venue Truth Engine closure voter not running/promoting to `closed_at`. | Wire closure consensus → `closed_at`; suppress closed from public surfaces. | `SQL`: closed-signal venues set `closed_at`; closed never `seo_indexable`. |
| **H-4** | venues | `url_status` | Validity/Timeliness | High | Among 921 venues ever URL-checked, 239 (26%) are `broken`; 22,267 (96%) never checked. | `url_status='broken'`=239; `<never_checked>`=22,267 | 26% of checked | Link-checker coverage ~4%; backlog. | Run link-checker to full coverage; demote broken; recheck cadence. | `GE`: `url_checked_at` within 90d for ≥90% of live venues. |
| **H-5** | personalities | `lgbti_connection` | Inclusivity/Taxonomy | High | Field is uncontrolled free text — 3 distinct values incl. NULL; documented vocab (community_member/ally/activist/…) not enforced. | distinct = `Gay adult performer`, `lgbtq_listed_source`, NULL | 100% | No CHECK/enum; classifier never ran at scale. | Introduce enum + migration mapping; re-derive from cited sources. | `SQL`/CHECK: `lgbti_connection IN (controlled set)`. |
| M-1 | marketplace | `community_owned_tags` | Completeness | Medium | Queer-owned provenance — a core value prop — is empty for every listing. | `array_length(community_owned_tags,1)>0` = **0 / 6,532** | 100% | Tagging step never implemented in pipeline. | Populate from merchant registry / relevance gate; show "provenance unknown" honestly. | `GE`: ≥X% of listings carry a provenance tag. |
| M-2 | marketplace | `link_health` | Timeliness | Medium | All listings `unchecked`; "0 broken" reflects *no check*, not health. | `link_health='unchecked'` = **6,532 / 6,532** | 100% | `marketplace-link-checker` not run. | Enable weekly checker; expose last-checked. | `SQL`: `unchecked` share < threshold. |
| M-3 | events | `timezone`,`venue_id`,`liveness_status` | Completeness | Medium | 82% no tz (open-now incorrect), 97% no venue, 98% liveness-unknown. | 2,729 / 3,197 / 3,238 of 3,307 | 82–98% | Sources omit tz/venue; liveness checker thin. | Derive tz from coords; resolve venue; expand liveness checks. | `GE`: tz non-null ≥90% for upcoming events. |
| M-4 | news | `country_ids`,`author`,`content` | Completeness | Medium | 98% no geo, 42% thin, 12% no author. | 16,415 / 7,015 / 2,017 of 16,752 | 12–98% | Geo-tagger + full-text extractor not run at scale. | Backfill geo + full-text enrichment (P0 already shipped per roadmap). | `GE`: geo-tag coverage ≥X%. |
| M-5 | countries | `lgbt_legal_status`,`lgbt_rights_status` | Hygiene | Medium | Two human-readable legacy columns 0% populated; any surface reading them shows blank. | both = 0 / 250 | 100% | Superseded by `lgbti_*` jsonb; columns left dangling. | Drop columns or backfill from jsonb; audit read paths. | `dbt`: not_null on the column the UI actually reads. |
| M-6 | personalities | `is_living`,`death_date` | Consistency | Medium | 13 records marked living but have a death date. | `is_living AND death_date IS NOT NULL` = 13 | 0.1% | Enrichment set death_date without clearing flag. | Trigger: `death_date` set ⇒ `is_living=false`. | `SQL`/CHECK: `NOT(is_living AND death_date IS NOT NULL)`. |
| M-7 | news | `title`,`source_id` | Uniqueness/Dedup | Medium | 401 live articles share a normalized title with another live article; **125 groups span multiple sources** (syndication leakage past dedup). Title-only match overstates — cross-source 125 is the meaningful subset. | cross-source dupe groups = 125; live dupe-title articles = 401 | ~2.4% of news | Fingerprint dedup keys on title+day+source; cross-source syndication with reworded bodies escapes. | Add cross-source near-dup clustering (title trigram + published_day) to `find_duplicate_clusters('news')`. | `GE`: cross-source same-title-same-day groups < threshold. |
| M-8 | venues | `latitude`/`longitude`,`country_id` | Consistency/Referential | Medium | 1,591 venues have coordinates but no `country_id` — geo not resolved to a country, so country-scoped safety context can't attach. | `lat/lng NOT NULL AND country_id IS NULL` = 1,591 | 6.9% | Geocode resolved point but country back-link step incomplete. | Reverse-geocode coords → `country_id`; re-run geo-link. Relates to known city/country resolution work. | `SQL`: `NOT(latitude IS NOT NULL AND country_id IS NULL)`. |
| M-9 | venues | `accessibility_attributes` | Accessibility | Medium | **0 / 23,188** venues carry structured accessibility metadata (wheelchair, gender-neutral restrooms) — an inclusion signal entirely absent. | `accessibility_attributes` empty = 23,188 | 100% | Field never populated by any source/pipeline. | Source from Google/OSM accessibility tags; surface gender-neutral-restroom flag. | `GE`: accessibility coverage ≥ X% for featured venues. |
| M-10 | hotlines | `phone` | Accuracy | Medium | `lsvd-beratung-de` DB number `030 789541-77` differs from numbers on the live site (`030-78954778`, `0221 925961-0`). | site vs DB mismatch | 1 | Number changed / wrong line stored. | Confirm correct counseling line with LSVD, update. | manual verify in 90-day job. |
| M-11 | hotlines | `url` | Validity/Timeliness | Medium | Stale-but-redirecting URLs: `iglyo` (iglyo.com→iglyo.org 301). | 301 redirect | 1 (+ bzga under C-3) | Org domain migration not reflected. | Update to final URL; flag 301s in liveness job. | `GE`: hotline URLs resolve without cross-host 301. |
| L-1 | marketplace | `price` | Validity | Low | 3 listings priced ≤ 0 while not `price_type='free'`. | `price<=0` = 3 / 6,532 | <0.1% | Source feed zero/placeholder prices. | Coerce to NULL + flag, or require `price_type='free'`. | `SQL`: `price>0 OR price_type='free'`. |
| L-2 | news/venues | `title`/`name` | Validity/Encoding | Low | Zero-width characters in text: news 35, venues 10, personalities 1 — invisible, can marginally defeat dedup/search. | regex `[U+200B-U+200D,U+FEFF]` matches | 46 rows | Copy-paste from rich sources; no Unicode normalization on ingest. | NFKC-normalize + strip zero-width on ingest. | `SQL`: text fields free of zero-width codepoints. |
| L-3 | venues | `name` | Validity/Encoding | Low | 2 venue names show mojibake (`Ã`/`â€`-style UTF-8-as-Latin1 corruption). | name regex match = 2 | <0.1% | Double-decoded encoding at a source boundary. | Re-decode from source; add mojibake detector to validate. | `GE`: names free of mojibake signatures. |
| ✓ | all | user-editable text | Adversarial/Injection | **Pass** | Strict instruction-injection scan (`ignore previous instructions`, `system prompt`, `<script>`, `javascript:`, `onerror=`) across venue/marketplace/personality/news text returned **1 match — a benign news article** (HTML/link residue). No genuine injection payloads. | strict matches = 1 (benign) | — | — | Keep scanner as a standing ingest check. | `SQL`: 0 strict-injection matches in user-editable fields. |
| ✓ | travel | criminalization vs score | Consistency | **Pass** | 0 criminalized-but-safe-scored; 0 death-penalty-but-mid-scored; 7 death-penalty countries corroborated (Brunei, Iran, Mauritania, Nigeria, Saudi Arabia, Uganda, Yemen). | all 0 | — | — | Keep as a standing gate. | `SQL`: `NOT((crim.legal='false') AND equality_score>=50)`. |
| ✓ | venues/people | `duplicate_of_id` | Referential | **Pass** | 0 dangling and 0 dup→dup chains (prior audit's 743-chain concern resolved). | both = 0 | — | — | Keep as gate. | `SQL`: no dangling/chained `duplicate_of_id`. |

---

## 4. Continuous monitoring suite

**Hard release gates (Critical — block deploy if any returns > 0):**
1. `hotline_unverified` — any hotline missing `verified_at` or older than 90 days. (daily)
2. `person_outing_guard` — any public, living `personalities` row whose `lgbti_connection` is outside the controlled vocab, or any public-living identity claim without a provenance anchor (`wikidata_qid`/cited source). (on write + nightly) — *currently fails for 5,773 records (the full public-living non-vocab set); the 5,096 "Gay adult performer" rows of C-2 are the largest subset.*
3. `crim_consistency` — any country with `lgbti_criminalization.legal='false'` AND `equality_score >= 50`. (nightly)
4. `dup_integrity` — any dangling or chained `duplicate_of_id` across venues/events/personalities/news. (nightly)

**High (alert, not gate):** `hotline_reachable` (every crisis hotline has ≥1 phone/channel); `hotline_url_live` (TLS-valid 2xx/3xx); `venue_closed_writeback` (closure signal ⇒ `closed_at`); `venue_url_freshness` (≥90% checked within 90d). (daily/weekly)

**Medium (weekly trend):** marketplace `link_health` unchecked share; marketplace provenance-tag coverage; events tz coverage; news geo coverage; `is_living/death_date` consistency.

Align gate codes with existing `pipeline-validate/index.ts` `E_`/`W_` conventions so they run inside the ingest path, not just CI.

---

## 5. Methodology & limitations

- **Design:** Phase 0 inventory → Phase 1 field profiling → Phase 2 dimensional + entity-specific tests → Phase 3 adversarial spot-checks, all via bounded read-only aggregates. Safety-critical entities (hotlines, travel, people, venues) audited deeply; events/news/marketplace profiled broadly per agreed scope.
- **Schema note:** the working schema map had two errors corrected against live `information_schema`: `marketplace_listings` has **no** `duplicate_of_id` (dedup keys on `payload_hash`/`source_entity_id`), and venues carry both `verified` (bool, in use) and `verification_status` (unused).
- **Could not verify (explicitly not claimed as defects):** phone connectivity (no telephony); `switchboard.lgbt` liveness (403 bot-block — inconclusive); marketplace per-link liveness (checker never ran); whether each labeled person self-identifies as labeled; representativeness of the 4% venue URL sample.
- **False-positive caveats:** the 26% venue broken-URL rate is *within the checked 4%*, not the population. The 11 "missing" countries are uninhabited territories — correctly excluded, not a coverage gap. Travel `last_updated` reflects row-write time, which may track ingestion rather than independent legal review.
- **Adversarial pass (Phase 3, completed):** strict instruction-injection scan across all venue/marketplace/personality/news user-editable text → **clean** (1 benign HTML-residue match, F-✓). No contact-PII leakage in people free-text. Encoding: 2 mojibake venue names (L-3), 46 rows with zero-width chars (L-2). Geo: coords all within valid range; Null Island held at 0; 1,591 venues coord-but-no-country (M-8). Homoglyph/Cyrillic-lookalike dedup-defeat not separately tested beyond zero-width.

---

## 6. The 3–5 checks that remove the most user-facing harm if automated tomorrow

1. **`person_outing_guard`** — gate public-living `personalities` to a controlled, provenance-anchored identity vocab. Directly removes the largest active-harm surface (5,096 living people mislabel-able today).
2. **Fix the 5 broken hotlines today (C-3)** then add `hotline_unverified` + `hotline_reachable` + `hotline_url_live` — correct `trans-telefonberatung-de`, `mindline-trans-uk`, `bzga-aids-beratung-de`, `lgbt-youthline-ca`, `du-bist-du-ch` from each org's live site, then a 90-day verification + URL-liveness + number-recheck gate on all 25. Turns the vetting promise into enforced fact on the highest-stakes page.
3. **`venue_closed_writeback`** — wire closure consensus into `closed_at` and suppress closed venues. Closes the "safe space that's actually shut" hole that is currently impossible to filter.
4. **`crim_consistency`** (standing gate) — keep the travel legal-risk model from ever drifting into "criminalizing country shown safe."
5. **`venue_url_freshness`** — drive URL-check coverage from 4% toward full, demoting broken links so users stop being sent to dead venue pages.
