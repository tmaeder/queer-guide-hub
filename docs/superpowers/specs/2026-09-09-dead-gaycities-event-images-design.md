# Dead GayCities event images — strip, and seal the one path that can regrow them

**Date:** 2026-09-09
**Status:** approved, not yet implemented

`events.images` on ~27,494 rows holds a URL under
`gaycities-featured-images-production.s3.amazonaws.com`. That bucket now answers
`403 AccessDenied` for every request, so those entries render Chrome's
torn-page glyph anywhere an affected event appears — event cards, personality
pages, city pages, search results.

## What was measured

All measurements below were taken 2026-09-09 from this session. Numbers that
require database access were **not** taken — see "What was not measured".

### The 403 is bucket-wide, not per-object

| probe | result |
|---|---|
| 6 real URLs pulled off the live `/personalities/alyssa-edwards` page | 403 ×6 |
| a deliberately bogus key in the same prefix | 403 |
| same URL with `Referer: https://www.gaycities.com/` | 403 |
| same URL with a desktop Chrome User-Agent | 403 |

The body is `<Error><Code>AccessDenied</Code>…` in every case, including for a
key that cannot exist. The bucket's public-read policy has been removed; this is
not per-object expiry and not hotlink protection.

**Consequence for the repair:** the usual "probe a sample, and if some subset
still resolves do not clear those" precaution has no subset to protect. No
object in this bucket can resolve for anyone. A larger sample would re-derive
the same answer, because the denial is at the bucket-policy layer and does not
depend on which key is requested.

### The producer is already sealed — upstream did it

GayCities migrated image hosting to BunnyCDN. On a current event page
(`https://atlanta.gaycities.com/events/1030855-atlanta-pride`) both the
`og:image` meta and the JSON-LD `Event.image` read
`https://gaycities-lv.b-cdn.net/events/originals/1030855-atlanta-pride-alihaas-038af.jpg`.

Those two fields are exactly what the weekly `gaycities-sync` cron
(`.github/workflows/gaycities-sync.yml`, Mondays 04:17 UTC) scrapes. **It cannot
regrow this cohort.** The cohort is historical.

The one path that still can is `scraper/scripts/gaycities-backfill.ts`, which
reads Wayback snapshots — and an archived page carries the *old* S3 `og:image`.
It has no workflow file; it is a manual one-shot. That is the producer this
design seals.

### Wayback does not hold these images, so re-sourcing is unavailable

| probe | result |
|---|---|
| `/events/medsq_11_LasVegas.jpg` (positive control) | 855 B of CDX rows |
| `/events/sm_fb_946392_…` — `sm_`, `medsq_`, `lg_`, `orig_` | `[]` ×4 |
| `/events/sm_fb_971526_…` — `sm_`, `medsq_` | `[]` ×2 |
| `/events/sm_fb_1013304_…` | `[]` |

The positive control matters: the bucket *is* partly archived (`/countries/t/cover/*`
returns real captures), so the empty results are evidence of absence rather than
a malformed query. The archived event images are a `medsq_` variant that
GayCities rendered on-page; our stored URLs are the `sm_` variant taken from
`og:image`, which a crawler does not fetch. No size-variant substitution
recovers them.

The remaining theoretical path — re-scraping live GayCities detail pages — is
out of scope: ~99% of this corpus is past events imported *because* they were
already gone, so the pages are unlikely to exist.

### The events search trigger is unscoped

`supabase/migrations/20260531155351_search_documents_pilot_table_and_sync.sql:166`

```sql
create trigger trg_search_documents_event
  after insert or update or delete on public.events
  for each row execute function public.search_documents_sync('event');
```

No `update of` column list, so **any** `UPDATE events` fires it once per row.
CLAUDE.md's measured cost — a 300-row events UPDATE at ~14.6 s, 13.8 s of it
this trigger — therefore applies to this repair unchanged. The 300 cap stands
and must not be raised.

`events` carries `images text[]` and a separate `logo_url`; there is no scalar
`image_url` on this table.

### What was not measured

This session has no database access: no `SUPABASE_URL` / service key, no
`SUPABASE_ACCESS_TOKEN`, no DB URL, and the CLI is authenticated but unlinked.
So the following are **unknown** and are reported by the migration rather than
asserted by it:

- the exact row count (27,494 is from the request, not re-derived here)
- how many affected rows keep a surviving non-S3 image vs. go empty
- whether `events.logo_url` or any other table carries the same host

## Design

### A. Seal the producer — in the scraper, not the migration

A migration runs once. Broadening its `WHERE` clause makes it match more rows on
that single run; it does not make it run again. So the seal goes where it will
be evaluated again — the scraper's parse path.

`scraper/src/sources/gaycities/lib.ts:787`:

```ts
const image = httpsOnly(firstString(ld['image']) ?? asString(ld['thumbnailUrl']));
```

This is a single choke point. The legacy-template branches (`:451`, `:483`)
synthesise a `@type: 'Event'` object whose `image` is read here, so one dead-host
filter at this line covers every page generation *and* every future Wayback
backfill. `images: image ? [image] : []` at `:824` then emits an empty array,
which is the same terminal state the repair produces.

Guarded by a case in the existing `scraper/tests/unit/gaycities-parser.test.ts`.

### B. Migration — clamped batched runner, self-measuring

`run_event_dead_image_strip(p_batch int default 300) returns jsonb`

- Rebuilds the array:
  `array(select i from unnest(images) i where i not like '%gaycities-featured-images-production.s3%')`.
  `array_remove` cannot be used — it matches elements exactly and this match is a
  `LIKE`.
- Where nothing survives the row is left with `{}`, not `NULL`.
  `commit_event_staging_item` gates its refill on `array_length(e.images,1) IS NULL`
  (verified, `20260915171408:209`), which is true for `{}` as well as `NULL` — so
  an empty array stays eligible for a future commit to refill it.
  `src/components/ui/Image.tsx` carries a fallback ladder ending in a
  deterministic on-brand texture; **its exact empty-vs-null handling was not
  verified in this session** and must be checked during implementation, since it
  decides whether an emptied row renders the fallback or nothing.
- **Clamps `p_batch` to 300 in the function body.** "Never raise the batch size"
  is enforced, not commented — a caller cannot opt out by argument.
- Returns `{scanned, updated, emptied, remaining}`.
- **No cursor column.** Stripping the URL removes the row from the function's own
  predicate, so the work list shrinks monotonically and the job is
  self-terminating. Nothing needs stamping, and a re-run is idempotent.

Measurement, since this session is blind: a `raise notice` block emitting the
pre-counts into the `db push` log — matching events, how many keep a surviving
image, how many go empty, plus counts for `events.logo_url` and any other table
holding the host. Those extra surfaces are **reported, never repaired**; acting
on a number nobody has read is how scope silently grows.

Assertions, per the repo rule that a migration is soft on preconditions and hard
on postconditions:

- **Soft:** a zero pre-count is a clean no-op, not an abort. A concurrent session
  may legitimately have drained it between authoring and merge, and an abort
  there blocks every migration queued behind it.
- **Hard:** one bounded live batch must reduce `remaining`; and a **positive
  control** — a row whose array mixes a dead S3 URL with a live one must still
  hold the live one afterwards. Without that control the migration also passes by
  emptying every array it touches, which is the failure it exists to avoid.

### C. Drain — driver script

`scripts/data-quality/strip-dead-gaycities-images.mjs`, calling the RPC until
`remaining` reaches 0. ~92 batches.

Precedent: recurring cron for an ongoing trickle, one-shot script for a
historical backlog (`backfill-venue-postal.mjs` drains its ~21k the same way).
There is no trickle here — the producer is sealed upstream and, after A, in our
code too.

A cron was considered and rejected: it needs a registry row plus a second
retirement migration, and it inherits the auto-pause trap in which a falsely
paused row is indistinguishable from a deliberate retirement.

### D. Sentinel — `dead_gaycities_images` in `pipeline_hygiene_stats()`

Justification is narrow and specific: nobody implementing this can see the
database, so a counter is the only way "the drain reached zero" becomes
verifiable rather than asserted.

- **Warns** while the count is non-zero and falling.
- **Fails** only when the count is non-zero with nothing draining it.

A rule that hard-fails on any non-zero count would red every open PR for the
three hours the drain runs. This is the same distinction `check-pipeline-health.mjs`
already draws between an automation that is paused-and-still-failing and one that
is paused-then-recovered.

`pipeline_hygiene_stats` baselines are inline constants in
`check-pipeline-health.mjs`, not the JSON file behind `tag_hygiene_stats` — so
adding a key here does **not** reproduce the deadlock where an unbaselined metric
reds every open PR.

This is a smoke alarm, not the seal. The seal is A.

## Out of scope

- **Re-sourcing.** Wayback holds nothing (measured, with a positive control) and
  the live pages are gone for a past-event corpus.
- **`events.logo_url` and other tables.** Counted and reported by the migration;
  not touched.
- **Renaming the `source-gaycities` edge function**, which scrapes gaytravel4u and
  is unrelated to this host. Its own header already carries that follow-up.

## Risks

- **Rows that go empty lose their only image.** Accepted: a missing image
  degrades to the existing fallback, a broken one renders a torn-page glyph. The
  count is unknown until the migration reports it; if it is surprisingly large,
  stop and reconsider before running the drain.
- **Migration version must be chosen against remote, not the repo.** The local
  ceiling reads `20360901100100`, but a locally computed ceiling is not
  authoritative — `scripts/check-migration-versions.mjs` cannot see the applied
  set without `SUPABASE_ACCESS_TOKEN`, and CI can. Pick the version with headroom
  immediately before merge, not at authoring time.
- **The upstream seal could regress.** If GayCities ever re-emits S3 URLs, A
  drops them at parse time and D notices. Neither depends on this document being
  re-read.
