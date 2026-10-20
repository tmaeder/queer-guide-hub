# Dynamic email audiences

The email platform has service-only versioned audience definitions and an admin-authorized API. This is the backend foundation; the visual audience builder, campaign binding and broad journey action catalog remain unfinished. The bounded transactional runtime is documented in `docs/architecture/email-journeys.md`. A matching contact is not necessarily eligible, and eligibility never overrides Cloudflare's transactional-only delivery capability.

## Rules

Each rule is one of:

- `{"all":[rule,...]}`, `{"any":[rule,...]}`, or `{"not":rule}`.
- `{"field":"locale","op":"eq","value":"en"}` or `{"field":"locale","op":"in","value":["en","de"]}`. The same operators support `status` (`pending`, `subscribed`, `unsubscribed`) and recorded subscription `source`.
- `{"field":"topic","op":"contains","value":"events"}`. Topics are `newsletter`, `product_updates`, and `events`.
- `{"field":"confirmed_at","op":"within_days","value":30}`. `created_at` is also supported; `older_than_days` is the other time operator. Unconfirmed and future dates cannot satisfy a confirmation-age predicate.
- `{"event":"consent.confirmed","within_days":30,"min_count":1}`. Supported events are consent `confirmed`, `preferences_changed`, `unsubscribed`, and delivery `delivered`, `bounced`, `complained`. Delivery is provider lifecycle evidence, not an open, click, purchase or measure of engagement.

Rules accept no arbitrary SQL, email-address predicate, private-message content, sensitive profile field or browsing event. The validator limits rules to 8,000 bytes, six nested levels, ten children per group, twenty values per list, 1–3,650 days per window and 1–1,000 events per threshold. Dates use one database statement time for the whole preview. Relevant subscriber and event indexes are provided; production capacity and complex audience latency still require measurement.

## API

All calls use the existing `email-admin` endpoint and its verified administrator authorization. Browser roles cannot query or mutate the segment tables or RPCs directly. The API ignores caller-supplied actor IDs and records its authenticated actor.

- `GET ?resource=segments` returns the latest 100 definitions, including rule, version and active/archived state.
- `POST {"action":"segment-save","name":"English event subscribers","rule":{"all":[{"field":"locale","op":"eq","value":"en"},{"field":"topic","op":"contains","value":"events"}]}}` creates version 1.
- To change/archive a definition, send the same action with `id`, `expected_version` and optional `status`. Every successful change creates a new immutable API history entry. A stale expected version returns HTTP 409 without modifying the current definition or its history.
- `POST {"action":"segment-preview","id":"<segment UUID>","topic":"events","limit":50}` evaluates a saved version against current contact data and returns that version. An unsaved `rule` may be supplied instead of `id`. Optional `after` is the last sample UUID; totals remain for the full matching audience, not just the page.
- `GET ?resource=timeline&id=<subscriber UUID>` returns up to 50 consent and provider lifecycle events. Unconfirmed mailboxes expose only their own consent requests, not mailbox-wide delivery history. Bodies, confirmation links and private application metadata are absent.

Preview output includes `evaluated_at`, `matched`, `eligible`, an exclusion-reason count map, and a bounded sample with each contact's reason. Eligibility checks current confirmation/subscription status, requested topic, disabled account state, and both ordinary and hashed suppressions. No audience membership cache can bypass a later opt-out. Previews still return `dispatchAvailable: false`; promotional sending remains blocked.

The preview is an administrative estimate, not a send authorization or frozen recipient list. A future campaign/journey implementation must snapshot its rule version and revalidate each recipient's current permission, source state and suppression immediately before delivery. General event ingestion, cadence, quiet hours and cross-journey frequency limits remain separate unfinished capabilities.

## Erasure and verification

The timeline and event predicates query the authoritative consent/delivery tables; they do not duplicate contact events. Existing account erasure therefore removes matching personal timeline data and affects subsequent previews immediately. Segment definitions contain only approved rule types, and their actor references use `ON DELETE SET NULL`.

Apply the delivery, privacy and segment migrations in order. Run all three standalone SQL contract files after the bootstrap. Tests cover nested conditions, changing preferences, topic/consent/suppression exclusions, event counts, time bounds, malformed/sensitive rules, SQL-shaped literal values, version conflicts, mailbox-proof timeline boundaries, erasure and service-only grants/RLS. These fixtures do not prove the complete production schema or production-scale performance.

## Latest local verification

On 2026-10-20 a clean application of all three migrations and all three SQL contract suites passed after disk space recovered. The stronger pending-mailbox assertion caught an incorrect test expectation: erasing one contact must preserve another pending mailbox's event. That expectation was corrected, and all suites were rerun successfully. Eleven Deno backend tests and checks of all eight affected endpoints also passed. No frontend code changed in this continuation.

Only task-created disposable databases, build output and the isolated worktree npm dependency installation were removed during recovery. Source and commits were preserved. The isolated worktree dependencies were subsequently restored with npm ci after disk space recovered. Production data, the main checkout and real mail were untouched.
