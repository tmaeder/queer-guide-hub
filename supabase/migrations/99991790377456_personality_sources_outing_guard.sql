-- Record the outing guard that has been running in production with NO migration.
--
-- `Critical data-quality gates` → "Every production trigger is created by a
-- migration" failed on every open PR with:
--
--     ✗ 1 trigger(s) run in production that NO migration creates:
--         personality_sources.trg_personality_sources_outing_guard
--
-- and its own wording is why this is worth a migration rather than a baseline
-- bump: "A hand-attached trigger disappears on any rebuild from migrations, and
-- the invariant it enforces goes with it." The invariant here is an OUTING
-- GUARD. When the last real source for a LIVING person is deleted, that person
-- is dropped to draft and deindexed. Losing it on a rebuild would leave living
-- people published with no sourcing, which is the exact harm the rest of this
-- schema's personality machinery is built to avoid.
--
-- THIS MIGRATION CHANGES NOTHING IN PRODUCTION. Both objects already exist
-- there; `create or replace` plus `drop trigger if exists` / `create trigger`
-- re-declare the same state, so applying it is a no-op against prod and a real
-- creation against any rebuilt database. That is the whole point.
--
-- WHY IT WAS INVISIBLE TO THE RECOVERY AUTOMATION, recorded so the next person
-- does not wait for a PR that will never come: `migration-drift-recovery.yml`
-- reconstructs a missing file from `supabase_migrations.schema_migrations`.
-- These two objects have NO row there — measured, the recovery workflow ran
-- five times in one hour and produced 20 `auto/migration-drift-recovery-*`
-- branches, none containing this trigger. A trigger attached by raw SQL leaves
-- no history row, so the drift monitor is silent and the orphan-trigger gate is
-- the only thing that can see it. Those two gates detect DIFFERENT faults.
--
-- Transcribed from the live definitions, not written from intent:
--   pg_get_triggerdef  → AFTER DELETE ... REFERENCING OLD TABLE AS old_sources
--                        FOR EACH STATEMENT   (pg_trigger.tgtype = 8)
--   pg_proc.prosecdef  → false, i.e. SECURITY INVOKER. Deliberately NOT
--                        definer: the guard only ever RESTRICTS visibility, so
--                        it needs no privilege escalation, and adding one here
--                        would widen a safety path for no reason.
--   pg_proc.proconfig  → search_path=public, pg_temp
--
-- The postcondition asserts md5(prosrc) against the value measured on prod
-- BEFORE this file was written. That is the load-bearing check: a migration
-- that merely "creates a trigger of the same name" could silently install a
-- DIFFERENT guard, and a safety invariant rewritten by a transcription slip is
-- worse than one that is merely unrecorded. Migrations run in a transaction, so
-- a mismatch rolls the replace back rather than leaving prod altered.

create or replace function public.personality_sources_enforce_outing_guard()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
begin
  update public.personalities p
     set visibility      = 'draft',
         seo_indexable   = false,
         needs_attention = true,
         updated_at      = now()
   where p.id in (select distinct o.personality_id from old_sources o)
     and p.duplicate_of_id is null
     and p.is_living
     and (p.visibility = 'public' or p.seo_indexable)
     and p.lgbti_connection in ('community_member', 'ally', 'activist', 'representation')
     and not (coalesce(p.wikidata_qid, '') ~ '^Q[0-9]+$')
     and not exists (
       select 1 from public.personality_sources s
       where s.personality_id = p.id
         and coalesce(s.source_entity_id, '') !~ '^SKIP_'
     );
  return null;
end;
$function$;

comment on function public.personality_sources_enforce_outing_guard() is
  'Outing guard. When a DELETE on personality_sources removes the last non-SKIP_ source for a living, publicly visible person who carries no wikidata_qid, that person is dropped to draft, deindexed and flagged for attention. Statement-level so one bulk delete costs one UPDATE. Recorded by migration 99991790377456 after running unrecorded in production.';

drop trigger if exists trg_personality_sources_outing_guard on public.personality_sources;

create trigger trg_personality_sources_outing_guard
  after delete on public.personality_sources
  referencing old table as old_sources
  for each statement
  execute function public.personality_sources_enforce_outing_guard();

do $verify$
declare
  v_md5      text;
  v_secdef   boolean;
  v_config   text[];
  v_tgtype   smallint;
  v_expected text := '76767f70a0221c636404e485262fdfe6';
begin
  select md5(p.prosrc), p.prosecdef, p.proconfig
    into v_md5, v_secdef, v_config
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
   where p.proname = 'personality_sources_enforce_outing_guard';

  if v_md5 is null then
    raise exception 'outing guard: function personality_sources_enforce_outing_guard is absent after create';
  end if;

  -- The body must be byte-identical to what production was already running.
  -- This is the check that separates "recorded the guard" from "replaced the
  -- guard with something that looks like it".
  if v_md5 <> v_expected then
    raise exception 'outing guard: body md5 % does not match the definition measured on prod (%). This migration must RECORD the live guard, never alter it.',
      v_md5, v_expected;
  end if;

  if v_secdef then
    raise exception 'outing guard: function must stay SECURITY INVOKER; it only restricts visibility and needs no escalation';
  end if;

  if v_config is distinct from array['search_path=public, pg_temp'] then
    raise exception 'outing guard: proconfig drifted, got %', v_config;
  end if;

  -- tgtype 8 = AFTER DELETE, FOR EACH STATEMENT. A row-level or BEFORE variant
  -- would not see `old_sources` and would silently stop guarding.
  select t.tgtype into v_tgtype
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid and c.relname = 'personality_sources'
   where not t.tgisinternal
     and t.tgname = 'trg_personality_sources_outing_guard';

  if v_tgtype is null then
    raise exception 'outing guard: trigger trg_personality_sources_outing_guard is not attached to personality_sources';
  end if;

  if v_tgtype <> 8 then
    raise exception 'outing guard: trigger must be AFTER DELETE FOR EACH STATEMENT (tgtype 8), got %', v_tgtype;
  end if;

  raise notice 'outing guard recorded: body md5 %, tgtype %, security invoker, search_path pinned', v_md5, v_tgtype;
end
$verify$;
