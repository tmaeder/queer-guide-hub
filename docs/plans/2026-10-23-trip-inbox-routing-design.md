# Automatic trip inbox routing

Approved by the user on 2026-10-23.

Keep `trip-<random>@inbox.queer.guide`. Cloudflare requires a literal routing rule for each subdomain recipient. An authenticated `trip-inbox-manage` Edge Function checks trip edit permission, creates a server-generated inbox, provisions its exact recipient rule to `queer-guide-worker-trip-inbox`, then marks it ready. The browser only displays ready addresses. Retries reuse the same inbox and rule; provider failures do not produce usable-looking addresses. A partial unique index prevents concurrent enables from creating multiple active inboxes. Direct browser mutations are removed to enforce this path.

Revocation is persisted first so the receiving Worker immediately stops accepting that address, then its exact Worker rule is removed. Regeneration revokes and provisions a fresh random address. Reconciliation is admin-only and repairs active rows and removes revoked inbox rules, preserving unrelated routing rules. Failed cleanup is retriable. Existing active rows are backfilled before frontend rollout. The default Cloudflare limit is 200 rules per domain; capacity errors fail closed.

Use existing server-only Cloudflare configuration, with an optional dedicated Email Routing token override. No Cloudflare credentials reach the browser. Deploy the schema and endpoint before the frontend. Verify authorization, idempotency, failures, revoke/regenerate, and a fresh inbox through the production creation endpoint, real email receipt, ciphertext storage, and authenticated live decryption. Retain synthetic evidence and revoke the test inbox afterward.
