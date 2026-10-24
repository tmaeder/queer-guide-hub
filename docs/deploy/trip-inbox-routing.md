# Trip inbox address lifecycle

`trip-inbox-manage` provisions one exact Cloudflare Email Routing rule for every active `trip-<short_id>@inbox.queer.guide` address. Subdomains have no catch-all support. Existing apex routing is independent and must not be changed.

## Server configuration

Configure a Cloudflare API token with **Email Routing Rules: Edit**, limited to the `queer.guide` zone, as Supabase secret `TRIP_INBOX_ROUTING_API_TOKEN`. The existing server-only `CLOUDFLARE_API_TOKEN` is a fallback. `CLOUDFLARE_ZONE_ID` defaults to the project's known zone. Never expose these values to the frontend. The `inbox` subdomain must already be onboarded for routing with its MX records present.

## Deployment

1. Apply `99991792821465_trip_inbox_routing.sql`.
2. Deploy `trip-inbox-manage` with JWT verification enabled. The function also validates the user and checks `can_edit_trip` for lifecycle calls. Only admins/internal service callers may run `status` or `reconcile`.
3. Invoke `{ "action": "status" }` as an admin to verify provider access. Invoke `{ "action": "reconcile" }` and require `success: true` before frontend rollout. It backfills active inboxes and removes rules for revoked inboxes. Re-running is safe. Check each result; retry failed rows before advertising addresses.
4. Deploy the app. `useTripInbox` uses the authenticated endpoint for enable/revoke/regenerate, and displays only `routing_status = ready` inboxes.

A failed provision keeps a pending/failed row for retry, without advertising it. A unique partial index makes repeated/concurrent enables reuse the active inbox. If a rule already points elsewhere, provisioning reports a conflict rather than overwriting it. On revocation, the receiving Worker immediately rejects the address through its database lookup, even if external rule cleanup fails. Reconcile again to retry cleanup. Rule deletion is restricted to the exact recipient and expected Worker destination.

Cloudflare defaults to 200 routing rules per domain. Provider capacity failures surface as failed creation, never as a working address. Request a limit increase before approaching capacity; revocation/regeneration removes old rules. Run admin reconciliation after an interrupted lifecycle operation or provider outage.

## Production verification

Use a new private synthetic trip. Enable its inbox through the same authenticated production endpoint the app uses; verify `ready` and a provider rule ID. Re-enable to verify idempotency, regenerate to verify replacement, and send a clearly marked synthetic non-booking email to the returned address. Check stored ciphertext, absence of the unique token in extracted fields, and recovery of the token through authenticated `trip-inbox-chat` without including the token in the question. Revoke the temporary inbox via the endpoint, verify the old rule is gone, and retain the private fixture for inspection.
