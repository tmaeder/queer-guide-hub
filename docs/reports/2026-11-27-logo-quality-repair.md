# Logo repair and prevention — 27 November 2026

The repair and the new enrichment mechanism are deployed to production. The audit completed with no pending, processing, or retry jobs. All known denied marks were absent in the final database check.

## Results

| Entity | Audited | Verified replacements | Already verified | Needs review | Merged aliases |
| --- | ---: | ---: | ---: | ---: | ---: |
| Venues | 11,303 | 850 | 0 | 10,413 | 40 |
| Organizations | 5,630 | 376 | 0 | 5,254 | 0 |
| Events | 220 | 4 | 0 | 216 | 0 |
| Marketplace brands | 516 | 39 | 10 | 467 | 0 |
| **Total** | **17,669** | **1,269** | **10** | **16,350** | **40** |

412 confirmed incorrect logo assignments were removed, including 38 on aliases subsequently identified as merged. This removal count overlaps the audit outcomes above. Examples include Google, HelloAsso, Wikipedia, WordPress, Jimdo, FC2, DISH, stock house/cube/pencil/layout icons, blank images, and shared decorative rainbow flags. Legitimate customer assets hosted on Wix, WordPress, Shopify, and other CDNs remain eligible.

The 16,350 open cases are visible in the [general Review queue](https://queer.guide/admin/governance?mode=triage&queue=general-review). They include low-resolution originals, uncertain identities or replacements, and unavailable qualified sources. Their current image, available candidate, website, source evidence, dimensions, and reason are retained. Existing uncertain images have not been replaced automatically. Known wrong marks were removed. Obsolete cases on merged aliases were closed.

## Enrichment and prevention

- Prefer an entity's own declared JSON-LD logo or corroborated header logo. A listing-page title alone cannot establish the identity of its publisher's masthead.
- Unwrap Google Translate website links; distinguish platform identities from customer assets on shared hosting.
- Inspect actual raster dimensions, reject tiny/blank/invalid images, check contrast, validate static SVGs, and prefer larger responsive originals from `srcset`. Request provider candidates at 512 pixels, but keep provider-only and icon-only identities in review. Enlarging a thumbnail is not treated as restored detail.
- Hold unchecked automated logo imports before publication. Known denied marks are blocked even on manual writes. Explicit administrator edits remain possible.
- Use one shared checking path for venues, events, organizations, and brands, with content-addressed mirrors and provenance.
- Recheck changes to names, websites, and logo URLs. Verified assets become eligible for another check after 90 days. Application cron drains bounded batches every five minutes; expired and exhausted leases cannot strand records indefinitely.
- Apply repairs with lease and current-value checks. Intervening edits, deleted records, and merged aliases supersede stale work.

## Verification and rollback

55 unit checks passed: 14 logo-quality scenarios plus 41 existing platform, site-icon, and PNG tests. Both edge entrypoints passed Deno type checking. Live SQL integration checks passed inside rolled-back transactions, covering access restrictions, import staging, denied marks, stale leases, exhausted leases, intervening edits, and merged aliases. An unauthenticated repair request returned HTTP 401. Production enrichment returned HTTP 200 after the final deployment.

Previous URLs and repair evidence are retained in `public.logo_quality_history`; worklist snapshots and candidate provenance are in `public.logo_quality_jobs`. Existing content revisions provide another record of entity changes. Any rollback should first compare the current URL with that history row's replacement URL so a later editor change is preserved.

Source is isolated on `fix/logo-quality-repair-20261127`. Parser-only `broken-image` hook findings were false positives; the narrow file-scoped ignore is recorded in `.impeccable/config.json`. No actual UI image defect was suppressed or left standing.
