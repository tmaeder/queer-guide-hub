-- Festival programme roles (docs/plans/2026-11-22-festival-multi-event-structure-design.md,
-- Phase 1 item 2).
--
-- A festival is an umbrella event plus children linked by events.parent_event_id. The only
-- per-child role today is events.pride_subtypes, a Pride-only vocabulary (parade, festival,
-- week, party, rally, community, film, sports, conference) that no admin surface can edit,
-- so a leather weekend or a film festival has no way to say "this is the main party" or
-- "this is a screening". This adds:
--
--   events.programme_role      text, closed vocabulary (CHECK below), NULL = not stated.
--   events.programme_official  boolean NOT NULL DEFAULT true. false = a satellite event:
--                              attached to the festival for readers, not run by it.
--
-- The closed list is mirrored in src/lib/programmeRoles.ts and drift-tested by
-- src/lib/__tests__/programmeRoles.test.ts, which parses THIS file's CHECK. A later
-- migration that re-cuts the constraint must update that test's filename reference.
--
-- BACKFILL is scoped to rows that HAVE a parent_event_id: a role describes a part of a
-- programme, so writing one onto a standalone event or an umbrella would assert a
-- structure that does not exist. Measured on prod before writing this (2026-11-22): 215
-- children, and NONE of them carries a pride_subtype, so the backfill matches 0 rows
-- today. It is kept rather than dropped because it is what makes the mapping a recorded
-- decision instead of an unwritten one, and because a child linked before this applies
-- would otherwise land NULL. Unmapped subtypes (festival, week) stay NULL: those name the
-- umbrella's own shape, not a child's role, and guessing one is how a vocabulary rots.
--
-- event_programme() is PATCHED from pg_get_functiondef with an exactly-once anchor rather
-- than restated, so whatever another migration has added to its body since 20260826135943
-- survives. Soft on preconditions: if the columns are already selected the patch is a
-- no-op; if neither the anchor nor the columns are found it raises, because then the
-- function has changed shape and needs a human.
--
-- Not touched: run_event_programme_link (owned by a concurrent change), the generic CMS
-- event form (parent_event_id stays out of it by design — see EventProgrammePanel.tsx).

-- LOCK HANDLING. ADD COLUMN and ADD CONSTRAINT need ACCESS EXCLUSIVE on events, which
-- is written continuously. The first version of this file used one bare
-- `set lock_timeout = '5s'` and failed `db push` on its first apply (55P03, 2026-11-22):
-- a single bounded wait turns one busy moment into a failed deploy. A pending exclusive
-- lock also queues every NEW reader behind it, so an unbounded wait would stall the
-- table site-wide. So: short 2s attempts inside a subtransaction (nothing held between
-- attempts), retried until a gap appears — the pattern of 99991791966722. `set local`
-- is legal here because a DO block runs inside a transaction. ADD COLUMN with a
-- constant default is metadata-only on PG11+; ADD CONSTRAINT ... NOT VALID skips the
-- scan under the exclusive lock, and VALIDATE runs afterwards under SHARE UPDATE
-- EXCLUSIVE, which does not block reads or writes.
do $ddl$
declare
  v_attempt int := 0;
  v_max     int := 40;
begin
  loop
    v_attempt := v_attempt + 1;
    begin
      set local lock_timeout = '2s';
      alter table public.events
        add column if not exists programme_role text,
        add column if not exists programme_official boolean not null default true;
      alter table public.events drop constraint if exists events_programme_role_check;
      alter table public.events
        add constraint events_programme_role_check
        check (
          programme_role is null
          or programme_role = any (ARRAY[
            'parade', 'street_fair', 'main_party', 'party', 'workshop', 'screening', 'talk',
            'award', 'rally', 'social', 'sports', 'market', 'other'
          ]::text[])
        ) not valid;
      raise notice 'events programme columns added on attempt %', v_attempt;
      exit;
    exception when lock_not_available then
      if v_attempt >= v_max then
        raise exception 'could not take ACCESS EXCLUSIVE on events in % attempts; re-run the deploy', v_max;
      end if;
      perform pg_sleep(2);
    end;
  end loop;
end
$ddl$;

alter table public.events validate constraint events_programme_role_check;

comment on column public.events.programme_role is
  'Role of a programme CHILD inside its festival umbrella (closed vocabulary, CHECK '
  'events_programme_role_check; mirrored in src/lib/programmeRoles.ts). NULL = not stated. '
  'Set by admins in EventProgrammePanel; meaningful only when parent_event_id is set.';
comment on column public.events.programme_official is
  'true = part of the festival''s official programme; false = a satellite event attached '
  'for readers but not run by the festival. Default true.';

-- Backfill: children only, never overwrite, first match in a fixed priority order so a
-- child with several subtypes gets a deterministic role.
update public.events e
   set programme_role = case
         when 'parade'     = any (e.pride_subtypes) then 'parade'
         when 'rally'      = any (e.pride_subtypes) then 'rally'
         when 'party'      = any (e.pride_subtypes) then 'party'
         when 'film'       = any (e.pride_subtypes) then 'screening'
         when 'conference' = any (e.pride_subtypes) then 'talk'
         when 'sports'     = any (e.pride_subtypes) then 'sports'
         when 'community'  = any (e.pride_subtypes) then 'social'
         when 'social'     = any (e.pride_subtypes) then 'social'
       end
 where e.parent_event_id is not null
   and e.programme_role is null
   and e.pride_subtypes && ARRAY['parade','rally','party','film','conference','sports','community','social']::text[];

-- Return both columns from event_programme()'s children.
do $patch$
declare
  v_src  text := pg_get_functiondef('public.event_programme(uuid)'::regprocedure);
  v_from text := 'e.currency, e.status, e.images';
  v_to   text := 'e.currency, e.status, e.images, e.programme_role, e.programme_official';
  v_hits int;
begin
  if position('e.programme_role' in v_src) > 0 then
    raise notice 'event_programme already returns programme_role; patch skipped';
    return;
  end if;
  v_hits := (length(v_src) - length(replace(v_src, v_from, ''))) / length(v_from);
  if v_hits <> 1 then
    raise exception 'event_programme patch anchor found % times (expected 1); body has changed shape', v_hits;
  end if;
  execute replace(v_src, v_from, v_to);
end
$patch$;

-- Postconditions: assert the END STATE, not how it was reached.
do $verify$
declare
  v_def  text;
  v_bad  int;
  v_child uuid;
  v_out  jsonb;
begin
  -- P1: both columns exist with the intended shape.
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'events'
         and ((column_name = 'programme_role' and data_type = 'text')
           or (column_name = 'programme_official' and data_type = 'boolean' and is_nullable = 'NO'))) <> 2 then
    raise exception 'P1 failed: programme_role / programme_official missing or wrong shape';
  end if;

  -- P2: the CHECK carries exactly the 13-value list.
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conrelid = 'public.events'::regclass and conname = 'events_programme_role_check';
  if v_def is null then
    raise exception 'P2 failed: events_programme_role_check missing';
  end if;
  if (select count(*) from unnest(ARRAY[
        'parade','street_fair','main_party','party','workshop','screening','talk',
        'award','rally','social','sports','market','other']) r
       where position('''' || r || '''' in v_def) = 0) <> 0 then
    raise exception 'P2 failed: CHECK does not name every role: %', v_def;
  end if;

  -- P3: no child with a mappable subtype was left without a role.
  select count(*) into v_bad from public.events
   where parent_event_id is not null and programme_role is null
     and pride_subtypes && ARRAY['parade','rally','party','film','conference','sports','community','social']::text[];
  if v_bad <> 0 then
    raise exception 'P3 failed: % mappable children still have no programme_role', v_bad;
  end if;

  -- P4: event_programme() selects both columns, and a real call returns them.
  v_def := pg_get_functiondef('public.event_programme(uuid)'::regprocedure);
  if position('e.programme_role' in v_def) = 0 or position('e.programme_official' in v_def) = 0 then
    raise exception 'P4 failed: event_programme does not select the new columns';
  end if;
  select id into v_child from public.events
   where parent_event_id is not null and duplicate_of_id is null
     and coalesce(status, '') <> 'archived'
   limit 1;
  if v_child is not null then
    v_out := public.event_programme(v_child);
    if not ((v_out -> 'children' -> 0) ? 'programme_role'
        and (v_out -> 'children' -> 0) ? 'programme_official') then
      raise exception 'P4 failed: event_programme output lacks the new keys: %', v_out -> 'children' -> 0;
    end if;
  end if;
end
$verify$;
