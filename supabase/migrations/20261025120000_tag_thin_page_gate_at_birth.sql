-- Tag thin pages: close the weekly window at the source, and stop the drain
-- reversing decisions it did not make.
--
-- =============================================================================
-- Part 1 — the producer/drain race
-- =============================================================================
--
-- `pipeline-tags-ingestion` (pg_cron `0 5 * * 0`) lands its batch Sunday
-- 05:00-05:02. `tag_thin_page_reindex` (`20 4 * * *`) is the ONLY drain, and it
-- runs 40 minutes EARLIER, so every Sunday's tags stay `seo_indexable` for ~23
-- hours. Measured on prod 2026-08-30:
--
--   day          dow  created  thin  first     last
--   2026-08-30   Sun  140      137   02:24     05:01
--   2026-08-23   Sun  169      121   05:01     16:02
--   2026-08-16   Sun  159      103   05:01     10:54
--   2026-08-09   Sun   73       59   05:00     05:00
--   2026-08-02   Sun   28       16   05:00     05:00
--
-- Over 120 days: Sunday 1,811 created / 1,570 thin; Saturday 201 created and
-- ZERO thin; the only other thin batches are two one-offs (2026-05-14,
-- 2026-06-10). One weekly producer, one daily drain, ordered by wall clock.
--
-- The cost is not only SEO. `indexable_without_description` is a HARD gate in
-- scripts/check-tag-hygiene.mjs, and that gate READS PROD rather than the PR —
-- so for ~23 hours every Sunday it reads 137+ and fails EVERY open pull request
-- in the repo, for a change none of those authors made. It failed #3208 that
-- way, and it was cleared by hand with `run_tag_thin_page_reindex(400)`.
--
-- Moving the drain to `30 5 * * *` would shorten the window to half an hour. It
-- would still BE a window, still ordered by luck, and it would break again the
-- first time the pipeline runs long or a second producer lands at another hour.
-- The actual bug is one column default: `unified_tags.seo_indexable` DEFAULTs to
-- TRUE, so any producer that never names the column publishes a thin page. This
-- makes a thin tag non-indexable AT BIRTH — there is no window left to shorten,
-- and both cron schedules stay exactly where they are.
--
-- Precedent, deliberately copied: `enforce_tag_seo_sensitivity_gate`
-- (20260607143000) is the same shape — a BEFORE trigger that only ever forces
-- `seo_indexable := false` on NEW, so there are no cross-row writes and no
-- re-entrancy. `seo_indexable` is not in `trg_search_documents_tag`'s column
-- scope, so none of this fans out into a search reindex.
--
-- =============================================================================
-- Part 2 — the drain reverses decisions it did not make
-- =============================================================================
--
-- Found while measuring part 1. `run_tag_thin_page_reindex`'s re-index arm says
-- "Only reverse OUR decision" and implements that as `not is_sensitive and not
-- is_adult` — which covers the sensitivity gate and NOTHING ELSE. At exactly
-- 04:20:00 on 2026-08-30 it re-indexed 82 of the 304 tags that
-- 20261007160100_kinktionary_verbatim_overlap_deindex had deliberately
-- deindexed for carrying verbatim-copied prose (actor `job:tag_thin_page_reindex`
-- in `tag_change_log`, 82 flips, one timestamp). The other 222 survived only
-- because they happen to be `is_adult`.
--
-- Across the whole corpus, 169 active tags are indexable today whose last
-- true->false flip was made by somebody OTHER than that job and whose last
-- false->true flip was made BY it — 82 + 47 from the two overlap migrations, 20
-- from the prose-defect retraction, 16 from an admin pass, and a handful more.
-- For all of them the description has not changed since the deindex, so the
-- reason it was deindexed still holds; the page was republished purely because
-- the drain could not tell why it was down.
--
-- `retract_tag_prose` (20261015093000) is not affected: it nulls the prose in
-- the same UPDATE, so the re-index arm cannot see those rows at all.
--
-- Root cause of BOTH halves: `seo_indexable` is a bare boolean with no reason
-- attached, so every writer can silently undo every other writer's decision.
-- `seo_deindex_reason` fixes that, and the rule is DEFAULT-DENY: only 'thin' is
-- ever reversed automatically, so an unrecognised or misspelled reason fails
-- safe (stays deindexed) instead of republishing a page.

-- ---------------------------------------------------------------------------
-- 1. The reason column.

alter table public.unified_tags
  add column if not exists seo_deindex_reason text;

comment on column public.unified_tags.seo_deindex_reason is
  'Why seo_indexable is false. Only ''thin'' is reversible — run_tag_thin_page_reindex() re-indexes a row when prose arrives ONLY if it deindexed that row itself. Default-deny by design: any other value, a typo, and NULL alike are never auto-reversed, so a page deindexed by a writer that recorded no reason stays down. NULL while the tag is indexable, and also on a deindex made by something that did not stamp itself. Set by public.enforce_tag_thin_page_gate() and by run_tag_thin_page_reindex(); a migration or admin deindexing for its own reason should stamp its own value.';

-- One spelling of "does this tag have prose", shared by the trigger and the
-- sweep, so the two cannot drift. Same reasoning as public.is_marketplace_facet()
-- for the three spellings of "is this a marketplace facet".
create or replace function public.tag_has_prose(p_description text, p_short_description text)
returns boolean
language sql
immutable
parallel safe
as $fn$
  select coalesce(nullif(btrim(p_description), ''), p_short_description) is not null;
$fn$;

comment on function public.tag_has_prose(text, text) is
  'True when a tag has something a reader can read. The exact expression tag_hygiene_stats().indexable_without_description counts against.';

-- ---------------------------------------------------------------------------
-- 2. Thin at birth => not indexable.

create or replace function public.enforce_tag_thin_page_gate()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  -- Only ever forces false, and only stamps a reason when it is the one making
  -- the decision. A row already deindexed for some other reason is untouched,
  -- which is what keeps 'overlap'/'sensitivity'/'retraction' from being
  -- overwritten with 'thin' by an unrelated write.
  if new.seo_indexable is true
     and new.status = 'active'
     and new.merged_into_id is null
     and not public.tag_has_prose(new.description, new.short_description)
  then
    new.seo_indexable := false;
    new.seo_deindex_reason := 'thin';
  end if;
  return new;
end;
$fn$;

comment on function public.enforce_tag_thin_page_gate() is
  'Deindexes an active tag that has no description, at write time. Mirrors enforce_tag_seo_sensitivity_gate: BEFORE trigger, mutates NEW only, never writes another row. Makes tag_hygiene_stats().indexable_without_description a write-time invariant rather than a queue depth drained once a day.';

drop trigger if exists trg_tag_thin_page_gate on public.unified_tags;

-- `status` and `merged_into_id` are in scope on purpose: reviving a deprecated
-- tag (20260910181447 re-mints its redirects) is the one other way an
-- indexable-and-thin row can appear, and a column-scoped trigger only fires on
-- the columns named in the UPDATE statement.
-- Name sorts after trg_normalize_tag_input and trg_tag_seo_sensitivity_gate;
-- BEFORE triggers fire in name order and both of those only ever narrow what
-- this one then sees.
create trigger trg_tag_thin_page_gate
  before insert or update of description, short_description, seo_indexable, status, merged_into_id
  on public.unified_tags
  for each row execute function public.enforce_tag_thin_page_gate();

-- ---------------------------------------------------------------------------
-- 3. The sweep records why it deindexed, and reverses only its own decision.

create or replace function public.run_tag_thin_page_reindex(p_batch int default 400)
returns table (deindexed int, reindexed int)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_off int := 0; v_on int := 0;
begin
  perform public.assert_admin_or_internal();
  -- unified_tags carries an unscoped audit trigger and a column-scoped search
  -- trigger; batch so a sweep cannot storm either.
  set local statement_timeout = '120s';
  perform set_config('app.actor', 'job:tag_thin_page_reindex', true);

  -- Deindex: public, indexable, and nothing to read. Since 20261025120000 the
  -- BEFORE trigger has already caught these at write time, so this arm is a
  -- backstop that should normally find zero rows.
  with cand as (
    select id from unified_tags
     where status = 'active' and merged_into_id is null
       and seo_indexable
       and not public.tag_has_prose(description, short_description)
     order by id
     limit greatest(p_batch, 0)
  )
  update unified_tags u set seo_indexable = false, seo_deindex_reason = 'thin'
    from cand where u.id = cand.id;
  get diagnostics v_off = row_count;

  -- Re-index: the self-healing half. A tag that has since gained prose comes
  -- back. Without this the deindex is a one-way door and every future
  -- description would need a manual flag flip.
  with cand as (
    select id from unified_tags
     where status = 'active' and merged_into_id is null
       and not seo_indexable
       -- Only reverse OUR decision, and mean it. Until 20261025120000 this
       -- said `not is_sensitive and not is_adult`, which covers the sensitivity
       -- gate and nothing else — so on 2026-08-30 this arm republished 82 pages
       -- that a migration had deindexed for carrying verbatim-copied prose, and
       -- 169 corpus-wide. Default-deny: an unrecognised reason is never
       -- reversed.
       and seo_deindex_reason = 'thin'
       -- Kept as well as, not instead of: the sensitivity gate would force the
       -- row back to false on the next write anyway, so re-indexing it here
       -- only buys a wasted UPDATE and an audit row.
       and not is_sensitive and not is_adult
       and public.tag_has_prose(description, short_description)
     order by id
     limit greatest(p_batch, 0)
  )
  update unified_tags u set seo_indexable = true, seo_deindex_reason = null
    from cand where u.id = cand.id;
  get diagnostics v_on = row_count;

  deindexed := v_off; reindexed := v_on;
  return next;
end;
$fn$;

comment on function public.run_tag_thin_page_reindex(int) is
  'Backstop for enforce_tag_thin_page_gate: deindexes active tags with no description and re-indexes them once they gain prose. Re-indexes ONLY rows it deindexed itself (seo_deindex_reason = ''thin''); a page deindexed for overlap, retraction or sensitivity stays down however much prose it acquires.';

revoke all on function public.run_tag_thin_page_reindex(int) from public, anon;
grant execute on function public.run_tag_thin_page_reindex(int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Adopt the existing thin backlog, and ONLY that.
--
-- A deindexed row with no prose is thin by definition — 1,061 of them on prod —
-- and those must be stamped, because under the default-deny rule an unstamped
-- row would never come back when it gains prose. Everything else deindexed
-- keeps a NULL reason on purpose: 477 rows are down because they are
-- is_sensitive/is_adult, and 8 more were taken down by a concurrent wrong-sense
-- pass while this was being written (`darkroom` publishing prose about
-- photographic film, `flint` about sedimentary rock). Stamping those would be
-- guessing at another writer's intent, and it buys nothing — NULL and
-- 'sensitivity' behave identically here. That the set is open is the reason the
-- assertions below check the thin population rather than every deindexed row;
-- an invariant that fails whenever some other writer deindexes something is the
-- same "gate on an instantaneous count" mistake this migration exists to undo.
--
-- Declares an actor because 41 of the thin rows are human_reviewed and
-- log_unified_tag_change() RAISEs when a `system:%` actor touches one. It runs
-- inside a DO block so set_config(..., true) is scoped to a real transaction.

do $$
declare v_thin int;
begin
  perform set_config('app.actor', 'migration:tag-thin-page-gate', true);

  update public.unified_tags
     set seo_deindex_reason = 'thin'
   where status = 'active' and merged_into_id is null
     and not seo_indexable and seo_deindex_reason is null
     and not public.tag_has_prose(description, short_description);
  get diagnostics v_thin = row_count;

  raise notice 'seo_deindex_reason backfill: % thin', v_thin;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Put back the pages the sweep republished.
--
-- Defined by the defect rather than by a frozen id list: the last true->false
-- flip in tag_change_log was made by somebody other than the sweep, the last
-- false->true flip was made BY the sweep, and the description has not changed
-- since — so the reason the page was taken down still holds. Measured at 169
-- rows; the bound below is a runaway guard, not an expected count, because the
-- nightly sweep may add more between this being written and CI applying it.
--
-- The reason recorded is the actor that made the original decision. That is the
-- most honest statement available of why the page is down, and — being anything
-- other than 'thin' — it is never auto-reversed again.

do $$
declare v_n int;
begin
  perform set_config('app.actor', 'migration:tag-thin-page-gate', true);

  with flips as (
    select tag_id, created_at, actor,
           before_data->>'seo_indexable' as b,
           after_data->>'seo_indexable'  as a
      from public.tag_change_log
     where action_type = 'update'
       and (before_data->>'seo_indexable') is distinct from (after_data->>'seo_indexable')
  ),
  last_off as (
    select distinct on (tag_id) tag_id, actor, created_at
      from flips where b = 'true' and a = 'false'
     order by tag_id, created_at desc
  ),
  last_on as (
    select distinct on (tag_id) tag_id, actor, created_at
      from flips where b = 'false' and a = 'true'
     order by tag_id, created_at desc
  ),
  victims as (
    select t.id, left(lo.actor, 80) as reason
      from public.unified_tags t
      join last_off lo on lo.tag_id = t.id
      join last_on  ln on ln.tag_id = t.id
     where t.seo_indexable
       and t.status = 'active' and t.merged_into_id is null
       and ln.created_at > lo.created_at
       and lo.actor <> 'job:tag_thin_page_reindex'
       and ln.actor  =  'job:tag_thin_page_reindex'
       and not exists (
             select 1 from public.tag_change_log c
              where c.tag_id = t.id
                and c.created_at > lo.created_at
                and (c.before_data->>'description') is distinct from (c.after_data->>'description'))
  )
  update public.unified_tags u
     set seo_indexable = false, seo_deindex_reason = v.reason
    from victims v
   where u.id = v.id;
  get diagnostics v_n = row_count;

  raise notice 'republished pages restored: %', v_n;
  if v_n > 400 then
    raise exception 'restore matched % rows, expected ~169 — refusing to mass-deindex', v_n;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Assertions. The first is the counter the CI gate reads; asserting it here
-- is the same discipline 20261015093000 used.

do $$
declare v_bad int; v_unstamped int;
begin
  select count(*) into v_bad
    from public.unified_tags
   where status = 'active' and merged_into_id is null
     and seo_indexable
     and not public.tag_has_prose(description, short_description);
  if v_bad > 0 then
    raise exception 'indexable_without_description is % after the gate, expected 0', v_bad;
  end if;

  -- Scoped to the thin population deliberately — see step 4. A thin row with no
  -- reason is the one shape that silently loses its way back.
  select count(*) into v_unstamped
    from public.unified_tags
   where status = 'active' and merged_into_id is null
     and not seo_indexable and seo_deindex_reason is null
     and not public.tag_has_prose(description, short_description);
  if v_unstamped > 0 then
    raise exception '% thin deindexed tag(s) carry no seo_deindex_reason — they would never re-index', v_unstamped;
  end if;
end $$;

-- The gate proves itself: a thin tag cannot be made indexable.
do $$
declare v_id uuid; v_indexable boolean; v_reason text;
begin
  insert into public.unified_tags (name, slug, status)
  values ('Zz Thin Page Gate Probe', 'zz-thin-page-gate-probe', 'active')
  returning id into v_id;

  select seo_indexable, seo_deindex_reason into v_indexable, v_reason
    from public.unified_tags where id = v_id;
  if v_indexable is not false or v_reason <> 'thin' then
    raise exception 'gate did not fire on INSERT: seo_indexable=%, reason=%', v_indexable, v_reason;
  end if;

  update public.unified_tags set seo_indexable = true where id = v_id;
  select seo_indexable into v_indexable from public.unified_tags where id = v_id;
  if v_indexable is not false then
    raise exception 'gate did not fire on UPDATE OF seo_indexable';
  end if;

  update public.unified_tags set description = 'Probe prose.' where id = v_id;
  select seo_indexable into v_indexable from public.unified_tags where id = v_id;
  if v_indexable is not false then
    raise exception 'gate re-indexed on prose arrival — that is the sweep''s job, not the trigger''s';
  end if;

  delete from public.unified_tags where id = v_id;
end $$;
