# Dead GayCities event images — strip, and seal the one path that can regrow them

**Date:** 2026-09-09
**Status:** approved, not yet implemented

`events.images` on 27,494 rows holds a URL under
`gaycities-featured-images-production.s3.amazonaws.com`. That bucket now answers
`403 AccessDenied` for every request, so those entries render Chrome's
torn-page glyph anywhere an affected event appears — event cards, personality
pages, city pages, search results.

All figures below were measured against production on 2026-09-09.

## What was measured

### The 403 is bucket-wide, not per-object

| probe | result |
|---|---|
| 6 real URLs pulled off the live `/personalities/alyssa-edwards` page | 403 ×6 |
| a deliberately bogus key in the same prefix | 403 |
| same URL with `Referer: https://www.gaycities.com/` | 403 |
| same URL with a desktop Chrome User-Agent | 403 |

The body is `<Error><Code>AccessDenied</Code>…` in every case, including for a key
that cannot exist. The bucket's public-read policy has been removed; this is not
per-object expiry and not hotlink protection.

**Consequence:** the "probe a sample, and if some subset still resolves do not
clear those" precaution has no subset to protect. A larger sample re-derives the
same answer, because the denial is at the bucket-policy layer and does not depend
on which key is requested.

### Every affected row has exactly one image, and it is the dead one

```
affected_rows    27494
dead_urls_total  27494
keeps_an_image       0
goes_empty       27494
max_array_len        1
```

**This overturns the framing the work started from.** "Strip only the dead
entries, some events may have a second working image" describes a case that does
not occur anywhere in this cohort: every array is exactly `{dead_url}`, so every
affected row goes to `{}`.

It also makes the obvious safety assertion vacuous. A postcondition of the form
"a row with a mixed array still holds its survivor" cannot be built from this
corpus — there are zero mixed arrays, so it would pass without testing anything.
The control must be synthetic; see design B.

### The cohort is events-only, past, and effectively invisible to crawlers

```
events.logo_url carrying the host      0
venues.images  carrying the host       0
venues.logo_url carrying the host      0

past events                        27493
upcoming                               1
seo_indexable                          1
date range                    2009-08-28 .. 2026-10-31
```

27,493 of 27,494 have already happened — this is the Wayback import, and it
closes the re-sourcing question independently of the Wayback result below.

Context: `events` holds 48,867 rows total, so this is **56% of the events
corpus**. 1,853 events already carry an empty/NULL `images`, so the
empty-array state is already exercised in production rather than novel.

### The producer already moved to BunnyCDN — visible in our own data

A current event page (`https://atlanta.gaycities.com/events/1030855-atlanta-pride`)
emits both `og:image` and JSON-LD `Event.image` as
`https://gaycities-lv.b-cdn.net/events/originals/…`, and **64 events in our
database already carry that host**. Those two fields are exactly what the weekly
`gaycities-sync` cron (`.github/workflows/gaycities-sync.yml`, Mondays 04:17 UTC)
scrapes, so it cannot regrow this cohort.

The one path that still can is `scraper/scripts/gaycities-backfill.ts`, which
reads Wayback snapshots — and an archived page carries the *old* S3 `og:image`.
It has no workflow file; it is a manual one-shot. That is the producer this
design seals.

### Wayback does not hold these images

| probe | result |
|---|---|
| `/events/medsq_11_LasVegas.jpg` (positive control) | 855 B of CDX rows |
| `/events/sm_fb_946392_…` — `sm_`, `medsq_`, `lg_`, `orig_` | `[]` ×4 |
| `/events/sm_fb_971526_…` — `sm_`, `medsq_` | `[]` ×2 |
| `/events/sm_fb_1013304_…` | `[]` |

The positive control matters: the bucket *is* partly archived
(`/countries/t/cover/*` returns real captures), so the empty results are evidence
of absence rather than a malformed query. Archived event images are a `medsq_`
variant GayCities rendered on-page; our stored URLs are the `sm_` variant taken
from `og:image`, which a crawler does not fetch. No size-variant substitution
recovers them.

### Cost — 0.40 s per 300 rows, but do not budget against that number

Measured on prod in a guaranteed-rollback transaction (`raise exception` after
timing):

```
rows=300  secs=0.40  search_reindex_queue delta=300
```

The queue delta proves `trg_search_documents_event` fired. It is unscoped —
`after insert or update or delete on public.events`, no `update of` list
(`20260531155351:166`) — so any `UPDATE events` fires it once per row. Since the
pipeline overhaul it *enqueues* rather than indexing inline, which is why the
cost is 1.3 ms/row and not the 48 ms/row that CLAUDE.md's 14.6 s/300 figure
implies. CLAUDE.md already records the same correction for the city path.

**Two constraints stop this from becoming "do it all in one statement":**

1. **A rolled-back run under-reports by roughly 3×** (measured previously on the
   tag crons: 51 s rolled back vs 165 s real). So treat 300 rows as ≤1.2 s, and
   27,494 rows as plausibly ~110 s.
2. **`statement_timeout` is 2 min cluster-default and a function cannot raise its
   own** — the timer is armed when the top-level statement starts, so
   `set local` inside the function is a no-op. The Management API caps at ~120 s
   as well.

~110 s against a 120 s ceiling is not a margin, and a timeout is a full rollback.
So the migration must not attempt the whole drain.

### Migration ceiling

Remote `max(version)` is `20360901100100`, which equals the local repo max — no
drift. Re-read this immediately before merge rather than reusing it: the ceiling
is a treadmill, and another open PR may land a higher version first.

## Design

### A. Seal the producer — in the scraper, not the migration

A migration runs once. Broadening its `WHERE` clause makes it match more rows on
that single run; it does not make it run again. So the seal goes where it will be
evaluated again — the scraper's parse path.

`scraper/src/sources/gaycities/lib.ts:787`:

```ts
const image = httpsOnly(firstString(ld['image']) ?? asString(ld['thumbnailUrl']));
```

A single choke point. The legacy-template branches (`:451`, `:483`) synthesise a
`@type: 'Event'` object whose `image` is read here, so one dead-host filter at
this line covers every page generation *and* every future Wayback backfill.
`images: image ? [image] : []` at `:824` then emits an empty array — the same
terminal state the repair produces.

Guarded by a case in the existing `scraper/tests/unit/gaycities-parser.test.ts`.

### B. Migration — clamped batched runner, armed and proven, not drained

`run_event_dead_image_strip(p_batch int default 300) returns jsonb`

- Rebuilds the array:
  `array(select i from unnest(images) i where i not like '%gaycities-featured-images-production.s3%')`.
  `array_remove` cannot be used — it matches elements exactly and this match is a
  `LIKE`.
- **Keeps the filtered rebuild even though every current row would be satisfied
  by a bare `images = '{}'`.** The sync cron runs weekly and the cohort is not
  frozen; if a mixed array ever appears, the rebuild preserves the survivor and
  `'{}'` would destroy it. Same cost, strictly safer.
- Rows where nothing survives are left with `{}`, not `NULL`.
  `commit_event_staging_item` gates its refill on `array_length(e.images,1) IS NULL`
  (`20260915171408:209`), which is true for `{}` as well as `NULL`, so an emptied
  row stays eligible for a future commit to refill it.
- **Clamps `p_batch` to 300 in the function body**, so the cap is enforced rather
  than commented and cannot be opted out of by argument.
- Returns `{scanned, updated, emptied, remaining}`.
- **No cursor column.** Stripping the URL removes the row from the function's own
  predicate, so the work list shrinks monotonically, the job is self-terminating,
  and a re-run is idempotent.

The migration **arms and proves; it does not drain.** It runs exactly one batch
(≤1.2 s) as a live proof and asserts that `remaining` fell. Attempting all 92
batches risks the 120 s ceiling, and a `db push` that blocks CI for two minutes
is antisocial on a shared path.

Assertions, per the repo rule that a migration is soft on preconditions and hard
on postconditions:

- **Soft:** a zero pre-count is a clean no-op, not an abort. A concurrent session
  may legitimately have drained it between authoring and merge, and an abort
  there blocks every migration queued behind it.
- **Hard, on real data:** the one proof batch must reduce `remaining`.
- **Hard, synthetic:** a pure-expression control for the filter itself —

  ```sql
  array(select i from unnest(array[
          'https://gaycities-featured-images-production.s3.amazonaws.com/events/x.jpg',
          'https://example.com/good.jpg']) i
        where i not like '%gaycities-featured-images-production.s3%')
    = array['https://example.com/good.jpg']
  ```

  This exists because the corpus has zero mixed arrays, so the table-level version
  of this assertion cannot fail and therefore proves nothing.

A `raise notice` block reports the pre-counts into the `db push` log, including
`events.logo_url` and other tables holding the host. Those surfaces are currently
zero and are **reported, never repaired**.

### C. Drain — driver script

`scripts/data-quality/strip-dead-gaycities-images.mjs`, calling the RPC until
`remaining` reaches 0. ~92 batches, on the order of a minute or two of wall clock.

Each RPC call is its own top-level statement, so the 2 min ceiling applies
per batch rather than to the whole job — which is the reason the drain lives here
and not in the migration.

Precedent: recurring cron for an ongoing trickle, one-shot script for a
historical backlog (`backfill-venue-postal.mjs` drains its ~21k the same way).
There is no trickle here.

A cron was considered and rejected: it needs a registry row plus a second
retirement migration, and it inherits the auto-pause trap in which a falsely
paused row is indistinguishable from a deliberate retirement.

**Search queue:** the drain enqueues 27,494 rows into `search_reindex_queue`
(current depth 1,502), drained at `search_reindex_drain(1000)` per minute — about
29 minutes to settle. Expected, self-managing, and worth watching rather than
worrying about.

### D. Sentinel — standalone `dead_gaycities_image_signals()`

- **Warns** while the count is non-zero and falling.
- **Fails** only when the count is non-zero with nothing draining it.

A rule that hard-fails on any non-zero count would red every open PR for the
duration of the drain. This mirrors the distinction `check-pipeline-health.mjs`
already draws between an automation that is paused-and-still-failing and one that
is paused-then-recovered.

**A standalone function, not a new key inside `pipeline_hygiene_stats()`** —
revised during implementation. That function is a `CREATE OR REPLACE` of ~150
lines, so adding one key means restating every other key by hand: a
merge-collision surface where one dropped line silently reverts whatever another
migration added, and the only step in this change that no test can catch.
CLAUDE.md states the rule outright — *"Sentinel `event_dup_signals()` is a
standalone function (restating `pipeline_hygiene_stats` is a merge-collision
surface)"* — and `venue_dup_signals` follows it too;
`check-pipeline-health.mjs` already calls both as separate RPCs.

The original reasoning for putting it *in* `pipeline_hygiene_stats` was that its
baselines are inline constants rather than the JSON file behind
`tag_hygiene_stats`, so a new key would not reproduce the deadlock where an
unbaselined metric reds every open PR. That remains true — it was simply the
wrong risk to optimise against. The transcription risk is larger and is the one
nothing would have caught.

It reports the three "reported, not repaired" surfaces (`events.logo_url`,
`venues.images`, `venues.logo_url`) alongside `remaining`. All three are 0 today;
non-zero means a *new producer* reached a surface this repair never covered, so
those hard-fail rather than warn.

Being `STABLE`, it reports the statement snapshot — called in the same statement
as the volatile runner it will not see that runner's writes. Both consumers call
it in its own statement. Do not "verify" a drain by calling both in one `SELECT`.

This is a smoke alarm, not the seal. The seal is A.

## Out of scope

- **Re-sourcing.** Wayback holds nothing (measured, with a positive control) and
  27,493 of 27,494 events have already happened.
- **`events.logo_url`, `venues`.** Measured at zero; counted and reported by the
  migration, not touched.
- **Renaming the `source-gaycities` edge function**, which scrapes gaytravel4u and
  is unrelated to this host. Its own header already carries that follow-up.

## Risks

- **All 27,494 rows lose their only image**, taking events with no image from
  1,853 to 29,347 (60% of the corpus). This is the accepted trade — a missing
  image degrades to the existing fallback, a broken one renders a torn-page glyph
  — but it is a visible change at scale, not a quiet cleanup.
- ~~`Image.tsx` empty-vs-null handling~~ — **retired.** `src/components/ui/Image.tsx:194`
  computes `showingFallback = !resolved || error`, keying on the resolved source
  being falsy rather than on the array's shape, so `{}` and `NULL` both land on
  the deterministic fallback texture. The 1,853 events already in that state are
  the live confirmation.
- **Do not size anything from the 0.40 s figure.** It is a rolled-back
  measurement and under-reports by roughly 3×.
- **Pick the migration version against remote immediately before merge.** The
  ceiling moves.
