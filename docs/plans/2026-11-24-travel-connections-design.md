# Travel connections

Approved by the user's request to implement the strategy on 2026-11-24.

Goal: help queer travellers make real connections through small shared experiences.
Extend the established paper/ink interface; this is an Operate surface.

- `/meet/travel` asks for city, overlapping dates, and activity before authentication.
- URL context survives authentication. Draft invitation copy is held only in session storage.
- Existing trips prefill destination/dates without changing visibility. Event links prefill the event and dates.
- Invitations are explicit, member-only, city-level, and expire after their selected dates. A linked private trip never becomes shared.
- Requests require host acceptance before opening the existing direct-message conversation. Cancellation/withdrawal and block/report remain available.
- Empty results distinguish absence from load failure and provide real events/groups plus optional in-app match alerts.
- Existing location safety gates apply server-side to listing, publishing, alerts and accepting requests, including linked trip destinations.
- Consent-gated funnel events record actions without itinerary or invitation text.

Validation: client interaction tests, real PostgreSQL execution of allow/deny and lifecycle contracts, typecheck/lint/build, desktop/mobile visual inspection. No production migration or deployment is implied by implementation.

## Delivery and release

- Branch: `codex/travel-connections`, based on `origin/main` at `fc43da08c`.
- Apply `supabase/migrations/20261124205533_travel_meet_connections.sql` before deploying the frontend. The new page shows a retryable failure if its RPCs are unavailable; it does not fabricate empty results.
- Migration adds three RLS-protected tables, invoker RPC wrappers, and implementations in a schema outside the Data API. All writes validate the authenticated actor. Member discovery returns no private trip identifiers or other requesters' identities.
- Match alerts and requests use existing `notifications`; accepted requests use existing direct conversations and `/messages?conversation=…`. No new email sender, cron service or second chat system is required. Cancellation notifies affected participants; expiry is enforced at query/mutation time.
- The implementation was not deployed and no hosted database was changed.
- Existing non-English locales use the product's English fallback for new strings; English source/public catalogs are synchronized.

## Verification

- `scripts/test-travel-meet-db.sh`: disposable PostgreSQL contracts, using incumbent conversation and safety functions. Includes anonymous denial, raw-table isolation, private-trip redaction, explicit publication, date/activity matching, event/trip ownership validation, opt-in notifications, request/accept/idempotency, withdrawal/cancellation/expiry, blocks, primary and secondary destination restrictions, unknown criminalisation, possible death penalty, and missing-actor denial. This is an integration harness for the new migration, not a complete Supabase reset or hosted migration rehearsal.
- Focused Vitest suite: 29 passing tests across travel flow, context validation, entry-point safety and existing trip/city safety regressions.
- `E2E_BASE_URL=http://127.0.0.1:5179 playwright test e2e/travel-connections.spec.ts --project=chromium --workers=1`: 3 browser tests, including desktop/mobile publication and anonymous return context. API fixtures intercept all external requests; they never write live data.
- Changed-file ESLint, production build and `git diff --check` pass. The typecheck ratchet reports no new errors against the repository's existing 596-error baseline.
- Desktop/mobile screenshots inspected; mechanical design detector returned no findings. Finish review scored composer focus entry/return resolved.

## Outcome measurement

Consented `travel_meet_search/create/request/accept/decline/withdraw/cancel/alert/remove_alert` events use the existing analytics consent boundary and include no destination, dates, member identifiers or invitation text.

A two-way conversation can be measured from existing operational records without creating another message store. For an authorized aggregate analysis, count accepted requests for which both participants sent a message after acceptance (reused conversations may contain older messages, so the timestamp boundary matters):

```sql
select count(*) as accepted_requests_with_two_way_conversation
from public.travel_meet_requests r
join public.travel_meet_plans p on p.id = r.plan_id
where r.status = 'accepted'
  and exists (select 1 from public.messages m
    where m.conversation_id = r.conversation_id
      and m.sender_id = p.owner_id and m.created_at >= r.responded_at)
  and exists (select 1 from public.messages m
    where m.conversation_id = r.conversation_id
      and m.sender_id = r.requester_id and m.created_at >= r.responded_at);
```

This proxy measures reciprocal messaging, not whether people met in person. Destination pilot recruitment and optional post-meet surveys remain operational follow-up, not automated outreach.
