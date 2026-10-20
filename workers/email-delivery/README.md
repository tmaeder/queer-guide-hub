# Cloudflare email delivery

This Worker is the only application delivery provider. The existing Supabase backend owns contacts, consent, campaigns and the transactional outbox. The native Cloudflare Email Sending binding supplies a provider message ID for lifecycle correlation; its HTTP REST API only supplies grouped recipient outcomes, so it is not used for application delivery.

**Cloudflare currently supports transactional email only.** Campaign and newsletter dispatch is blocked in the database/API/gateway. Creating a draft or choosing a date never schedules an unsupported send. There is no vendor fallback or override flag. See https://developers.cloudflare.com/email-service/reference/faq/.

## Release gates

This branch is a locally verified delivery and consent foundation, not a production-ready replacement for the benchmark platforms. Local account erasure/export now covers explicitly owned messages, confirmed linked subscriptions and pending account confirmation requests; verify the complete deployed self-service/admin flows before rollout. The existing group, saved-alert and other domain senders also need current-membership/source-state checks at dispatch. Complete those integrations and the acceptance gates in `docs/research/2026-10-20-email-platform-benchmark.md`; changing a shared sender alone does not establish end-to-end integration.

## Rollout

1. Confirm `queer.guide` (or deliberately change `SENDER_DOMAIN` and published sender branding) is onboarded to Email Sending with SPF/DKIM/DMARC. `wrangler email sending list` reports sending subdomains; verify the apex in the dashboard too. Requires sending entitlement. The locally authenticated OAuth token did not include email_sending:write when checked on 2026-10-20.
2. Apply email platform, privacy, segments, lifecycle and journeys migrations in timestamp order through the normal migration workflow. Existing profile accounts are **not** enrolled. Its cron calls the authenticated outbox dispatcher once per minute using the existing vault `internal_invoke_secret`.
3. In this directory create queues `queer-guide-email-events` and `queer-guide-email-events-dlq`. Set Worker secrets `EMAIL_GATEWAY_SECRET` and `EMAIL_EVENTS_SECRET` with Wrangler, then deploy. Keep the generated resource bindings in sync using `wrangler types worker-configuration.d.ts --include-runtime=false`.
4. Set Supabase secrets `EMAIL_GATEWAY_URL` (the deployed Worker origin), `EMAIL_GATEWAY_SECRET`, and `EMAIL_EVENTS_SECRET` (same values on each side). Deploy the changed functions and new `email-dispatch`, `email-admin`, `email-subscriptions`, `cloudflare-email-events`, `email-journeys` functions. They own their authorization; preserve `verify_jwt=false` for new endpoints. Keep all credential values out of browser env vars.
5. Configure Cloudflare Email Sending Event Subscriptions on the verified sending domain, delivering all six native lifecycle event types to `queer-guide-email-events`. The consumer forwards to the authenticated backend. Configure DLQ monitoring in the existing operations workflow.
6. For anonymous subscription requests configure a Turnstile widget for `queer.guide` with action `email-subscribe`, and backend `TURNSTILE_SECRET_KEY`. Signed-in members use their account email; both routes require a confirmation email before activation. A public website signup form is not included in this backend release.
7. Set Supabase Auth custom SMTP to Cloudflare's supported authenticated SMTP endpoint separately if authentication email is still supplied by Supabase's default mail service. Do not disable auth delivery while staging the cutover. See https://developers.cloudflare.com/email-service/api/send-emails/smtp/.
8. Check one controlled account confirmation and one transactional notification, then verify provider ID, delivery event, suppression, retry and visible admin status. No real email or production migrations were issued during local tests.

## Operations

`/admin/email` is admin-only and shows recent delivery states, campaigns, subscriber counts and consent history. `/admin/email-templates` owns composition; Design & branding owns sender identity. Profile settings contain opt-in preferences. `email-admin` is the authorized API; new tables have no direct member or anonymous access.

Provider acceptance is not final delivery. An ambiguous native binding outcome is stored as `uncertain` in a Durable Object **before** the send. Retrying the same message identity returns that stored result and cannot resubmit mail. A definite quota rejection can retry. Uncertain submissions require comparison with Cloudflare's activity log; do not reset Durable Object state or assign a new identity merely because the HTTP receipt was lost.

Outbox leases use `FOR UPDATE SKIP LOCKED`; expired leases replay the same Worker identity. Lifecycle events and receipt writes serialize on the provider ID; early events remain persisted until the receipt is attached. Replays are idempotent; terminal delivery cannot regress to deferred. Hard bounces and complaints suppress future sends, including account mail to undeliverable recipients.

Legacy `resend_id` mailbox fields retain their names for schema compatibility but store Cloudflare provider IDs after cutover. The historical `resend-webhook` endpoint only processes older Resend feedback receipts; it is not an outbound path. Remove its old secret after all historical receipts have drained. Existing SMTP-to-Cloudflare team inbox infrastructure remains separate.

Account deletion and admin anonymization erase new email bodies, addresses, tokens and linked subscriptions transactionally with the existing product erasure core. Direct Auth deletion has a safety trigger. Welcome, username reminders and DM digests explicitly bind messages to their recipient account; new member senders must supply `recipientUserId`. An unproved mailbox-link request cannot erase another member's subscription or suppression. Public, unlinked contacts require a separate verified erasure flow; this account endpoint cannot claim them merely because an account contains the same address.

Opaque outbox/idempotency/provider identifiers survive erasure to reject stale retries. Minimal service-only mailbox hashes and bounce/complaint reasons survive for late-event filtering and suppression; these are pseudonymous data, not anonymous data. A fresh receipt can still receive events for a previously erased mailbox, but an early uncorrelated event is discarded until the fresh receipt is known. Reconcile that case in Cloudflare's activity log. Already submitted mail cannot be recalled; the final database lease check narrows but cannot eliminate the network race with deletion. Provider-held logs and mailbox copies are not erased by this local database operation.

Before production, establish retention periods for message bodies, delivery/consent data and Durable Object receipts. Do not delete receipts while any caller or outbox can still retry the identity. Do not use open pixels as delivery evidence; Cloudflare's documented lifecycle events have no open/click event.

## Local checks

- `npm test` and `npm run typecheck` here; `npm run dry-run` bundles without deploying.
- `deno test --no-config --allow-env supabase/functions/_shared/email-platform.test.ts supabase/functions/_shared/email-render.test.ts supabase/functions/_shared/email-outbox.test.ts supabase/functions/_shared/email-journey-worker.test.ts` from repository root.
- Run `supabase/tests/fixtures/email_platform_bootstrap.sql`, all five migrations and `supabase/tests/email_platform.sql`, `supabase/tests/email_platform_privacy.sql`, `supabase/tests/email_platform_segments.sql`, `supabase/tests/email_platform_lifecycle.sql`, `supabase/tests/email_platform_journeys.sql` in a fresh isolated Postgres database. The bootstrap supplies only the prerequisites for the contract suite; it does not validate every application migration. It rolls back test data.

Remaining provider limitation: the full marketing/newsletter objective cannot be activated while Cloudflare disallows that delivery class. Deployment, domain setup, event subscriptions and Auth SMTP cutover are still rollout steps, not proven by local tests.

Dynamic audience definitions, live previews and contact timelines are available through the admin API; see `docs/architecture/email-audiences.md`. The audience builder UI, campaign binding and full transactional journey action catalog remain unfinished.

Operational lifecycle producers now connect Auth, profile usernames, RSVPs, groups and trips. They record restricted state changes without automatically sending mail; see `docs/architecture/email-lifecycle-events.md`. The bounded journey runtime now consumes these events; further transactional actions and product adapters remain required work.

The initial durable journey runtime supports waits, live branches and receipt-gated welcome delivery, with pause/cancel checks also applied to linked outbox retries. Deploy `email-journeys` and the changed welcome/shared functions; keep definitions draft until controlled delivery and legacy-producer cutover are verified. See `docs/architecture/email-journeys.md` for API, publication, privacy and remaining capability limits.
