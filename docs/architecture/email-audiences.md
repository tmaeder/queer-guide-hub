# Dynamic email audiences

The email platform has service-only versioned audience definitions and an admin-authorized API. The admin Email workspace now includes a visual audience builder. Campaign binding and the broad journey action catalog remain unfinished. The bounded transactional runtime is documented in `docs/architecture/email-journeys.md`. A matching contact is not necessarily eligible, and eligibility never overrides Cloudflare's transactional-only delivery capability.

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

## Earlier foundation verification — 2026-10-20

On 2026-10-20 a clean application of all three migrations and all three SQL contract suites passed after disk space recovered. The stronger pending-mailbox assertion caught an incorrect test expectation: erasing one contact must preserve another pending mailbox's event. That expectation was corrected, and all suites were rerun successfully. Eleven Deno backend tests and checks of all eight affected endpoints also passed. No frontend code changed in this continuation.

Only task-created disposable databases, build output and the isolated worktree npm dependency installation were removed during recovery. Source and commits were preserved. The isolated worktree dependencies were subsequently restored with npm ci after disk space recovered. Production data, the main checkout and real mail were untouched.

## Admin audience workspace — 2026-10-21

The Audiences tab at `/admin/email` lists up to 100 recently updated definitions and edits their current name, active/archived state and version. The existing admin authorization remains the only API entry point; the browser receives no direct table or RPC grants. The editor supports nested all/any/not groups, scalar/list subscription fields, subscription/confirmation age and the six documented consent/delivery events. It offers no sensitive targeting or arbitrary expressions. Client feedback checks nesting, group/list/window/count bounds and a conservative 7,000-byte serialized limit; database validation remains authoritative.

Save sends the last loaded `expected_version`. A 409 preserves local edits and blocks overwriting: administrators can explicitly discard/reload the saved definition or retain the edits as a new definition. Other errors preserve the editor too. Opening another saved definition is disabled while changes are unsaved; the explicit discard control starts a new audience. Switching workspace tabs keeps audience edits mounted. Refreshing definitions does not overwrite the current editor.

Preview evaluates the current unsaved rule, with an optional consent topic, against live data. It shows exact matching/eligible totals, exclusion reasons, evaluation time and a sample capped at 25 contacts. Rule or topic changes immediately remove the prior preview; a request revision guard discards late results. Definition list failures have a retry state and do not claim an empty audience. Preview never invokes dispatch, freezes recipients or binds a campaign.

Local verification covers nested archived saves with expected versions, exclusion display, stale responses, conflicting edit copies and explicit reload, network recovery, local invalid-value rejection, and preserving edits across workspace tabs. Desktop (1,280 pixels) and mobile (390 pixels) fixtures showed no horizontal overflow; the rendered fixture displayed preview totals and suppression reasons without console errors after replacing the API with local data. This is not authenticated production or real-inbox verification. Journey editing, contact timeline UI, campaign binding/approval and larger audience pagination remain separate work.

The continuation passed 12 focused UI tests, ESLint on changed TypeScript/TSX, workflow parsing and the production Vite build. The repository type-check ratchet passed with 698 pre-existing errors and none added (baseline 782). No database schema, send endpoint, provider configuration or production data changed in this stage.
