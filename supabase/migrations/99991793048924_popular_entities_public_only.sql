-- v_popular_entities: only rows a reader may see.
--
-- The search-proxy worker reads this view with the SERVICE key (no RLS) and
-- hydrates the rows into search results whenever it falls back to "popular"
-- (bare LGBTQ+ queries, a failed search RPC). The personality arm had no filter
-- at all, so 14,451 draft personalities (87% of the table) were eligible —
-- including non-persons archived as drafts ("Dicks Caberet", "Duplex Diner"),
-- which the People tab served to anonymous visitors. Venues included 12,470
-- merged duplicates and closed venues; cities included merged and ghost
-- (archived, deindexed) rows.
--
-- Filters now match what search_documents indexes: personalities public and
-- not merged; venues not merged and not closed; cities not merged and not
-- ghost/merged. Columns are unchanged, so mv_entity_popularity (which selects
-- from this view) needs no change and picks it up on its next refresh.
-- CREATE OR REPLACE VIEW resets reloptions, so security_invoker is restated.

create or replace view public.v_popular_entities
with (security_invoker = true) as
 select 'venue'::text as content_type,
    venues.id::text as content_id,
    (coalesce(venues.quality_score::integer, 0) +
        case when venues.is_featured then 20 else 0 end)::real as score
   from venues
  where not venues.safety_gated
    and venues.duplicate_of_id is null
    and venues.closed_at is null
union all
 select 'event'::text as content_type,
    events.id::text as content_id,
    (case when events.is_featured then 20 else 0 end::numeric
      + greatest(0::numeric, 30::numeric - extract(epoch from events.start_date - now()) / 86400.0))::real as score
   from events
  where events.start_date > (now() - '1 day'::interval) and not events.safety_gated
union all
 select 'city'::text as content_type,
    cities.id::text as content_id,
    10::real as score
   from cities
  where cities.duplicate_of_id is null
    and coalesce(cities.shell_status::text, 'real') not in ('ghost', 'merged')
union all
 select 'personality'::text as content_type,
    personalities.id::text as content_id,
    5::real as score
   from personalities
  where personalities.visibility = 'public'
    and personalities.duplicate_of_id is null;

do $verify$
begin
  if not exists (select 1 from pg_class where oid = 'public.v_popular_entities'::regclass
                 and 'security_invoker=true' = any(coalesce(reloptions, '{}'))) then
    raise exception 'v_popular_entities lost security_invoker';
  end if;
  if exists (select 1 from public.v_popular_entities v join public.personalities p on p.id = v.content_id::uuid
             where v.content_type = 'personality' and (p.visibility <> 'public' or p.duplicate_of_id is not null)) then
    raise exception 'v_popular_entities still exposes non-public personalities';
  end if;
  if not exists (select 1 from public.v_popular_entities where content_type = 'personality') then
    raise exception 'v_popular_entities has no personalities at all (filter too strict?)';
  end if;
  if exists (select 1 from public.v_popular_entities v join public.venues x on x.id = v.content_id::uuid
             where v.content_type = 'venue' and (x.duplicate_of_id is not null or x.closed_at is not null)) then
    raise exception 'v_popular_entities still exposes merged/closed venues';
  end if;
end
$verify$;
