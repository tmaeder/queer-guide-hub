# Email delivery recovery

Cloudflare is the sole sending provider. Campaign approval and audience collection do not authorize promotional delivery.

## Receipt inspection

Copy a message ID from Admin → Email → Delivery, then use Operations → Inspect receipt. The backend reads the persisted Durable Object receipt over authenticated GET. It never calls submit or the provider. Accepted receipts can be stitched to earlier lifecycle events; missing or uncertain receipts leave the message unchanged. Active leases and erased/retained records cannot be overridden. Never create a fresh identity to resolve an uncertain outcome.

Terminal messages preserve their opaque identity/provider receipt after body retention. The database policy defaults to 90 days, permits 30–365, and each tick redacts at most 500 eligible bodies and removes at most 500 tokens expired for seven days. Queued/processing/uncertain evidence, suppression and consent remain. Provider logs and mailbox copies have a separate lifecycle. Durable Objects retain only the fingerprint and outcome; do not delete receipts while a caller can replay an identity.

## Event queue recovery

`queer-guide-email-events` retries ingestion ten times before routing to `queer-guide-email-events-dlq`. An unconsumed DLQ defaults to four days of retention, so inspect promptly. Read depth and oldest age in Admin → Email → Operations or Cloudflare; database unmatched-event counts do not establish queue depth. Operations uses authenticated native queue metrics. Counts are best-effort snapshots; unavailable is not zero, and a positive backlog without a timestamp has unknown age. [Cloudflare DLQ documentation](https://developers.cloudflare.com/queues/configuration/dead-letter-queues/).

1. Restore receiver availability and authentication first. A 401/503 does not justify weakening verification.
2. Preserve the native event identity, provider ID, recipient and occurrence time. Keep any forensic copy in an access-controlled incident location, never Git or public logs.
3. Configure a recovery consumer on the DLQ using the same authenticated event-ingestion handler. This Worker's handler is queue-name-independent. Check current Wrangler `queues consumer add --help` and `remove --help` before operating. Preserve failed events for investigation before retention expires; do not purge them to clear an alert.
4. Acknowledge only after receiver success. Identical events deduplicate in `email_record_event` without sending email. Verify delivery state/suppression and remove a temporary recovery consumer.

The synthetic recovery contract tests 503 → retry → 200 → ack and duplicate replay. It does not prove a live DLQ drain or native event correlation. Those require an actual event and an expressly authorized test recipient.

## Restore boundaries

Restore application state and Durable Object receipts as a coordinated incident. A database-only restore can move the outbox behind the provider. Hold dispatch until receipt reconciliation; preserve current cancellation, erasure and suppression when evaluating an older snapshot. A backup predating erasure must not silently recreate erased data. Use the existing outbox automation switch for the incident; do not remove transport gates.

A disposable PostgreSQL 17 dump/restore rehearsal on 2026-10-21 retained an uncertain message's immutable identity and returned the same row on replay, without claiming or sending. A fresh-object contract tests retention of the pre-submission uncertain receipt after a simulated post-acceptance receipt-write interruption. Production provider storage restoration and inbox placement remain unverified.

## Capacity evidence

The isolated PostgreSQL fixture collects 10,000 contacts in eleven batches, enforces at most 1,000 per batch even when callers request more, verifies replay cannot duplicate membership, and creates no delivery work. Development-machine collection took approximately 0.69 seconds; this is not a production throughput promise. Health reports observed 30-day states and latency percentiles; missing evidence remains null.

## Worker runtime boundary

The 2026-10-25 production investigation preserved two native dead-letter envelopes and verified their authenticated receiver ingestion. The queue consumer used `redirect: "error"`; workerd rejects that mode before sending a request. Use `redirect: "manual"`, then retry every non-2xx response. Never follow a redirect carrying the receiver secret. Node fetch mocks accept more redirect modes, so a passing mocked request alone does not establish production compatibility. See [Cloudflare Request runtime documentation](https://developers.cloudflare.com/workers/runtime-apis/request/).

Native queue bodies may be decoded JSON or JSON text. Normalize once, retain the bounded native envelope, and leave malformed messages unacknowledged for investigation. Diagnostics contain only a status code or a generic transport failure, never payloads, recipient addresses or secrets.

The gateway’s protected `GET /queues/metrics` reads the existing `EVENT_QUEUE` and `EVENT_DLQ` bindings. The admin function enriches its existing health response; if either queue fails, that reading remains unavailable independently. This route cannot send or recover mail. Recovery still requires the deliberate consumer procedure above and removal of the temporary consumer afterward.

A direct local workerd probe (bundled runtime compatibility 2026-10-19) reproduced the pre-network redirect error; the same unauthenticated GET with manual redirects reached the existing gateway and returned its expected 401. This is runtime evidence in addition to Node mocks, not a substitute for the release’s live queue drain. Production compatibility settings are unchanged.
