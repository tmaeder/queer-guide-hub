-- Selector for event-agentic-enrich (P2): events still missing a moat field
-- (accessibility_attributes or target_groups) that have a per-event URL to ground
-- LLM extraction in. The moat arrays are stored EMPTY ('{}'), never NULL, which
-- PostgREST's or/eq.{} can't filter — so do it in SQL. Excludes the shared WNBR
-- homepage (no per-event moat info) and events attempted in the last 14 days
-- (the old trust<40 selector re-ran the same ~62 events 314× — wasteful spin).
-- Upcoming first, then recent past.

create or replace function public.events_needing_moat_enrich(p_limit int default 10)
returns table (id uuid)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select e.id
  from public.events e
  where e.duplicate_of_id is null
    and (array_length(e.accessibility_attributes, 1) is null
         or array_length(e.target_groups, 1) is null)
    and (e.website is not null or e.ticket_url is not null)
    and coalesce(e.website, '') <> 'https://worldnakedbikeride.org'
    and not exists (
      select 1 from public.enrichment_log el
      where el.entity_id = e.id
        and el.step = 'agentic-enrich'
        and el.created_at > now() - interval '14 days'
    )
  order by e.start_date desc nulls last
  limit greatest(p_limit, 0);
$$;

grant execute on function public.events_needing_moat_enrich(int) to service_role;
