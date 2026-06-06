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
| H-3 — venue `closed_at` | High | 0 venues marked closed | Promote Venue Truth Engine closure consensus (`business_status` + `url_status` 404/410 votes) into `closed_at`. No reliable closure-signal data exists to write safely yet — run the consensus/closure sweep. |
| H-4 — venue URL health | High | 22,267 (96%) never checked; 239 known broken | Run the venue URL-checker (HTTP at scale) to coverage; demote `url_status='broken'`. Cannot issue 22k requests from here. |
| M-8 remainder | Medium | 2,533 venues have coords but no city/country | Reverse-geocode coords→country via Photon/Nominatim, **rate-limited client-side** (see `queerguide_pgnet_bulk_geocode` — pg_net bursts trip 503s). |
| M-2 — marketplace link health | Medium | 6,532 (100%) `unchecked` | Run the `marketplace-link-checker` worker (weekly cron). |
| M-1 — marketplace provenance | Medium | `community_owned_tags` 0% populated | Source queer-owned provenance from the merchant registry / relevance gate; until then surface "provenance unknown" rather than an unbacked claim. |
| M-9 — venue accessibility | Medium | `accessibility_attributes` 100% empty | Source wheelchair / gender-neutral-restroom tags from Google/OSM in venue ingestion. Cannot be fabricated. |
| M-4 — news geo | Medium | 10,726 (was 16,415) lack geo | **Auto-progressing** via `pipeline-enrich-news`; let the pipeline continue. |
| M-5 — dead country columns | Medium | `lgbt_legal_status` / `lgbt_rights_status` 0% populated but **57 code refs** (incl. `src/lib/lgbtLegality.ts`, Admin pages) | Code refactor to remove read paths before dropping. Cosmetic — low priority. |
| H-1 — hotline referral orgs | High→info | 3 entries (ILGA, IGLYO, du-bist-du) have no call channel | UI change: render "directories/resources" separately from call-now hotlines. Tracked by the `hotline_unreachable` HIGH gate (=3). |

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
