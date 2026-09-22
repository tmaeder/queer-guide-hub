-- Codify the production trigger that resolves pending venue-link review items
-- when an event is linked to a venue. The object was attached out of band and
-- would otherwise disappear on a rebuild from migrations.

create or replace function public.resolve_event_venue_link_reviews()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.venue_id is not null and old.venue_id is distinct from new.venue_id then
    update public.review_queue
    set status = 'resolved',
        resolved_at = now(),
        details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
          'resolution', 'venue_linked',
          'venue_id', new.venue_id,
          'resolved_automatically', true
        )
    where entity_type = 'event'
      and entity_id = new.id
      and review_type = 'venue_link_candidate'
      and status = 'pending';
  end if;

  return new;
end;
$function$;

revoke execute on function public.resolve_event_venue_link_reviews() from public, anon, authenticated;
grant execute on function public.resolve_event_venue_link_reviews() to service_role;

drop trigger if exists trg_resolve_event_venue_link_reviews on public.events;
create trigger trg_resolve_event_venue_link_reviews
after update of venue_id on public.events
for each row
execute function public.resolve_event_venue_link_reviews();

do $verify$
declare
  v_trigger_def text;
begin
  select pg_get_triggerdef(t.oid, true)
    into v_trigger_def
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'events'
    and t.tgname = 'trg_resolve_event_venue_link_reviews'
    and not t.tgisinternal;

  if v_trigger_def is null
     or v_trigger_def not ilike '%after update of venue_id on events%'
     or v_trigger_def not ilike '%execute function resolve_event_venue_link_reviews()%'
  then
    raise exception 'postcondition failed: event venue-link review trigger is missing or malformed: %',
      coalesce(v_trigger_def, '<missing>');
  end if;
end;
$verify$;
