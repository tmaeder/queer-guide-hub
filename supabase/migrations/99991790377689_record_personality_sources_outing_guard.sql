-- Record the outing guard that exists in prod and in no migration.
--
-- `check-schema-object-drift.mjs` fails on any production trigger that no migration
-- creates, and its reason is exactly why this one matters: "a hand-attached trigger
-- disappears on any rebuild from migrations, and the invariant it enforces goes with
-- it." The invariant here is an OUTING PROTECTION -- it unpublishes a living person
-- whose last real source has just been deleted -- so losing it on a rebuild is not a
-- tidiness problem.
--
-- Measured before writing this: the trigger and its function exist in prod, appear on
-- NO branch in this repo, and appear in NO applied migration's recorded statements
-- (`schema_migrations.statements ... like '%trg_personality_sources_outing_guard%'`
-- returns 0). They were attached by raw SQL.
--
-- SHIPS NO NEW BEHAVIOUR. Both objects are copied verbatim out of prod via
-- pg_get_functiondef / pg_get_triggerdef, so applying this is a no-op against the live
-- database and only makes a rebuild from migrations reproduce it.
--
-- Two details are load-bearing and must not be "tidied":
--   * it is a STATEMENT-level AFTER DELETE trigger with `REFERENCING OLD TABLE AS
--     old_sources`. A FOR EACH ROW rewrite loses the transition table the body reads.
--   * the body re-checks `not exists (... source_entity_id !~ '^SKIP_')` rather than
--     trusting the deleted rows, so a personality that still holds a real source is
--     left published.

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

drop trigger if exists trg_personality_sources_outing_guard on public.personality_sources;
create trigger trg_personality_sources_outing_guard
  after delete on public.personality_sources
  referencing old table as old_sources
  for each statement execute function public.personality_sources_enforce_outing_guard();

do $verify$
begin
  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.personality_sources'::regclass
      and t.tgname = 'trg_personality_sources_outing_guard'
      -- statement-level, and carrying its transition table
      and pg_get_triggerdef(t.oid) ilike '%for each statement%'
      and pg_get_triggerdef(t.oid) ilike '%referencing old table as old_sources%'
  ) then
    raise exception 'the outing guard is not attached as a statement-level trigger with its transition table';
  end if;
end
$verify$;
