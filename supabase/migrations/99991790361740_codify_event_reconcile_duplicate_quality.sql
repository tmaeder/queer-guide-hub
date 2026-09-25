-- Codify `events.trg_events_reconcile_duplicate_quality` and the function it calls.
--
-- Caught by the "Every production trigger is created by a migration" gate, which was
-- failing on EVERY open PR:
--
--   ✗ 1 trigger(s) run in production that NO migration creates:
--       events.trg_events_reconcile_duplicate_quality
--
-- Neither the trigger NOR `reconcile_duplicate_event_quality()` appears anywhere in
-- supabase/migrations — grep returns nothing for either name. Both were attached to
-- prod by hand, so a rebuild from migrations would silently drop them and the
-- behaviour would just stop: an event marked as a duplicate would keep its open
-- quality issues forever and keep a stale `event_quality_current` row, with nothing
-- erroring to say so.
--
-- THIS MIGRATION CHANGES NOTHING ABOUT PRODUCTION. Both bodies are copied verbatim
-- out of `pg_get_functiondef()` / `pg_get_triggerdef()` on the live database, so
-- applying it is a no-op there; its whole purpose is that a rebuild from zero
-- reproduces what prod already does. Do not "improve" the logic here — a migration
-- that codifies drift must be byte-faithful, or it silently becomes a behaviour
-- change nobody reviewed as one.
--
-- `drop trigger if exists` + `create trigger` rather than `create or replace trigger`:
-- the latter is Postgres 14+ and this repo's other trigger migrations use the
-- drop/create pair, so it stays consistent and re-runnable.

create or replace function public.reconcile_duplicate_event_quality()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.duplicate_of_id is not null
     and old.duplicate_of_id is distinct from new.duplicate_of_id then
    update public.event_quality_issues
    set status='resolved',
        resolution='event_became_duplicate',
        resolved_at=now(),
        reviewed_at=now()
    where event_id=new.id and status='open';

    delete from public.event_quality_current where event_id=new.id;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_events_reconcile_duplicate_quality on public.events;

create trigger trg_events_reconcile_duplicate_quality
after update of duplicate_of_id on public.events
for each row execute function public.reconcile_duplicate_event_quality();

do $verify$
declare
  v_fn  int;
  v_trg int;
begin
  -- Assert the REACHED state, not that this file reached it: a concurrent fix that
  -- codifies the same trigger must satisfy these too, and a migration that RAISEs on
  -- main takes every migration queued behind it down with it.
  select count(*) into v_fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'reconcile_duplicate_event_quality';
  if v_fn <> 1 then
    raise exception 'expected exactly 1 reconcile_duplicate_event_quality(), got %', v_fn;
  end if;

  select count(*) into v_trg
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'events'
    and t.tgname = 'trg_events_reconcile_duplicate_quality'
    and not t.tgisinternal;
  if v_trg <> 1 then
    raise exception 'trg_events_reconcile_duplicate_quality not attached to public.events (found %)', v_trg;
  end if;
end
$verify$;
