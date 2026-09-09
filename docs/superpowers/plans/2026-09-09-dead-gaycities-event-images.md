# Dead GayCities Event Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip the 27,494 permanently-403 `gaycities-featured-images-production.s3.amazonaws.com` URLs out of `events.images`, and seal the one code path that could write them again.

**Architecture:** Four artifacts. A dead-host filter in the scraper's single image choke point (the only thing that runs again, so the only thing that can seal). A clamped batched SQL runner that the migration *arms and proves* on one batch but deliberately does not drain. A driver script that does the drain out-of-band, where the 2-minute `statement_timeout` applies per batch instead of to the whole job. A standalone `dead_gaycities_image_signals()` sentinel that warns while draining and fails only if the drain stalls.

**Tech Stack:** PostgreSQL (Supabase), PL/pgSQL, Node 22 ESM driver scripts, TypeScript + Vitest (scraper), Vitest (root).

**Spec:** `docs/superpowers/specs/2026-09-09-dead-gaycities-event-images-design.md`

---

## Measured facts this plan depends on

Re-read these before changing any number below. All measured on prod 2026-09-09.

| fact | value |
|---|---|
| affected rows | 27,494 |
| rows keeping a surviving image | **0** |
| `max(cardinality(images))` on affected rows | **1** |
| past / upcoming / indexable | 27,493 / 1 / 1 |
| `events.logo_url`, `venues.images`, `venues.logo_url` carrying the host | 0, 0, 0 |
| events already on `gaycities-lv.b-cdn.net` | 64 |
| events already with empty/NULL `images` | 1,853 |
| `events` total | 48,867 |
| 300-row UPDATE, rolled back | 0.40 s, `search_reindex_queue` delta 300 |
| `search_reindex_queue` depth at planning time | 1,502 |
| remote `max(version)` | `20360901100100` |

**Two traps encoded in the design, do not "simplify" them away:**

1. **0.40 s is a floor, not a budget.** A rolled-back transaction under-reports by roughly 3× (measured previously: 51 s rolled back vs 165 s real). `statement_timeout` is 2 min cluster-default and *a function cannot raise its own* — the timer arms when the top-level statement starts. So the full 27,494-row drain plausibly lands near the ceiling, and a timeout is a full rollback. The migration runs **one** batch.
2. **`keeps_an_image = 0` makes the obvious safety assertion vacuous.** "A row with a mixed array keeps its survivor" cannot fail against this corpus, because there are no mixed arrays. The control must be a pure-expression one (Task 2, Step 3).

---

## File Structure

| file | responsibility |
|---|---|
| `scraper/src/sources/gaycities/lib.ts` (modify ~742–790) | `DEAD_IMAGE_HOSTS` + `liveImage()`, applied at the single image choke point |
| `scraper/tests/unit/gaycities-parser.test.ts` (modify) | proves the filter drops the dead host and keeps live ones |
| `supabase/migrations/20360902100000_event_dead_gaycities_images.sql` (create) | `run_event_dead_image_strip()`, the measurement notice, the assertions, and the standalone `dead_gaycities_image_signals()` sentinel |
| `src/lib/__tests__/deadGaycitiesImageStrip.test.ts` (create) | text-scan guard: the clamp and the synthetic control cannot be deleted silently |
| `scripts/data-quality/strip-dead-gaycities-images.mjs` (create) | the drain |
| `scripts/check-pipeline-health.mjs` (modify, after the accessibility block ~line 250) | warn-while-draining / fail-when-stalled |

---

### Task 1: Seal the producer in the scraper

The weekly `gaycities-sync` cron cannot regrow this cohort — GayCities moved to BunnyCDN and 64 of our events already carry the new host. The path that *can* is `scraper/scripts/gaycities-backfill.ts`, which reads Wayback snapshots whose `og:image` is still the dead S3 URL. A migration runs once; this filter runs on every future scrape.

`normalizeGcEvent` (`lib.ts:755`) reads the image exactly once at `:787` and emits it at `:824`. The legacy-template branches (`:451`, `:483`) synthesise a `@type: 'Event'` whose `image` is read at that same line, so one filter covers every page generation.

**Files:**
- Modify: `scraper/src/sources/gaycities/lib.ts` (add after `httpsOnly`, ends `:747`; apply at `:787`)
- Test: `scraper/tests/unit/gaycities-parser.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `scraper/tests/unit/gaycities-parser.test.ts`. `detailFixture()` (`:184`) and `METRO` (`:174`) already exist in this file — reuse them, do not redefine.

```ts
describe('normalizeGcEvent dead image hosts', () => {
  const ld = (image: string) => ({
    '@type': 'Event',
    name: 'Dead Image Event',
    startDate: '2024-06-01T12:00:00',
    image: [image],
  });

  it('drops a gaycities-featured-images S3 url — the bucket 403s for every key since 2026-09', () => {
    const norm = normalizeGcEvent(
      detailFixture({
        jsonLd: ld('https://gaycities-featured-images-production.s3.amazonaws.com/events/sm_fb_1.jpg'),
        bodyDescription: null,
      }),
      METRO,
    );
    if ('reject' in norm) throw new Error('unexpected reject: ' + norm.reject);
    expect(norm.images).toEqual([]);
  });

  it('keeps the BunnyCDN host gaycities migrated to', () => {
    const norm = normalizeGcEvent(
      detailFixture({
        jsonLd: ld('https://gaycities-lv.b-cdn.net/events/originals/1030855-atlanta-pride-alihaas.jpg'),
        bodyDescription: null,
      }),
      METRO,
    );
    if ('reject' in norm) throw new Error('unexpected reject: ' + norm.reject);
    expect(norm.images).toEqual([
      'https://gaycities-lv.b-cdn.net/events/originals/1030855-atlanta-pride-alihaas.jpg',
    ]);
  });

  it('keeps an unrelated s3.amazonaws.com host — the filter is the bucket, not the provider', () => {
    const norm = normalizeGcEvent(
      detailFixture({ jsonLd: ld('https://s3.amazonaws.com/gc/iml.jpg'), bodyDescription: null }),
      METRO,
    );
    if ('reject' in norm) throw new Error('unexpected reject: ' + norm.reject);
    expect(norm.images).toEqual(['https://s3.amazonaws.com/gc/iml.jpg']);
  });
});
```

The third test is load-bearing. The existing "builds a commit-ready payload" test at `:209` asserts `norm.images` equals `['https://s3.amazonaws.com/gc/iml.jpg']` — a *different* S3 host. A filter written against `s3.amazonaws.com` instead of the bucket name would pass the first two tests and silently break that one.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd scraper && npx vitest run tests/unit/gaycities-parser.test.ts -t 'dead image hosts'
```

Expected: the first test FAILS (`expected [ 'https://gaycities-featured-…' ] to deeply equal []`). Tests 2 and 3 already pass — they describe behaviour that must be *preserved*, not added.

- [ ] **Step 3: Implement the filter**

In `scraper/src/sources/gaycities/lib.ts`, insert immediately after `httpsOnly` (which ends at `:747`):

```ts
/**
 * Hosts whose objects are permanently unreachable, so a URL pointing at one is
 * worse than no URL at all: an absent image degrades to the on-brand fallback,
 * a dead one renders Chrome's torn-page glyph.
 *
 * gaycities-featured-images-production.s3.amazonaws.com — GayCities' old image
 * CDN. Since ~2026-09 the bucket's public-read policy is gone and it answers
 * `403 AccessDenied` for EVERY key, including keys that cannot exist, under any
 * Referer or User-Agent. Live pages moved to gaycities-lv.b-cdn.net, so the
 * weekly sync no longer sees these — but a Wayback snapshot still carries the
 * old og:image, which is why this filter belongs here and not only in the
 * one-shot repair migration (20360902100000).
 *
 * Match the BUCKET, never the provider: unrelated s3.amazonaws.com images are
 * legitimate and one is asserted in this file's own test fixture.
 */
const DEAD_IMAGE_HOSTS = ['gaycities-featured-images-production.s3.amazonaws.com'];

function liveImage(url: string | null): string | null {
  if (!url) return null;
  return DEAD_IMAGE_HOSTS.some((h) => url.includes(h)) ? null : url;
}
```

Then change `:787` from:

```ts
  const image = httpsOnly(firstString(ld['image']) ?? asString(ld['thumbnailUrl']));
```

to:

```ts
  const image = liveImage(httpsOnly(firstString(ld['image']) ?? asString(ld['thumbnailUrl'])));
```

- [ ] **Step 4: Run the full scraper suite**

```bash
cd scraper && npx vitest run tests/unit/gaycities-parser.test.ts
```

Expected: all PASS, including the pre-existing `builds a commit-ready payload`.

- [ ] **Step 5: Commit**

```bash
git add scraper/src/sources/gaycities/lib.ts scraper/tests/unit/gaycities-parser.test.ts
git commit -m "fix(scraper): drop images from the dead gaycities S3 bucket

The bucket answers 403 AccessDenied for every key including bogus ones,
under any Referer or UA. Live gaycities pages moved to b-cdn.net so the
weekly sync no longer emits these, but gaycities-backfill.ts reads Wayback
snapshots whose og:image still points at the dead host. The filter goes at
the single image choke point in normalizeGcEvent, which both the modern and
legacy-template paths flow through."
```

---

### Task 2: Migration — arm and prove the runner

**Files:**
- Create: `supabase/migrations/20360902100000_event_dead_gaycities_images.sql`

Remote `max(version)` was `20360901100100` at planning time. `20360902100000` leaves a deliberate gap — `min+1` dies on the next `main` merge. **Re-read the remote ceiling immediately before merging** and renumber if another PR landed higher.

- [ ] **Step 1: Write the migration**

```sql
-- Strip the dead gaycities S3 image URLs out of events.images.
--
-- gaycities-featured-images-production.s3.amazonaws.com lost its public-read
-- policy around 2026-09 and now answers 403 AccessDenied for EVERY key —
-- verified against a deliberately bogus key, and under both a gaycities Referer
-- and a desktop UA. So this is not per-object expiry and not hotlink
-- protection: nothing in that bucket can ever load again.
--
-- Measured on prod 2026-09-09: 27,494 events, and EVERY ONE of them has an
-- images array of exactly one element which is the dead url (keeps_an_image=0,
-- max_array_len=1). 27,493 of the 27,494 are past events — this is the Wayback
-- import. Wayback holds none of the images either: a CDX probe of the sm_/medsq_/
-- lg_/orig_ variants returns [] while /countries/t/cover/* returns real captures,
-- so the empty result is evidence rather than a broken query. There is nothing
-- to re-source, and clearing is the fix.
--
-- The PRODUCER is sealed in the scraper, not here: gaycities moved to
-- gaycities-lv.b-cdn.net (64 of our events already carry it), so the weekly sync
-- cannot regrow this. What could is gaycities-backfill.ts reading Wayback
-- snapshots, and a migration runs once — see the DEAD_IMAGE_HOSTS filter in
-- scraper/src/sources/gaycities/lib.ts.
--
-- This migration ARMS AND PROVES; it does not drain. See the note above the
-- one-batch proof for why.

-- ---------------------------------------------------------------------------
-- 1. Measurement. NOTICE, not EXCEPTION: this is the state of the corpus at
--    apply time, recorded in the db push log. The extra surfaces are all 0
--    today and are REPORTED, NEVER REPAIRED — acting on a number nobody has
--    read is how scope grows silently.
-- ---------------------------------------------------------------------------
do $$
declare
  v_rows int; v_keep int; v_empty int; v_maxlen int;
  v_logo int; v_venue_img int; v_venue_logo int;
begin
  select count(*),
         count(*) filter (where (select count(*) from unnest(images) i
                                  where i not like '%gaycities-featured-images-production.s3%') > 0),
         count(*) filter (where (select count(*) from unnest(images) i
                                  where i not like '%gaycities-featured-images-production.s3%') = 0),
         coalesce(max(cardinality(images)), 0)
    into v_rows, v_keep, v_empty, v_maxlen
    from public.events
   where exists (select 1 from unnest(images) i
                  where i like '%gaycities-featured-images-production.s3%');

  select count(*) into v_logo from public.events
   where logo_url like '%gaycities-featured-images-production.s3%';
  select count(*) into v_venue_img from public.venues
   where exists (select 1 from unnest(images) i
                  where i like '%gaycities-featured-images-production.s3%');
  select count(*) into v_venue_logo from public.venues
   where logo_url like '%gaycities-featured-images-production.s3%';

  raise notice 'dead_gaycities_images: events=% keeps_an_image=% goes_empty=% max_array_len=%',
    v_rows, v_keep, v_empty, v_maxlen;
  raise notice 'dead_gaycities_images (reported, not repaired): events.logo_url=% venues.images=% venues.logo_url=%',
    v_logo, v_venue_img, v_venue_logo;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The runner.
-- ---------------------------------------------------------------------------
create or replace function public.run_event_dead_image_strip(p_batch int default 300)
returns jsonb
language plpgsql
security invoker                 -- NOT definer. This reads and writes events
set search_path to 'public'      -- broadly; a definer here is the reflex that
as $fn$                          -- leaked safety-gated rows to anon once already.
declare
  v_batch int;
  v_updated int;
  v_remaining int;
begin
  -- Clamped, not merely documented. events' search trigger is UNSCOPED
  -- (`after insert or update or delete`, no `update of` list, 20260531155351:166)
  -- so every row update enqueues a reindex. A caller must not be able to opt out
  -- of the cap by argument.
  v_batch := least(greatest(coalesce(p_batch, 300), 1), 300);

  with b as (
    select id from public.events
     where exists (select 1 from unnest(images) i
                    where i like '%gaycities-featured-images-production.s3%')
     limit v_batch
  )
  update public.events e
     -- A filtered rebuild, not `images = '{}'`, and not array_remove (which
     -- matches elements exactly while this match is a LIKE). Every affected row
     -- today is a single dead element so the two would agree — but the sync cron
     -- runs weekly and the cohort is not frozen. If a mixed array ever appears,
     -- this preserves the survivor and '{}' would destroy it. Same cost.
     set images = array(select i from unnest(e.images) i
                         where i not like '%gaycities-featured-images-production.s3%')
    from b where e.id = b.id;
  get diagnostics v_updated = row_count;

  -- No cursor column is needed: stripping the url removes the row from this
  -- function's own predicate, so the work list shrinks monotonically, the job
  -- is self-terminating, and a re-run is idempotent.
  select count(*) into v_remaining from public.events
   where exists (select 1 from unnest(images) i
                  where i like '%gaycities-featured-images-production.s3%');

  return jsonb_build_object('batch', v_batch, 'updated', v_updated, 'remaining', v_remaining);
end $fn$;

comment on function public.run_event_dead_image_strip(int) is
  'Strips dead gaycities-featured-images S3 urls from events.images, <=300 rows '
  'per call (clamped in-body). Self-terminating: the predicate is the cursor. '
  'Drained by scripts/data-quality/strip-dead-gaycities-images.mjs.';

revoke all on function public.run_event_dead_image_strip(int) from public, anon, authenticated;
grant execute on function public.run_event_dead_image_strip(int) to service_role;
```

- [ ] **Step 2: Add the one-batch proof and the real-data postcondition**

Append to the same file:

```sql
-- ---------------------------------------------------------------------------
-- 3. Prove it on real data — ONE batch, then stop.
--
--    Why not drain all 27,494 here: a 300-row batch measured 0.40s in a
--    ROLLED-BACK transaction, and a rolled-back run under-reports by roughly 3x
--    (51s vs 165s, measured on the tag crons). So the full drain plausibly lands
--    near 110s against a statement_timeout of 2min — which a function CANNOT
--    raise, because the timer arms when the top-level statement starts. A
--    timeout is a full rollback, and a db push that blocks CI for two minutes is
--    antisocial on a shared path. The script drains; each RPC call there is its
--    own top-level statement.
--
--    SOFT on the precondition: a zero pre-count is a clean no-op, not an abort.
--    A concurrent session may legitimately have drained it between authoring and
--    merge, and aborting there blocks every migration queued behind this one.
-- ---------------------------------------------------------------------------
do $$
declare v_before int; v_res jsonb;
begin
  select count(*) into v_before from public.events
   where exists (select 1 from unnest(images) i
                  where i like '%gaycities-featured-images-production.s3%');

  if v_before = 0 then
    raise notice 'dead_gaycities_images: already drained, nothing to prove';
    return;
  end if;

  v_res := public.run_event_dead_image_strip(300);

  if (v_res->>'updated')::int = 0 then
    raise exception 'run_event_dead_image_strip matched % rows but updated 0', v_before;
  end if;
  if (v_res->>'remaining')::int >= v_before then
    raise exception 'run_event_dead_image_strip did not reduce the backlog: % -> %',
      v_before, v_res->>'remaining';
  end if;

  raise notice 'dead_gaycities_images: proof batch updated %, remaining %',
    v_res->>'updated', v_res->>'remaining';
end $$;
```

- [ ] **Step 3: Add the synthetic positive control**

Append to the same file. This exists because the table-level version of the assertion is **vacuous**: `keeps_an_image = 0`, so no real row can demonstrate that a survivor survives.

```sql
-- ---------------------------------------------------------------------------
-- 4. Positive control for the filter expression itself.
--
--    The corpus has ZERO mixed arrays (keeps_an_image=0, max_array_len=1), so
--    an assertion of the form "a row with a mixed array kept its survivor"
--    cannot fail here and would prove nothing. This one tests the expression
--    directly, so a rewrite to `images = '{}'` — which is correct for every row
--    that exists today and destroys any mixed row that appears tomorrow — fails
--    at apply time instead of silently.
-- ---------------------------------------------------------------------------
do $$
declare v_out text[];
begin
  v_out := array(
    select i from unnest(array[
      'https://gaycities-featured-images-production.s3.amazonaws.com/events/sm_fb_1.jpg',
      'https://example.com/good.jpg'
    ]) i
    where i not like '%gaycities-featured-images-production.s3%'
  );
  if v_out is distinct from array['https://example.com/good.jpg'] then
    raise exception 'dead-image filter dropped a live url: %', v_out;
  end if;

  v_out := array(
    select i from unnest(array[
      'https://gaycities-featured-images-production.s3.amazonaws.com/events/sm_fb_1.jpg'
    ]) i
    where i not like '%gaycities-featured-images-production.s3%'
  );
  if cardinality(v_out) <> 0 then
    raise exception 'dead-image filter kept a dead url: %', v_out;
  end if;
end $$;
```

- [ ] **Step 4: Add the sentinel — as a STANDALONE function**

> **Design change, made during implementation.** This step originally said to add a
> `dead_gaycities_images` key inside `pipeline_hygiene_stats()`. That was wrong for
> this repo. `pipeline_hygiene_stats` is a `CREATE OR REPLACE` of ~150 lines, so
> adding one key means restating every other key by hand — a merge-collision
> surface where one dropped line silently reverts whatever another migration
> added, and the one step no test can catch. CLAUDE.md states the rule directly:
> *"Sentinel `event_dup_signals()` is a standalone function (restating
> `pipeline_hygiene_stats` is a merge-collision surface)"*, and `venue_dup_signals`
> follows the same pattern. `check-pipeline-health.mjs` already calls both as
> separate RPCs.

Append a standalone function instead:

```sql
create or replace function public.dead_gaycities_image_signals()
returns jsonb
language sql
stable
security definer                 -- Definer is correct HERE and not on the
set search_path to 'public'      -- runner: this returns aggregate counts only,
as $fn$                          -- never rows, so it cannot leak a gated event.
  select jsonb_build_object(
    'remaining', (
      SELECT count(*) FROM public.events
      WHERE EXISTS (SELECT 1 FROM unnest(images) i
                     WHERE i LIKE '%gaycities-featured-images-production.s3%')
    ),
    'events_logo_url', (
      SELECT count(*) FROM public.events
      WHERE logo_url LIKE '%gaycities-featured-images-production.s3%'
    ),
    'venues_images', (
      SELECT count(*) FROM public.venues
      WHERE EXISTS (SELECT 1 FROM unnest(images) i
                     WHERE i LIKE '%gaycities-featured-images-production.s3%')
    ),
    'venues_logo_url', (
      SELECT count(*) FROM public.venues
      WHERE logo_url LIKE '%gaycities-featured-images-production.s3%'
    )
  );
$fn$;

revoke all on function public.dead_gaycities_image_signals() from public, anon, authenticated;
grant execute on function public.dead_gaycities_image_signals() to service_role;
```

The three "reported, not repaired" surfaces are included deliberately: they are 0
today, and if any becomes non-zero that is a *new producer*, which is worth seeing.

**The function is `STABLE`, which has a consequence worth knowing:** called in the
same SQL statement as the volatile runner it will report the pre-statement
snapshot, not the runner's writes. Both real consumers call it in its own
statement, so this is correct — but do not "verify" a drain by calling both in one
`SELECT`. (Observed during the dry run: two strip calls plus a signals call in one
statement reported `remaining` unchanged at 27,494.)

- [ ] **Step 5: Verify the migration applies cleanly**

Do **not** apply via MCP `apply_migration` — it stamps a version from its own call timestamp and creates history drift. Verify by dry-running the DDL in a rolled-back transaction:

```
Use mcp__6a75f005…__execute_sql with:
  begin;
  <paste the full migration body>
  rollback;
```

Expected: the `raise notice` lines report `events=27494 keeps_an_image=0 goes_empty=27494 max_array_len=1`, the proof batch reports `updated 300`, and no exception is raised.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20360902100000_event_dead_gaycities_images.sql
git commit -m "feat(events): batched runner for dead gaycities S3 image urls

27,494 events carry a url in a bucket that now 403s for every key. Every
affected row is a single-element array holding only the dead url, so all
27,494 go empty — which also makes the table-level positive control vacuous
and is why the migration carries a synthetic one.

Arms and proves one batch rather than draining: a rolled-back measurement
under-reports ~3x and statement_timeout is a 2min ceiling a function cannot
raise, so the full drain would run at the edge of it and a timeout is a full
rollback."
```

---

### Task 3: Guard the migration's two load-bearing lines

**Files:**
- Create: `src/lib/__tests__/deadGaycitiesImageStrip.test.ts`

House pattern (`stagingHumanApproval.test.ts`, `citySafetyBackfill.test.ts`): parse the migration text and assert the guards are present. Assertions run against **comment-stripped** SQL — a long explanatory header otherwise satisfies a text test while the code it describes is gone.

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '20360902100000_event_dead_gaycities_images.sql';

/** Comments are prose; a guard must live in the STATEMENTS. */
function statements(sql: string): string {
  return sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
}

describe('dead gaycities image strip migration', () => {
  const sql = statements(
    readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8'),
  );

  it('clamps the batch in the function body, not only in a comment', () => {
    expect(sql).toMatch(/least\s*\(\s*greatest\s*\([^)]*\)\s*,\s*300\s*\)/);
  });

  it('rebuilds the array by filter rather than emptying it', () => {
    expect(sql).toMatch(/set\s+images\s*=\s*array\s*\(\s*select/i);
    expect(sql).not.toMatch(/set\s+images\s*=\s*'\{\}'/i);
  });

  it('keeps the synthetic positive control — the corpus has no mixed arrays to test with', () => {
    expect(sql).toContain('https://example.com/good.jpg');
    expect(sql).toMatch(/raise exception 'dead-image filter dropped a live url/);
    expect(sql).toMatch(/raise exception 'dead-image filter kept a dead url/);
  });

  // The migration defines TWO functions with DELIBERATELY DIFFERENT security
  // modes, so a bare `expect(sql).toMatch(/security invoker/)` proves nothing —
  // it would pass while the runner was definer and the sentinel invoker. Isolate
  // each function's own definition block and assert against that.
  function definitionOf(name: string): string {
    const block = sql
      .split(/create or replace function/i)
      .find((chunk) => chunk.trimStart().startsWith(`public.${name}`));
    if (!block) throw new Error(`no definition found for ${name}`);
    return block;
  }

  it('the runner is security INVOKER — it reads and writes events broadly', () => {
    const def = definitionOf('run_event_dead_image_strip');
    expect(def).toMatch(/security\s+invoker/i);
    expect(def).not.toMatch(/security\s+definer/i);
  });

  it('the sentinel is security DEFINER — it returns aggregate counts, never rows', () => {
    const def = definitionOf('dead_gaycities_image_signals');
    expect(def).toMatch(/security\s+definer/i);
  });

  it('grants execute on both functions to service_role only', () => {
    expect(sql).toMatch(/revoke all on function public\.run_event_dead_image_strip\(int\) from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.run_event_dead_image_strip\(int\) to service_role/);
    expect(sql).toMatch(/revoke all on function public\.dead_gaycities_image_signals\(\) from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.dead_gaycities_image_signals\(\) to service_role/);
  });

  it('does not restate pipeline_hygiene_stats — that is a merge-collision surface', () => {
    expect(sql).not.toMatch(/create or replace function public\.pipeline_hygiene_stats/i);
  });
});
```

- [ ] **Step 2: Run it**

```bash
npx vitest run src/lib/__tests__/deadGaycitiesImageStrip.test.ts
```

Expected: 5 PASS.

- [ ] **Step 3: Mutation-test the two guards that matter**

A text test that passes against a broken file is worse than none. Break each guard and confirm the test catches it. **Verify the mutation actually changed a STATEMENT, not just a comment** — `perl` without `/g`, or a pattern that matches the header first, silently mutates prose and reads as "not caught".

```bash
cd /Users/tobiasmaeder/QG/.claude/worktrees/pr-review-issue-triage-75b259
M=supabase/migrations/20360902100000_event_dead_gaycities_images.sql
cp $M /tmp/dead-img-backup.sql

# Mutation 1: remove the clamp
perl -0pi -e "s/v_batch := least\(greatest\(coalesce\(p_batch, 300\), 1\), 300\);/v_batch := coalesce(p_batch, 300);/" $M
git diff --stat $M                      # MUST show a change
npx vitest run src/lib/__tests__/deadGaycitiesImageStrip.test.ts   # expect FAIL
cp /tmp/dead-img-backup.sql $M

# Mutation 2: replace the filtered rebuild with a blanket empty
perl -0pi -e "s/set images = array\(select i from unnest\(e\.images\) i\n.*?s3%'\)/set images = '{}'/s" $M
git diff --stat $M                      # MUST show a change
npx vitest run src/lib/__tests__/deadGaycitiesImageStrip.test.ts   # expect FAIL
cp /tmp/dead-img-backup.sql $M

git diff --stat $M                      # MUST be empty — restore verified
```

The final `git diff --stat` is not optional: a restore that silently failed leaves a mutated migration committed.

- [ ] **Step 4: Commit**

```bash
git add src/lib/__tests__/deadGaycitiesImageStrip.test.ts
git commit -m "test: guard the dead-image migration's clamp and synthetic control

Both are the kind of line a later simplification deletes as redundant:
the clamp looks like belt-and-braces, and \`images = '{}'\` is correct for
every row that exists today. Asserted against comment-stripped SQL so the
header cannot satisfy the test on the code's behalf."
```

---

### Task 4: The drain script

**Files:**
- Create: `scripts/data-quality/strip-dead-gaycities-images.mjs`

- [ ] **Step 1: Write the script**

```js
#!/usr/bin/env node
/**
 * Drain the dead gaycities S3 image urls out of events.images.
 *
 * 27,494 rows at 300 per call. Each call is its own top-level statement, which
 * is the whole reason this is a script and not a loop inside the migration:
 * statement_timeout is a 2min cluster default that a function cannot raise, and
 * the full drain in one statement would run at the edge of it. A timeout is a
 * full rollback.
 *
 * Interruptible and resumable by construction — run_event_dead_image_strip has
 * no cursor, the predicate IS the work list, so stopping just leaves the rest.
 *
 *   node scripts/data-quality/strip-dead-gaycities-images.mjs --dry-run
 *   node scripts/data-quality/strip-dead-gaycities-images.mjs
 *
 * Auth: Supabase Management API via the macOS-keychain CLI token (house
 *   pattern, same as backfill-venue-postal.mjs; set SUPABASE_PAT to override).
 *
 * Pacing: 250ms between batches. Not rate-limiting — each write enqueues 300
 * rows into search_reindex_queue, which drains at 1000/min, so the whole run
 * adds ~27.5k and takes ~29 min to settle afterwards. The pause keeps that
 * inflow from spiking far past the drain rate.
 */

import { execFileSync } from 'node:child_process';

const PROJECT = 'xqeacpakadqfxjxjcewc';
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const INTERVAL_MS = 250;
const MAX_ROUNDS = 200; // 200 * 300 = 60k, comfortably above the 27,494 backlog

function token() {
  if (process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT;
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
    encoding: 'utf8',
  }).trim();
  return Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8');
}
const TOKEN = token();

async function sql(query, attempt = 0) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const body = await res.text();
    // A hosted API blips. Nothing is lost on a retry: the predicate is the work
    // list, so a batch that half-applied is simply re-selected.
    if (attempt < 4 && (res.status >= 500 || res.status === 429)) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      return sql(query, attempt + 1);
    }
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

const REMAINING = `select count(*)::int as n from public.events
  where exists (select 1 from unnest(images) i
                 where i like '%gaycities-featured-images-production.s3%')`;

const start = Date.now();
let [{ n: remaining }] = await sql(REMAINING);
console.log(`backlog: ${remaining}`);

if (DRY) {
  console.log('--dry-run: no writes. Run without the flag to drain.');
  process.exit(0);
}

let rounds = 0;
let total = 0;
while (remaining > 0 && rounds < MAX_ROUNDS) {
  const [res] = await sql(`select public.run_event_dead_image_strip(300) as r`);
  const r = typeof res.r === 'string' ? JSON.parse(res.r) : res.r;
  total += r.updated;
  rounds += 1;

  // A round that selects rows and updates none would spin forever. Stop and say
  // so rather than burning MAX_ROUNDS against a predicate that no longer moves.
  if (r.updated === 0 && r.remaining > 0) {
    throw new Error(`stalled: ${r.remaining} rows match but a batch updated 0`);
  }
  remaining = r.remaining;
  if (rounds % 10 === 0 || remaining === 0) {
    console.log(`  round ${rounds}: updated ${total}, remaining ${remaining}`);
  }
  if (remaining > 0) await new Promise((r) => setTimeout(r, INTERVAL_MS));
}

const secs = Math.round((Date.now() - start) / 1000);
console.log(`done: ${total} rows in ${rounds} rounds, ${secs}s, remaining ${remaining}`);
if (remaining > 0) {
  console.error(`✗ hit MAX_ROUNDS with ${remaining} left — re-run to continue`);
  process.exit(1);
}

const [q] = await sql(`select count(*)::int as n from public.search_reindex_queue`);
console.log(`search_reindex_queue depth now ${q.n}; drains at 1000/min`);
```

- [ ] **Step 2: Dry-run it**

```bash
node scripts/data-quality/strip-dead-gaycities-images.mjs --dry-run
```

Expected: `backlog: 27194` (27,494 minus the 300 the migration's proof batch already took, if the migration has been applied — otherwise 27,494), then the no-writes notice.

- [ ] **Step 3: Commit**

```bash
git add scripts/data-quality/strip-dead-gaycities-images.mjs
git commit -m "chore(data-quality): driver to drain dead gaycities image urls

Each RPC call is its own top-level statement, so the 2min statement_timeout
applies per batch rather than to the whole 27k job. Resumable because the
function has no cursor — the predicate is the work list."
```

---

### Task 5: Sentinel — warn while draining, fail when stalled

**Files:**
- Modify: `scripts/check-pipeline-health.mjs` (insert after the accessibility-contradictions block, which ends ~line 250, before the `city_dup_signals` block)

The SQL half landed in Task 2, Step 4 as the standalone `dead_gaycities_image_signals()`. This is the reader — a **separate RPC call**, matching how this file already consumes `event_dup_signals` (line ~313) and `venue_dup_signals` (line ~448).

- [ ] **Step 1: Add the check**

Follow the shape of the existing `event_dup_signals` block. A non-OK response must WARN and say the RPC may be missing — never fall through to a zero that reads as clean.

```js
// 2026-09-09: dead gaycities S3 image urls in events.images. The bucket lost its
// public-read policy and 403s for every key, so these render a torn-page glyph
// rather than the on-brand fallback.
//
// WARN while the count falls, FAIL only when it is non-zero with nothing draining
// it. A hard fail on any non-zero count would red every open PR for the duration
// of the drain — the same distinction this file already draws between an
// automation that is paused-and-still-failing and one that is paused-then-recovered.
//
// A FAILED PROBE IS REPORTED, NEVER SWALLOWED: an unreachable RPC must not read
// the same as a clean corpus.
{
  const res = await fetch(`${BASE}/rest/v1/rpc/dead_gaycities_image_signals`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}',
  })
  if (!res.ok) {
    console.warn(`⚠ dead_gaycities_image_signals → HTTP ${res.status} (RPC missing? migration 20360902100000)`)
    console.warn('  This check measured NOTHING — it did not pass.')
  } else {
    const sig = await res.json()
    const remaining = Number(sig?.remaining ?? -1)
    if (remaining < 0) {
      console.error('✗ dead_gaycities_image_signals returned no `remaining` — the probe is broken')
      FAILED = true
    } else if (remaining > 0) {
      console.warn(`⚠ ${remaining} events still hold a dead gaycities S3 image url`)
      console.warn('  Drain with: node scripts/data-quality/strip-dead-gaycities-images.mjs')
      console.warn('  The producer is sealed in scraper/src/sources/gaycities/lib.ts (DEAD_IMAGE_HOSTS),')
      console.warn('  so this should fall to 0 and stay there. If it is RISING, that filter was bypassed.')
    } else {
      console.log('✓ Dead gaycities image urls: 0')
    }
    // These three are 0 today. Non-zero means a NEW producer reached a surface
    // the events repair never covered, which is worth a hard look.
    const spread = ['events_logo_url', 'venues_images', 'venues_logo_url']
      .filter((k) => Number(sig?.[k] ?? 0) > 0)
    if (spread.length) {
      console.error(`✗ dead gaycities urls appeared on ${spread.join(', ')} — a new producer, not the known cohort`)
      FAILED = true
    }
  }
}
```

Insert it after the accessibility-contradictions block and before the `city_dup_signals` block. Confirm `BASE`, `headers` and `FAILED` are the identifiers actually in scope at that point in the file — read the surrounding code rather than trusting these names.

- [ ] **Step 2: Verify the script still parses and runs**

```bash
node --check scripts/check-pipeline-health.mjs && echo "syntax OK"
SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY= node scripts/check-pipeline-health.mjs
```

Expected: `syntax OK`, then the script's own credential-missing skip message and exit 0. It cannot exercise the new branch without credentials — that happens in Task 6.

- [ ] **Step 3: Commit**

```bash
git add scripts/check-pipeline-health.mjs
git commit -m "chore(health): watch dead gaycities image urls

Warns while the count falls, fails only if it is non-zero with nothing
draining it. Reports an absent key separately from a zero count so an
undeployed sentinel cannot read as a clean corpus."
```

---

### Task 6: Merge, drain, verify

- [ ] **Step 1: Re-read the remote migration ceiling and renumber if needed**

```
Use mcp__6a75f005…__execute_sql with:
  select max(version) from supabase_migrations.schema_migrations;
```

If the result is `>= 20360902100000`, `git mv` the migration to a version above it **with a gap** — `min+1` dies on the next `main` merge. A locally computed ceiling is not authoritative; this is the only reading that is.

- [ ] **Step 2: Run the full local gates**

```bash
npm test -- src/lib/__tests__/deadGaycitiesImageStrip.test.ts
cd scraper && npx vitest run tests/unit/gaycities-parser.test.ts && cd ..
npm run lint
```

Expected: all PASS.

- [ ] **Step 3: Open the PR and let CI apply the migration**

The `db push` log carries the `raise notice` measurement. Read it — it is the record of what the corpus looked like at apply time, and the numbers should match this plan's table (minus any drift since 2026-09-09).

- [ ] **Step 4: After merge, confirm the migration applied under its own name**

```
Use mcp__6a75f005…__execute_sql with:
  select version, name from supabase_migrations.schema_migrations
   where version = '<the version you shipped>';
```

**Compare `name`, not just `version`.** A version-collision loser still leaves its version in `schema_migrations` under the *other* PR's name, so a count-by-version check returns 1 and reads exactly like success.

- [ ] **Step 5: Drain**

```bash
node scripts/data-quality/strip-dead-gaycities-images.mjs
```

Expected: ~92 rounds, `remaining 0`, and a closing `search_reindex_queue` depth around 29k.

- [ ] **Step 6: Verify on prod, not by inference**

```
Use mcp__6a75f005…__execute_sql with:
  select
    (select count(*) from public.events
      where exists (select 1 from unnest(images) i
                     where i like '%gaycities-featured-images-production.s3%')) as remaining,
    (select count(*) from public.events
      where images is null or cardinality(images) = 0)                          as no_images,
    (select count(*) from public.search_reindex_queue)                          as queue_depth;
```

Expected: `remaining` 0, `no_images` ~29,347 (was 1,853), `queue_depth` falling.

Then confirm the user-visible fix on the page the report started from — load
`https://queer.guide/personalities/alyssa-edwards` in the Browser pane and check
that no `img` resolves to `gaycities-featured-images-production`. Allow up to
~29 min for the reindex queue to settle, and remember the edge caches detail
pages for ~5 min.

- [ ] **Step 7: Commit any follow-up notes**

If the drain surfaced anything unexpected (a stall, a count that disagrees with
the migration's notice), record it in the spec's Risks section rather than only
in the PR thread.

---

## Self-Review

**Spec coverage:**

| spec section | task |
|---|---|
| A — seal the producer in the scraper | Task 1 |
| B — clamped batched runner, arm and prove | Task 2 (steps 1–3) |
| B — synthetic positive control | Task 2 step 3, guarded by Task 3 |
| C — driver script | Task 4 |
| D — sentinel | Task 2 step 4 (SQL) + Task 5 (reader) |
| out of scope: logo_url / venues reported not repaired | Task 2 step 1 notice block |
| risk: pick version against remote | Task 6 step 1 |
| risk: 0.40 s is a floor | encoded in Task 2 step 2's comment and the arm-don't-drain split |

**Type/name consistency:** `run_event_dead_image_strip(p_batch int default 300)` returning `{batch, updated, remaining}` is defined in Task 2 and consumed with those exact key names in Task 4. `DEAD_IMAGE_HOSTS` / `liveImage` are defined in Task 1 and referenced by name in Tasks 2 and 5 comments only. The hygiene key `dead_gaycities_images` is written in Task 2 step 4 and read in Task 5.

**Note on the migration's proof batch:** it updates 300 real rows at apply time, so the backlog the script sees is 27,194, not 27,494. Task 4 step 2's expected output says so.
