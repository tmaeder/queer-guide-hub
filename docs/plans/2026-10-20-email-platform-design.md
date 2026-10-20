# Integrated email platform

The user selected Cloudflare only on 2026-10-20 after review of the integrated backend scope. Keep the existing Supabase backend, admin identity, React Email block editor and published email branding. Cloudflare is the sole outbound email provider; do not introduce a marketing vendor or Resend fallback.

## Delivery

All application mail enters a durable Postgres outbox. Preserve the existing sendEmail contract, but throw on failure so callers cannot mark failed messages sent. Persist immutable per-recipient payloads, logical idempotency keys, attempt counts and delivery receipts. A restricted Worker uses the native Email Sending binding, which returns messageId for correlation. One Durable Object per message persists submission outcomes before returning; ambiguous outcomes are held for review rather than blindly resent. Internal/admin dispatch processes bounded batches with leased claims and explicit retries. Do not log message bodies or recipient addresses.

Cloudflare Queue event subscriptions forward native lifecycle events to an authenticated backend endpoint. Process events transactionally and idempotently; suppress hard bounces and complaints. Preserve terminal state across delayed/deferred events and retain events that race ahead of the send receipt.

## Subscribers and campaigns

Store members and non-member subscribers separately from profiles, with topic preferences, locale, subscription source and append-only consent events. Require proof of mailbox ownership before activation. Token endpoints store only hashes, use expiring single-use confirmation tokens, support one-click unsubscribe via POST, and render a confirmation form on GET so mail scanners cannot unsubscribe people. Members can manage their own preferences; admins can manage lists and inspect consent without inventing it.

Campaign drafts reference existing email templates, snapshot subject/HTML/text, store explicit audience criteria and desired schedule, and show eligible audience counts. No implicit enrollment of existing users. Do not segment on sensitive profile attributes. Admin email workspace shows campaigns, subscribers, suppressions and outbox status and links directly to the existing editor.

## Provider constraint

Cloudflare's FAQ checked on 2026-10-20 says Email Service supports transactional email only: https://developers.cloudflare.com/email-service/reference/faq/. Newsletter and marketing dispatch must therefore be explicitly blocked at API, database and transport boundaries. Drafting, audience management and consent remain available. Do not add an environment switch that misrepresents provider support. The original goal is not complete until Cloudflare supports the requested newsletter/marketing delivery or the user changes that constraint.

## Verification

Test idempotency, concurrent claims, uncertain submissions, stale leases, rate limits, consent/token ownership, unsubscribe replay, RLS and privilege boundaries, event replay/order, suppression and provider capability rejection. Run targeted frontend and backend tests, type checks, SQL execution against an isolated database and Worker dry run. Production deployment and actual mail delivery require configured sending domain, bindings, secrets and queue subscription. Current CLI discovery reports no sending subdomains; verify apex status separately before rollout.
