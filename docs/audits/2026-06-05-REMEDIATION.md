# Trust-&-Safety Audit — Remediation Status

Companion to [2026-06-05-trust-safety-audit.md](2026-06-05-trust-safety-audit.md). Tracks what was fixed and what each remaining item physically requires. Updated 2026-06-06.

## ✅ Done

| Finding | Sev | Fix | How |
|---|---|---|---|
| C-2 / H-5 / M-6 — people outing-risk | Critical | "Gay adult performer" label removed from all 5,326 records → `lgbti_connection` now only `unclear`/NULL; **CHECK constraint** enforces controlled vocab (or NULL); **trigger** forces `is_living=false` when `death_date` set | label remap (fix session) + migration `20260606120000` |
| C-1 / C-3 / H-2 / M-11 — hotlines | Critical | **25/25 verified**; 4 broken lines corrected (YouthLine number, bzga + MindLine URLs, German line → Queer Leben); du-bist-du TLS + iglyo URL | direct prod edits, verified against each org's live site |
| crim_consistency, dup_integrity | Critical | Confirmed clean **and now gated** so they can't regress | gate RPC below |
| M-3 — event timezones | Medium | 1,302 events backfilled from single-zone country tz | migration `20260606122000` |
| M-8 — venue coord→country | Medium | 65 derived from anchored city | city-join backfill |
| L-2 zero-width / L-3 mojibake | Low | Zero-width already clean (0). **L-3 was a false positive** — `Â`/`Ã` are valid Portuguese/Vietnamese diacritics, not corruption | n/a |
| **Monitoring** (audit §4) | — | `trust_safety_gate_status()` RPC + `scripts/check-trust-safety-gates.mjs` + `.github/workflows/trust-safety-gates.yml` — PR + daily release gate, fails build if any CRITICAL gate > 0. **All 4 CRITICAL currently 0.** | migration `20260606121000` |

## ⏳ Deferred — requires a running service, external source, or code refactor

These are **not** safely finishable by SQL alone. Brute-forcing them (guessing a venue's country from a centroid, stamping "verified" without a check, fabricating a queer-owned tag) would re-introduce the exact harms the audit flags, so they are left honest-and-tracked.

| Finding | Sev | Remaining | What it needs |
|---|---|---|---|
| H-3 — venue `closed_at` | High | 0 venues marked closed | **Confirmed blocked:** FSQ `closed_bucket` only ever holds Open/Unsure (no closed signal); no `business_status='closed'` anywhere. There is genuinely no closure-signal data to promote — needs a fresh closure source (Google Places `business_status`). |
| H-4 — venue URL health | High | ~4,690 real backlog (only venues *with* a website; ~17.5k have no URL). 1,025 now checked. | `venue-url-checker` runs daily via cron (jobid 197) and is draining; triggered a batch manually (150 → 27 ok / 65 redirect / 55 broken). **Label-only — does not hide venues.** Caveat below. |
| M-8 remainder | Medium | 2,533 venues have coords but no city/country | Reverse-geocode coords→country via Photon/Nominatim, **rate-limited client-side** (see `queerguide_pgnet_bulk_geocode` — pg_net bursts trip 503s). |
| M-2 — marketplace link health | Medium | Draining via fixed checker; genuine 404s (ohmyfantasy/supergay deleted products) deactivated, bot-walled sites (misterb 429) correctly left active | ✅ **RESOLVED** — checker fixed (404/410-only), cron 198 re-enabled. See incident below. |
| M-1 — marketplace provenance | Medium | `community_owned_tags` 0% populated | Source queer-owned provenance from the merchant registry / relevance gate; until then surface "provenance unknown" rather than an unbacked claim. |
| M-9 — venue accessibility | Medium | `accessibility_attributes` 100% empty | Source wheelchair / gender-neutral-restroom tags from Google/OSM in venue ingestion. Cannot be fabricated. |
| M-4 — news geo | Medium | 10,726 (was 16,415) lack geo | **Auto-progressing** via `pipeline-enrich-news`; let the pipeline continue. |
| M-5 — dead country columns | Medium | `lgbt_legal_status` / `lgbt_rights_status` 0% populated but **57 code refs** (incl. `src/lib/lgbtLegality.ts`, Admin pages) | Code refactor to remove read paths before dropping. Cosmetic — low priority. |
| H-1 — hotline referral orgs | High→info | 3 entries (ILGA, IGLYO, du-bist-du) have no call channel | UI change: render "directories/resources" separately from call-now hotlines. Tracked by the `hotline_unreachable` HIGH gate (=3). |

## ⚠ Incident & bug found while driving the checkers (2026-06-06)

**Both link checkers misclassify soft failures (HTTP 429/403/405) as `broken`.** The HEAD-based `venue-url-checker` and `marketplace-link-checker` treat any non-2xx/3xx response as broken — but affiliate/e-commerce sites routinely rate-limit (429) or block HEAD/bots (403/405). This produces false "broken" verdicts.

- **`marketplace-link-checker` also deactivates on a single failure** (`link_health='broken'` → `status='inactive'`), which *hides the listing*. A manual batch of 150 marked 100 "broken"; verification showed **86 were false** — all from `www.misterb.com`, which returns **429 (rate-limited)**, not dead (Mister B is a live, well-known queer retailer). Only 14 were genuinely gone (ohmyfantasy/supergay, confirmed 404 on GET).
- **Action taken:** reverted the 86 false deactivations to `active`/`unchecked`; the 14 real 404s stay `inactive` (correct). **Paused the `marketplace-link-checker` cron (jobid 198, `active=false`)** to stop the nightly run from re-hiding legitimate queer-owned listings. Restore with `cron.alter_job(198, active := true)` **after** the fix.
- **✅ RESOLVED.** Both functions were repaired (shared `_shared/link-health.ts`): only an explicit **404/410** is `broken`; **401/403/405/429** → `blocked` (alive); network errors → `timeout`; HEAD falls back to GET to confirm. `isDeadLink` (the only thing that deactivates a listing / sets `needs_attention`) is true **only** for `broken`. Verified live: a 200-listing batch deactivated only genuinely-deleted products (ohmyfantasy/supergay 404s) while leaving misterb.com (429) active. **Cron 198 re-enabled** (`cron.alter_job(198, active := true)`). Deployed versions: marketplace-link-checker v31, venue-url-checker v36.

## Current gate readout

```
✓ [critical] hotline_unverified   = 0
✓ [critical] person_outing_guard  = 0
✓ [critical] crim_consistency     = 0
✓ [critical] dup_integrity        = 0
⚠ [high]     hotline_unreachable  = 3   (H-1, referral orgs — UI separation)
✓ [high]     hotline_link_broken  = 0
```

Re-run anytime: `SELECT * FROM trust_safety_gate_status();` or the CI job **Trust & Safety Gates**.

## Bottom line
All **safety-critical** harms are closed and now guarded against regression. Everything deferred is completeness/hygiene that depends on a worker run, an external data source, or a code refactor — none can be honestly completed from a SQL session without re-introducing risk.
