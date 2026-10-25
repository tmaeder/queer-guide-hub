# Automated taxonomy persistence regression coverage

The production audit covered 53 families, but those results are not a repeatable gate. Add one real-browser create/edit/reload/cleanup test for each of the 15 dictionary families and 38 classification families advertised by the taxonomy catalog. The generic classifications workspace is a shared entry point, not a 54th family.

Use the local Supabase snapshot already provisioned by the PR critical-path workflow. A dedicated Playwright configuration must reject remote frontend, API and database URLs before authentication. The production nightly configuration must exclude the mutation spec. Mocked requests would miss database constraints and production writes would make retries unsafe, so neither is appropriate here.

Each test owns a unique name prefix, creates through the UI, verifies the saved record after a full reload, edits through the UI, reloads and reopens it, and verifies the changes. Cover required stable keys, structured reference metadata, intimate-category parent selection and the tag `unverified` regression. No existing vocabulary record may be edited. Parent fixtures must be owned by the same test.

Automatic fixture teardown runs even after assertions or save-response failures. It removes only owned rows and CMS metadata in the isolated database, restores the taxonomy deletion guard in the same locked transaction, and asserts absence afterward. Retain normal audit history. Never install a cleanup RPC or relax production guards.

Run this suite as a separate step of the existing local-backend CI job. Preserve screenshots/traces and a machine-readable report. Validate endpoint refusal and case coverage locally, collect all 53 tests, then run the complete browser suite in CI against the real snapshot.
