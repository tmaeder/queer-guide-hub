# Automated event gap closure

## Production strategy

Existing `event-agentic-enrich` and `event-image-backfill` endpoints now share a
leased, service-only queue. Content runs every 15 minutes (UTC minutes 07/22/37/52),
images hourly at minute 18. Each batch has three concurrent workers. The existing
60/day AI ledger remains the hard ceiling, including explicit event-ID requests.

Evidence order:

1. Recover absent source URLs from the event's source registry.
2. Copy a usable description from an attributable raw source payload.
3. Extract a description from event JSON-LD matching title and occurrence date.
4. Fetch event-specific source/ticket pages once per batch and use grounded AI.
5. For AI fields, require confidence plus a supporting quote actually present in
   the page. Date disagreements and ended source occurrences go to review.
6. For images, inspect matching JSON-LD and social metadata, then perform a bounded
   image fetch and apply the existing cover quality rules. Preserve other photos.

Long-running records older than 180 days without recurrence evidence go to review
without external requests. This avoids treating questionable date ranges as a
permanent supply of current events. The baseline had 1,445 such AgendaQ records;
the source adapter is not present in this repository. The queue records the
schedule ambiguity; it does not invent corrected dates or occurrences.

Unknown audience/accessibility information remains unknown. Title/date suggestions
are review evidence; this gap worker does not rename events or rewrite dates.

## Claims, retries and accounting

Claims use `FOR UPDATE SKIP LOCKED` and a five-minute token lease. Completion
rechecks lease ownership, current canonical/status eligibility, current field
values, and source evidence under row locks. Event writes, provenance, actual
persisted field counts, queue completion and quality-snapshot invalidation share a
transaction. Controlled vocabulary triggers run before fields are counted.

- No change: 2, 4, 8, 16, then 30-day cooldown.
- Failed: exponential delay starting at two hours, capped at seven days.
- Review: 30 days, with `needs_attention` and queue evidence.
- Daily budget deferral: next reset plus five minutes; other budget/circuit/runtime
  deferrals wait one hour. Neither increases the miss streak.
- Productive fill: 14 days for optional follow-up. A remaining thin description
  after source recovery gets a 15-minute follow-up.
- Relevant event changes or changed source payload hash/URL reopen idle work.
- Crashed workers recover when their lease expires; stale results cannot apply.

Content extraction does not update `last_verified_at`: liveness remains owned by
its existing checker. Issue resolution remains owned by the quality scanners.
Field counters are historical write counts; a later human retraction must remain
visible in the review/audit trail rather than being reported as a closed gap.

## Inspect and diagnose

```sql
select public.event_gap_metrics();
select lane,last_outcome,count(*)
from public.event_gap_queue group by 1,2 order by 1,3 desc;
select e.title,q.lane,q.last_details,q.next_attempt_at
from public.event_gap_queue q join public.events e on e.id=q.event_id
where q.last_outcome in ('failed','review') order by q.updated_at desc limit 50;
```

The metrics separate source-level attempts, productive attempts, actual fields,
AI attempts, network requests, due work and leases. They also expose events without
usable source evidence and long-running records without recurrence. Do not hide
those gaps by accepting issues or manufacturing fields.

HTTP dry runs are read-only: no enqueue, lease, page fetch or model spending:

```json
{"dry_run":true,"batch_limit":8}
```

Explicit IDs still obey canonical eligibility, lease/cooldown and budget rules.
The completion API is service-only, as are the queue and metrics.

## Verification and release record — 2026-10-16

- Applied all five migrations at the exact versions recorded in their filenames;
  deployed both functions and updated existing cron/admin automation records.
- Passed eight pure evidence/concurrency tests, five HTTP worker tests, Deno type
  checks, targeted ESLint, SQL grammar checks and PostgreSQL integration assertions.
- Ran the integration transaction against production with rollback; tested
  previews, leases, expired tokens, cooldown, preserved edits, provenance,
  assessment invalidation, daily rollover/caps, and role restrictions.
- Live batches returned HTTP 200. A matching QCal JSON-LD description filled a
  real gap without an AI call; the existing scanner subsequently cleared its
  description finding.
- An initial AI extraction misread a French schedule date in prose. Retracted its
  two fields with guarded updates and preserved provenance, marked the event for
  review, added exact supporting-quote requirements, and excluded schedules from
  generated description prose. One deterministic description fill remains verified.
- No replacement artwork in the initial live samples passed the complete cover
  checks; those records received cooldowns rather than placeholder images.
- Security advisors report only the expected informational no-policy finding for
  the service-only RLS queue. No public grants or mutable search paths were added.

## Pause or rollback

Pause the two existing cron jobs through automation controls, or:

```sql
select cron.alter_job(jobid,active:=false) from cron.job
where jobname in ('event_agentic_enrich','event_image_backfill');
```

Keep queue rows, signals and provenance. Expired leases recover on resumption.
To roll back worker code, restore both endpoint files and deploy the earlier
versions together; restore the prior schedules (content hourly at :50, images
Monday 02:15 UTC). The additive database objects can remain for audit.

## Source-calendar recovery follow-up

`run_event_source_schedule_recovery` fills missing canonical schedules directly
from the event's stored AgendaQ calendar records. It preserves source date bounds,
timezones, weekday selection, daily intervals and supported monthly ordinals,
while preserving the original span and the separate legacy annual-edition flag.
Each restored schedule records its source row, URL and calendar fingerprint.
The existing schedule trigger rebuilds concrete occurrences. Changed source
calendars are picked up again; the materialized 18-month horizon refreshes before
it becomes shorter than a year.

Unsupported fifth/last-week sentinels, inconsistent timezones and multi-day spans
that the current slot model cannot express are recorded for review once per
source fingerprint. They never become fabricated dates. Recovery runs every 20
minutes. A temporary one-minute drain stops itself when the backlog is empty;
each transaction stops taking new work after 20 seconds.

Canonical feed/authored recurrence evidence prevents the content worker from
misclassifying a long span based on the legacy `is_recurring` flag. Raw, event-owned
cover assets can also be validated directly before attempting a page scrape.

```sql
select public.run_event_source_schedule_recovery(75,true); -- preview only
select count(*) from public.events where schedule->>'source'='agendaq-raw';
select count(*) from public.event_dates d join public.events e on e.id=d.event_id
where e.schedule->>'source'='agendaq-raw';
select field_provenance#>>'{source_schedule_recovery,reason}',count(*)
from public.events where field_provenance#>>'{source_schedule_recovery,outcome}'='review'
group by 1;
```

The source-evidence reopener uses `SKIP LOCKED` so ingestion cannot wait on a
completion worker's queue lock while holding an event lock. Plain description
recovery accepts plain text and decodes entities in one pass, addressing both
CodeQL findings from the first PR run.

Timezone validation resolves the declared zone directly with `AT TIME ZONE`;
unknown zones are rejected. This avoids enumerating the entire timezone catalog
for each source period. The full-schema integration test exercises raw source
insertion, preview, canonical schedule recovery, date-index trigger, local opening
time, idempotence and preservation of an authored schedule, all with rollback.

## Production E2E timing correction

The live browser check exposed a reader gap after recovery: event details still
used the broad legacy span for countdowns and time labels. Feed-backed recovered
recurrences now load the next current/future row from `event_dates`; detail timing,
countdown and structured event metadata use that observed session. The source span
is preserved in memory and in the database. Missing index data suppresses a false
happening-now claim. Explicit multi-date schedules are described as multiple
scheduled dates rather than guessed weekly rules.

Calendar export reads the same next indexed occurrence and uses the explicit
venue FK. It declines export when a recovered recurrence has no available indexed
date, instead of generating an all-day or year-long calendar entry.

## Calendar and identity evidence follow-up — 2026-10-25

Parser version 2 supports last-weekday monthly rules, weekly/monthly intervals,
cancellation dates/ranges/recurrences, equivalent IANA zones for the actual
materialized instants, and explicit multi-day end dates. A multi-day span becomes
one occurrence. Malformed historical rows no longer invalidate current calendars.
Future contradictory periods remain in `omitted_periods`; their valid surrounding
sessions can be recovered with `outcome=partial`, without hiding the conflict.

The reviewed source manifest covers all 124 records still lacking sources on this
date (the earlier snapshot counted 125). Each successful attribution has a live
HTTPS response, a bounded content hash, a short identity quote, and a timestamp.
These are identity sources. They do not confirm estimated future-edition dates.
Explicit organizer evidence separately corrects Midsumma, West Pride and Dublin
festival dates. Week-end Rubber's organizer cancellation supersedes stale listings.

`Revalidate event identity sources` refreshes reviewed pages weekly with three
concurrent requests and emits an evidence artifact. Apply only verified entries
with `apply_event_source_evidence`; existing editorial URLs and event dates are
preserved. A six-hour database job can inherit fresh identity evidence for later
seed clones only when normalized family title and city both match. It never
copies dates. New source discovery candidates still require identity review.

Metrics distinguish `identity_only_unconfirmed_editions` and
`partial_source_calendars` from source URL coverage. Investigate partial calendars
through `field_provenance.source_schedule_recovery.omitted_periods`. Do not treat
zero missing URLs as proof that future edition dates have been verified.

Worker pages with matching title/date JSON-LD cancellation or postponement go to
review before further enrichment. This is a review signal, not permission to
cancel an unrelated event based on page prose.
