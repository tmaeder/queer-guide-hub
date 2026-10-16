# Native DNS instruction forwarding

The approved custom-domain parity scope includes emailing exact DNS instructions
to the person who manages a domain. Implement the native send/delivery path;
manual copy, mailto or export alone cannot satisfy it. Extend the existing owner
Custom domains surface and email infrastructure without a new visual system.

The owner opens a current server-generated draft, reviews the exact CNAME,
ownership TXT and applicable saved provider TXT records, enters one recipient,
and submits Email these DNS records. The API accepts a current domain version,
record snapshot digest and a client request UUID. It never accepts caller-chosen
record values, callbacks, sender or custom email content. Repeating an identical
request UUID returns its existing receipt; changing its content conflicts.
Unconfigured delivery has an explanation and leaves manual instructions usable.
Apex users receive the configured CNAME target and an explicit requirement for
provider-supported flattening/ALIAS; no unverified platform A/AAAA is invented.

A service-only/RLS outbox stores immutable domain/record/recipient snapshots.
Queueing requires a current owner, active domain, current version/digest and
per-domain/owner/global limits. Sending rechecks current owner, domain state,
records and target. Stale unsent jobs cancel. An attempt already in flight or
with an unknown provider outcome cannot be described as recalled/cancelled.
The email tells the recipient it is a snapshot and that DNS changes require the
owner's subsequent ownership, certificate and routing checks.

The owner API attempts just its queued job immediately. A dedicated authenticated
consumer and bounded scheduler handle retries. Resend requests use one stable
idempotency key and a persisted exact payload (including sender) for each job.
Retry only inside 23 hours and a bounded attempt limit, within the provider's
24-hour idempotency retention. Unknown outcomes retry the same key/payload,
never a new identity. A changed provider credential after an ambiguous send
stops automatic retry. Final states distinguish accepted, rejected/failed,
cancelled-before-send and uncertain. A receipt proves provider acceptance, not
mailbox delivery. Store only fixed error descriptions, not raw provider bodies.

The API exposes the latest own receipt with the draft and an owner-bound status
endpoint, so reloads do not erase tracking. Queued jobs can be cancelled before
send starts. The UI preserves the request UUID for an unknown HTTP response and
reuses it on retry. After edits it creates a new request only when the prior
submission is resolved or explicitly abandoned with its uncertainty visible.

Verification: actual owner HTTP into migrated SQL, current-role and snapshot
races, private grants, rate limits, idempotent queueing, immutable transport,
unknown outcomes, credential changes, expiry, cancellation and provider receipts;
bounded UI desktop/mobile review plus focused interactions. Use only isolated
provider fixtures during implementation. No real email is authorized to be sent
by the coding task. Production sender verification, cron/Vault activation and a
controlled delivery test remain release evidence.

Primary references: Dub's custom-domain setup guide describes forwarding exact
records; Resend's send/idempotency documentation specifies a 24-hour retention
window and distinguishes concurrent requests from payload-conflict errors.

## Backend checkpoint

The current implementation provides owner-only draft/queue/status/request-lookup/
cancel routes, service-only exact record snapshots and a durable outbox. The owner
API attempts only its job immediately; the dedicated authenticated consumer and
once/minute guarded Vault scheduler provide retries. Payloads are persisted before
sending, and unknown outcomes cannot be reported as safely cancelled or failed.
Status lookup by request ID survives a changed domain version; a null lookup alone
is not proof that a previous incoming HTTP request can never queue. Frontend work
must retain the original identity/body on ambiguous responses and never silently
start another request because a status observation timed out.

SQL and actual owner HTTP/Resend-fixture tests pass for immutable unknown retries,
role loss before prepare and after provider acceptance, source-record changes,
cancellation and nonce isolation. Private table/RPC grants and missing/invalid
scheduler credentials are tested. Eleven focused transport/input/configuration
cases pass; both API and consumer Deno graphs are frozen and checked. App
typechecking stays at702 inherited errors, none new; baseline782 is unchanged.
All2349 migration versions and SQL bodies parse/check without exemptions. UI
controls, configured sender/actual delivery and controlled rollout remain open.


Frontend follow-through must keep status/cancellation usable when delivery
configuration is disabled. Retain an unresolved request identity and exact body
per account/domain across reloads, recover by request ID and never silently change
the recipient or request after an ambiguous response. Even a403 after the send
can follow real provider acceptance if owner permission changed before the final
receipt read; the API/SQL test exercises this boundary. A null status lookup alone
cannot certify that another incoming request has stopped. The forwarding UI and
its uncertainty/recovery states are required next work, not discharged by this
backend or its tests.
