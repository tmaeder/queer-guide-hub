# Mobile startup and news image follow-up

Baseline: production mobile PageSpeed 88 (report xnkuxhm16g), FCP 2.85s,
LCP 3.08s, TBT 124ms, CLS 0. Target: above 90 on a fresh production report.

## Changes

- Separate React's map-only server renderers from browser React. Explicit group
  priorities keep shared React primitives in vendor. The bundle guard rejects
  any react-server static edge from startup; no limits were raised.
- Cookie banner entrance uses CSS with reduced-motion support. Cookie preferences
  and contribution forms load on first interaction instead of startup. Consent
  actions, footer reopening and capture-before-dialog behavior are retained.
- News cards and story collections use only first-party photography. Existing
  image_assets triggers plus the image-ingest cron supply R2 mirrors; pending or
  failed lookups display existing local editorial fallbacks rather than briefly
  hotlinking publishers. Story collections now batch-fetch their mirror records.
  Original source URLs and attribution remain unchanged in the database.

## Local evidence

- Build, lint, typecheck ratchet and bundle guard pass. Entry closure drops from
  1685KB to 1485KB raw; React server renderers are a separate 199KB lazy chunk.
- 66 focused unit/component tests pass, including publisher-to-mirror transition,
  first-party URL boundary, consent actions and reopening preferences.
- 12 homepage/news/consent/contribution checks passed on the first build.
  Final bundle rerun: six public checks plus the map control pass (7 total).
- Comparable local Lighthouse simulations improve LCP from 6.04s (prior release)
  to 5.39s. Local score 75 is not a substitute for the official production run;
  the earlier local 74 corresponded to official PageSpeed 88. Production report
  and post-deploy E2E evidence must be recorded after deployment.
