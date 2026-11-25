# Travel connection funnel

Approved: complete funnel in Admin Analytics.

Use the existing consent-gated first-party `user_events` store, with dedicated browsing and successful-request events. Do not send request, trip, destination, conversation or user identifiers to Umami. First-party request events contain only a request reference for verified attribution; no invitation text, dates or destination.

The Growth & Conversion tab gains a Travel connections section using its existing 7/30/90-day period selector. Count distinct signed-in travellers who loaded eligible destination/date results, including empty results, within the selected window. Anonymous visits are excluded because they cannot request to join. Subsequent stages require a tracked request by that same traveller after browsing, an accepted request, and a message by either participant after acceptance in that same request's conversation. Existing messages before acceptance do not count. Multiple visits, requests, hosts and messages never inflate unique traveller counts. Exclude test accounts. Derive acceptance and first-message outcomes from operational records without copying message content or adding a messaging tracker.

An admin-only aggregate RPC returns counts and step/overall conversion rates. Empty denominators return null, displayed as unavailable rather than 0%. A failed report has an explicit retry state and never renders as zero. This measures the consented cohort, not all traffic; disclose this and the deployment start of collection. Records inherit existing 90-day analytics retention. No historical backfill from operational data into nonconsented browsing history.

Checks: PostgreSQL fixtures for access control, unique counts, same-request attribution, cohort order, old chat history, nonconsented/missing events, deleted messages, test accounts, and zero denominators. UI tests cover counts, period, loading, errors and empty states. Tracking tests cover consent, DNT, automation, polling dedupe and duplicate-event aggregation, action failures, metadata minimization and nonblocking telemetry failure.
