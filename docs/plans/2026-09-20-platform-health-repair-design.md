# Platform health repair design

## Scope

Repair the actionable Supabase and Cloudflare failures found during the
2026-09-20 production audit without weakening authentication or deploying an
email worker without its required mailbox secret.

## Findings

- Cloudflare Pages is deploying successfully and active Workers reported zero
  uncaught runtime errors in the preceding 24 hours.
- The `Deploy workers` workflow is red because `scripts/smoke.sh` still expects
  a cookie-less `/track` request to write. The endpoint now intentionally
  requires a signed session-cookie round trip.
- `sync-supabase-advisors` is ACTIVE, but its stored
  `MANAGEMENT_ACCESS_TOKEN` is rejected by the Management API. The repository's
  GitHub Actions secret remains valid because current Supabase deploys succeed.
- `queer-guide-worker-team-inbox` is absent from Cloudflare and the required
  `STALWART_MAILBOX_PASSWORDS` secret is not available in the repository or
  GitHub Actions. Deploying it without that secret would silently drop mail.
- The live pipeline-health check reports recovered-but-disabled automations,
  a missing `news_podcast_signals` RPC, one impossible city population,
  duplicate page-view telemetry, five glossary spelling violations, and 78
  news rows stranded without a quality verdict.

## Approved approach

1. Update the Worker smoke test to bootstrap the signed session cookie and then
   verify the authenticated `/track` write.
2. Add an explicit maintenance input to the existing Supabase deployment
   workflow. Only when that input is selected, copy the already-valid GitHub
   `SUPABASE_ACCESS_TOKEN` into the Edge Function secret
   `MANAGEMENT_ACCESS_TOKEN`. Do not rewrite the secret on every deployment.
3. Re-run the advisor synchronizer and inspect the resulting live findings.
4. Repair database-health findings through guarded, auditable migrations and
   verify them against production. Reuse already-merged repair migrations where
   they exist instead of creating competing definitions.
5. Do not deploy `team-inbox` until `STALWART_MAILBOX_PASSWORDS` is available;
   report that operational prerequisite explicitly.

## Verification

- `bash -n scripts/smoke.sh` and the live smoke test pass.
- The Supabase maintenance dispatch succeeds and the advisor function returns
  HTTP 200.
- The relevant migration/deployment workflow succeeds.
- The live pipeline-health check no longer reports the repaired hard failures,
  or any remaining hard failures are documented with their exact blocker.
- Cloudflare Worker telemetry remains free of uncaught exceptions.

