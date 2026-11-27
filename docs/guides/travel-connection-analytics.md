# Travel connection analytics

Open **Admin → Analytics → Growth & Conversion → Travel connections**. The period selector at the top applies to this report: 7, 30 or 90 days. Counts are unique signed-in travellers, not actions, requests or hosts.

| Stage | Definition |
| --- | --- |
| Browsing invitations | A consented `travel_meet_browse` event after loading eligible destination/date results, including empty results. |
| Requested to join | A successful consented `travel_meet_request` event after browsing, referring to a real request owned by the browsing traveller and created in the selected period. |
| Request accepted | That same tracked request currently has accepted status. Acceptance belongs to the requester cohort, even though the host takes the action. |
| Conversation started | Either participant sent a non-system, non-deleted message in that accepted request's conversation at or after acceptance. Earlier conversation history does not count. |

Each traveller counts at most once per stage, even with repeated browsing or multiple requests. Every later stage must satisfy all preceding stages on the same request. Rates use the previous stage's unique travellers; the final rate uses browsing travellers. Null denominators display a dash, not zero percent. Smaller, recent cohorts may still be awaiting replies.

Only signed-in travellers who consent to analytics are measured. Do Not Track, automated clients, anonymous browsing and test accounts are excluded. Consent is checked when the browsing and request events are emitted; acceptance and conversation outcomes are read from the operational records associated with those tracked requests. This does not estimate all traffic and does not backfill historical browsing. The first-party events inherit the existing 90-day retention policy; deleting operational requests/messages can also change historical results.

The only first-party join key is `user_events.entity_id` with `entity_type='travel_request'`. Event metadata contains `surface='meet_travel'` only. No destination, dates, invitation text, message content or conversation identifiers are copied into analytics. Existing Umami action events remain free of request/user identifiers. The admin-only `travel_meet_funnel_summary(p_days)` RPC returns aggregate counts and rates without participant or request identifiers. Failures show a retry state, never an empty funnel.

Deployment requires the `travel_meet_funnel` migration before the frontend. Keep the event vocabulary and database CHECK migration in the same release. Validate locally with `bash scripts/test-travel-meet-db.sh` and the travel analytics Vitest suites. The database runner uses a disposable PostgreSQL cluster and never writes to a hosted database.
