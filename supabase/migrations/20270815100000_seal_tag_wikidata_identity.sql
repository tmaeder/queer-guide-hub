-- Seal the producer that manufactures wrong Wikidata identifiers on tags.
--
-- Two passes cleared 82 wrong identifiers (20270105100000, 20270120100000) and
-- merged 37 duplicate pairs. None of that is durable, because the machine that
-- made them is still running and its work list now SELECTS the rows we cleared:
--
--   tag-enrichment-sweep work list:
--     .or('description.is.null,and(wikidata_id.is.null,wikipedia_url.is.null)')
--
-- A retracted tag is exactly `wikidata_id IS NULL AND wikipedia_url IS NULL`.
-- Measured before this migration: 81 of the 82 rows cleared today were already
-- back in that work list, 609 across the whole cleared cohort, cron enabled.
-- The next run would re-resolve `switch` by NAME and re-adopt the Nintendo
-- Switch console.
--
-- WHY THE EXISTING GUARD IS NOT ENOUGH. _shared/tag-wiki-guard.ts is real and
-- it works, but it lives in ONE CALLER: it decides whether the sweep calls
-- tag_enrichment_apply(). The RPC itself takes p_wikidata_id and writes it with
-- no validation whatsoever, and it is SECURITY DEFINER. Anything that reaches
-- the RPC or the table directly -- a migration, a script, psql, a future
-- function -- bypasses the guard entirely. That is the same shape as the
-- accessibility contradiction fix: the invariant has to sit on the TABLE,
-- unscoped, not in whichever writer we happen to be looking at.
--
-- Nor is the guard sufficient on its own even for the sweep, because its
-- strongest gate is TITLE AGREEMENT, and title agreement is precisely what the
-- worst survivors satisfy: the Wikipedia article for "Support" is titled
-- "Support", so `support` re-adopts a painting-canvas identifier while passing
-- every gate. The generic-sense gate only covers SENSE categories, and
-- `support` (Community Life & Support) and `workshop` (Events & Parties) are
-- not among them.
--
-- WHAT IS SEALED, in the database, for every writer:
--
--   1. FORMAT. wikidata_id must look like a QID or be null. Cheap, and it stops
--      a whole class of garbage before it can be reasoned about.
--   2. NO RE-ADOPTION. A tag whose identifier was cleared may not be given that
--      SAME identifier again. This is the precise predicate that
--      tag_wikidata_repair_regressions() already reports -- the detector has
--      existed since 2026-08-29 and has only ever been able to describe the
--      regression after it shipped. Same predicate, now a wall.
--   3. NO NEW DUPLICATES. Two ACTIVE tags may not share an identifier. This is
--      the entire class the 89-group pass spent a day draining.
--
-- The trigger is UNSCOPED (not `UPDATE OF wikidata_id`) and does its own
-- IS DISTINCT FROM test, because a column-scoped trigger fires on the columns
-- named in the STATEMENT, not on what another BEFORE trigger actually wrote --
-- the trap recorded in 20260807100200.
--
-- 27 duplicate groups still exist, left for human decisions. Rule 3 only fires
-- when wikidata_id CHANGES, so those rows are untouched and remain editable in
-- every other respect; they simply cannot be joined by a 28th.
--
-- ESCAPE HATCH, deliberately manual: if a human decides a cleared identifier
-- was right after all, update that tag's row in tag_wikidata_repair_audit
-- (disposition <> 'cleared') and the write is permitted. Re-linking should cost
-- a deliberate act, not be a thing a nightly sweep can do by itself.

create or replace function public.enforce_tag_wikidata_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_prev_slug text;
begin
  -- Only act when the identifier itself moves. An unscoped trigger with an
  -- explicit test sees what was actually written, including by other BEFORE
  -- triggers; `UPDATE OF wikidata_id` would not.
  if tg_op = 'UPDATE' and new.wikidata_id is not distinct from old.wikidata_id then
    return new;
  end if;

  -- Clearing is always allowed. Prefer NULL to a guess.
  if new.wikidata_id is null then
    return new;
  end if;

  -- 1. Format.
  if new.wikidata_id !~ '^Q[1-9][0-9]*$' then
    raise exception
      'tag wikidata identity: % is not a QID (tag %)', new.wikidata_id, new.slug
      using errcode = '23514';
  end if;

  -- 2. No re-adoption of an identifier this tag was cleared of.
  if exists (
    select 1 from public.tag_wikidata_repair_audit a
     where a.tag_id = new.id
       and a.disposition = 'cleared'
       and a.previous_wikidata_id = new.wikidata_id
  ) then
    raise exception
      'tag wikidata identity: % was retracted from "%" as wrong and may not be re-adopted; '
      'if that verdict was wrong, change its tag_wikidata_repair_audit row first',
      new.wikidata_id, new.slug
      using errcode = '23514';
  end if;

  -- 3. No NEW duplicate across active tags.
  select t.slug into v_prev_slug
    from public.unified_tags t
   where t.wikidata_id = new.wikidata_id
     and t.status = 'active'
     and t.id <> new.id
   limit 1;

  if v_prev_slug is not null then
    raise exception
      'tag wikidata identity: % is already held by active tag "%" (writing to "%"); '
      'two active tags sharing an identifier is the duplicate class, not a synonym',
      new.wikidata_id, v_prev_slug, new.slug
      using errcode = '23505';
  end if;

  return new;
end;
$fn$;

comment on function public.enforce_tag_wikidata_identity() is
  'Table-level seal on unified_tags.wikidata_id: QID format, no re-adoption of a '
  'cleared identifier, no new duplicate across active tags. Unscoped BEFORE trigger '
  'because the column has several writers and tag-wiki-guard.ts only covers one.';

drop trigger if exists trg_unified_tags_wikidata_identity on public.unified_tags;
create trigger trg_unified_tags_wikidata_identity
  before insert or update on public.unified_tags
  for each row execute function public.enforce_tag_wikidata_identity();

-- Keep the sweep healthy rather than merely blocked. Without this the nightly
-- run would re-select all 609 cleared rows, spend a Wikipedia lookup on each,
-- and then hit the trigger -- an exception per row aborts the statement, so the
-- RPC refuses gracefully instead and the sweep records it and moves on. The
-- trigger stays as the backstop for every writer that does not come through here.
-- The DEFAULTs are load-bearing and must be restated verbatim: a
-- CREATE OR REPLACE that omits them fails outright with 42P13 "cannot remove
-- parameter defaults from existing function" (found by dry-running this), and
-- the sweep calls this RPC with named arguments, omitting the ones it does not
-- need -- so silently losing the defaults would break every caller.
create or replace function public.tag_enrichment_apply(
  p_tag_id uuid,
  p_kind text,
  p_category_id uuid default null::uuid,
  p_category text default null::text,
  p_wikidata_id text default null::text,
  p_wikipedia_url text default null::text,
  p_description text default null::text
) returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare v_row unified_tags%rowtype;
begin
  perform set_config('app.actor', 'llm:tag-enrichment-sweep', true);

  select * into v_row from unified_tags where id = p_tag_id and status = 'active';
  if not found then return false; end if;

  -- The cursor stamp is not content and must never be blocked.
  if p_kind = 'prose_cursor' then
    update unified_tags set prose_reviewed_at = now() where id = p_tag_id;
    return true;
  end if;

  -- Content kinds only; `links` is identity and stays reachable.
  if p_kind <> 'links' and (v_row.is_sensitive or v_row.is_adult) then
    raise exception 'tag_enrichment_apply: % is sensitive/adult — review path only', p_tag_id;
  end if;
  if v_row.human_reviewed then return false; end if;

  if p_kind = 'category' then
    update unified_tags
       set category_id = p_category_id, category = p_category
     where id = p_tag_id;
  elsif p_kind = 'links' then
    -- Refuse, without raising, the two states the trigger would reject. A raise
    -- here would abort the sweep's statement; a false is a countable refusal.
    if p_wikidata_id is not null and exists (
      select 1 from public.tag_wikidata_repair_audit a
       where a.tag_id = p_tag_id and a.disposition = 'cleared'
         and a.previous_wikidata_id = p_wikidata_id
    ) then
      return false;
    end if;
    if p_wikidata_id is not null and exists (
      select 1 from public.unified_tags t
       where t.wikidata_id = p_wikidata_id and t.status = 'active' and t.id <> p_tag_id
    ) then
      return false;
    end if;
    update unified_tags
       set wikidata_id = p_wikidata_id, wikipedia_url = p_wikipedia_url, updated_at = now()
     where id = p_tag_id;
  elsif p_kind = 'description' then
    update unified_tags
       set description = p_description, updated_at = now()
     where id = p_tag_id;
  else
    raise exception 'tag_enrichment_apply: unknown kind %', p_kind;
  end if;

  return true;
end;
$fn$;

-- Prove the seal on the way in, against real rows, rather than trusting that
-- the trigger was created. Each probe runs in a savepoint and is rolled back.
do $verify$
declare
  v_tag   uuid;
  v_qid   text;
  v_dup   text;
  v_ok    boolean;
begin
  -- Every probe below WRITES to a real row, so declare an actor:
  -- log_unified_tag_change() raises when an undeclared system:% actor touches a
  -- human_reviewed row, and that would fail this block for the wrong reason.
  perform set_config('app.actor', 'admin:tag-wikidata-seal-verify', true);

  select a.tag_id, a.previous_wikidata_id into v_tag, v_qid
    from public.tag_wikidata_repair_audit a
    join public.unified_tags t on t.id = a.tag_id
   where a.disposition = 'cleared' and t.status = 'active'
     and t.wikidata_id is null and a.previous_wikidata_id is not null
   limit 1;

  if v_tag is null then
    raise exception 'seal verification has no subject: no cleared tag to probe';
  end if;

  -- (a) re-adoption of an identifier this tag was cleared of
  begin
    update public.unified_tags set wikidata_id = v_qid where id = v_tag;
    raise exception 'SEAL FAILED: re-adoption of % was permitted', v_qid;
  exception when sqlstate '23514' then null;
  end;

  -- (b) a duplicate of an identifier an active tag already holds
  select t.wikidata_id into v_dup
    from public.unified_tags t
   where t.status = 'active' and t.wikidata_id is not null and t.id <> v_tag
   limit 1;
  begin
    update public.unified_tags set wikidata_id = v_dup where id = v_tag;
    raise exception 'SEAL FAILED: duplicate of % was permitted', v_dup;
  exception when sqlstate '23505' then null;
  end;

  -- (c) a malformed identifier
  begin
    update public.unified_tags set wikidata_id = 'not-a-qid' where id = v_tag;
    raise exception 'SEAL FAILED: malformed identifier was permitted';
  exception when sqlstate '23514' then null;
  end;

  -- (d) POSITIVE CONTROL. A seal that refuses everything is a wall, and all
  --     three probes above would pass against one. A legitimate identifier --
  --     well-formed, never cleared from this tag, held by nobody -- must still
  --     be accepted. The write is rolled back through the block's own
  --     savepoint rather than undone by a second write, so nothing commits and
  --     no change-log rows are left behind.
  select 'Q' || (max(replace(wikidata_id, 'Q', '')::bigint) + 1000)::text into v_qid
    from public.unified_tags where wikidata_id ~ '^Q[1-9][0-9]*$';

  begin
    update public.unified_tags set wikidata_id = v_qid where id = v_tag;
    select wikidata_id = v_qid into v_ok from public.unified_tags where id = v_tag;
    raise exception 'ROLLBACK_PROBE';
  exception
    when sqlstate '23514' or sqlstate '23505' then
      raise exception 'SEAL TOO TIGHT: legitimate identifier % was refused', v_qid;
    when others then
      if sqlerrm <> 'ROLLBACK_PROBE' then raise; end if;
  end;

  if not coalesce(v_ok, false) then
    raise exception 'SEAL TOO TIGHT: legitimate identifier % did not land', v_qid;
  end if;

  raise notice 'tag wikidata seal verified: re-adoption, duplicate and malformed refused; legitimate write allowed';
end
$verify$;
