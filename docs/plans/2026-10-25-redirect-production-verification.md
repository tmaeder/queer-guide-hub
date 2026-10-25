# Redirects production verification — 2026-10-25

This checkpoint records observed production behavior. It does not close the
remaining workspace activation/transfer or native provider/device requirements
in the Dub parity ledger.

## Browser and HTTP evidence

The authenticated production inventory displayed more than 20,000 redirects,
including automatic aliases, static rules and client routes. Created the clearly
named `e2e-redirects-20261025` tracked link in the production editor with a
destination query, fragment, UTM source/medium/campaign and a prefill parameter.

| Check | Observed result |
| --- | --- |
| Create and search | The new managed link appeared as one matching inventory row. |
| Routing | HTTP 302 retained the existing query, prefill, all three UTM values and fragment. |
| Browser navigation | The real browser reached the intended About page with those values. |
| Browser-generated QR | Independently decoded the actual 1024px PNG to the tracked URL with `qg_qr=1`. |
| Tracking | The UI recorded two visits and split them into one link click and one QR click. |
| Hosted publication | The editor published a test image and later displayed its independently verified hosted preview and image URLs. |
| Hosted output | Actual production PNG, JPG and SVG each returned 200 with `X-QG-QR-Verified: 1`; independent pixel decoding matched the exact tracked URL. |
| No image click inflation | The database still held exactly two visits after previews and all format retrievals. |
| Revocation | Revoked the temporary image through the editor; its published URL then returned 404. |
| Anonymous private API reads | `/api/redirects/links` and `/api/redirects/inventory` returned 401. |

Screenshot and raster evidence is retained locally in
`outputs/redirects-production-20261025/`; private admin screenshots are not
committed to the repository. Clipboard actions were denied by the browser session
and are not counted as a successful clipboard test.

## Defects found and corrected

The QR Worker was absent and Pages had no image-service binding. Deployed the
private `qg-redirect-qr` Worker using only the application's public Supabase
configuration, verified its rate-limit namespace was unused across 27 existing
Workers, and added the production Pages service binding. All other production
and preview settings were verified unchanged. Pages was redeployed afterward.

The first Worker version was `900e62d2-f9fb-43b1-a9a8-e481cdf91137`. Production
profile retrieval then exposed Workers' rejection of fetch `redirect: "error"`.
The corrected version `3d629a27-c807-4cf4-86a4-18af72ee0111` uses manual redirect
handling for fixed-origin profiles and logos, rejecting redirects without
following them. Production hosted-image checks above passed on that version.
The new QR workflow keeps subsequent renderer updates deployed from main.

Analytics also showed corrupted Unicode geography. Both gateways now transmit
city/region/continent through bounded, explicitly encoded ASCII headers; the
resolver decodes them before recording. Legacy ASCII forwarding stays compatible
during rollout. Post-merge deployment verification is still required for this
geography change. Existing recorded values are not rewritten.

## Code and integration evidence

52 focused geography/gateway/resolver/analytics tests and 39 QR/profile/proxy
tests passed locally. The actual root/native gateway → resolver → isolated
PostgreSQL suite passed, as did all five real SDK runtimes and their HTTP
integration matrix. Edge handler and both Worker type checks passed. The old
standalone QR harness hit its ten-second startup gate on this host; its timeout
was not changed. A running real workerd instance independently rendered and
scanned PNG/JPG/SVG successfully, and the new QR workflow passed its native
runtime checks in CI.

Recovered three applied migration files from production's recorded statements
to clear CI history drift, comparing all three statement-body SHA-256 digests.
Main independently recovered the same files during this work; the merge retains
main's canonical versions. No migration was renamed or reapplied by this test.

The temporary hosted capability is revoked. The managed test redirect is retained
for the post-deployment geography check, after which it should be disabled and
archived rather than permanently deleted.

## Scheduled worker configuration

All six Redirects schedules were active and reported successful database runs,
but the five HTTP schedules silently selected no rows: Vault had the existing
`internal_invoke_secret` and no `supabase_url`. Read-only inspection confirmed
that only these five Redirects jobs depended on that URL. Under table locks,
rechecked that the mail, domain, webhook and asset queues were empty, then added
the public project API URL without reading or changing the invocation secret.

Guarded empty-queue probes used the same Vault-backed HTTP transport. Responses
136547–136551 all returned HTTP200 without timeouts: access notifications and
QR cleanup reported configured, webhook dispatch claimed no deliveries, and
domain provisioning/instruction mail reported unconfigured. No email, provider
hostname or external webhook was submitted. This proves dispatch reachability,
not delivery/provider readiness. The available Cloudflare OAuth connection can
read the active Queer Guide zone but returns403 for SaaS fallback-origin settings;
a dedicated zone-scoped SaaS configuration remains required.
