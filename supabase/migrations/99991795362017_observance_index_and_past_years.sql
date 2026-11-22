-- Observances phase 2.3/2.4: read RPCs for the /days index and the hub's Past years line.
--
-- Both are SECURITY INVOKER on purpose: every count runs under the reader's own RLS, so an
-- anonymous reader's totals exclude safety-gated events exactly as the event list does
-- (event_observances_public_read embeds the events policy). A definer here would count
-- gated events for anon — the design doc's hard rule 3.

-- /days: every published observance, its current-or-next dates (one entry per regional rule)
-- and how many linked events fall inside that occurrence's window.
create or replace function public.observances_index()
returns table (id uuid, slug text, name text, kind text, tone text, summary text,
               dates jsonb, starts date, linked_count int)
language sql stable security invoker set search_path to 'public' as $fn$
  select o.id, o.slug, o.name, o.kind, o.tone, o.summary,
         d.dates, d.starts,
         (select count(*)::int
            from public.event_observances eo
            join public.events e on e.id = eo.event_id
           where eo.observance_id = o.id and eo.status = 'linked'
             and e.duplicate_of_id is null
             and e.start_date::date between d.starts - o.window_days_before
                                         and d.ends + o.window_days_after) as linked_count
  from public.observances o
  cross join lateral (
    select jsonb_agg(jsonb_build_object('country_id', x.country_id, 'country_name', x.country_name,
                                        'starts', x.starts, 'ends', x.ends)
                     order by x.country_id nulls first, x.country_name) as dates,
           min(x.starts) as starts, max(x.ends) as ends
    from public.observance_next_dates(o.id) x
  ) d
  where o.status = 'published'
  order by d.starts, o.name
$fn$;
revoke all on function public.observances_index() from public;
grant execute on function public.observances_index() to anon, authenticated, service_role;

-- Hub "Past years": one row per calendar year of linked events, before p_before_year.
-- Cities are counted by city_id when linked, else by the city text.
create or replace function public.observance_past_years(p_observance_id uuid, p_before_year int)
returns table (year int, events int, cities int)
language sql stable security invoker set search_path to 'public' as $fn$
  select extract(year from e.start_date)::int as year,
         count(*)::int as events,
         count(distinct coalesce(e.city_id::text, lower(nullif(btrim(e.city), ''))))::int as cities
  from public.event_observances eo
  join public.events e on e.id = eo.event_id
  where eo.observance_id = p_observance_id
    and eo.status = 'linked'
    and e.duplicate_of_id is null
    and e.start_date is not null
    and extract(year from e.start_date) < p_before_year
  group by 1
  order by 1 desc
$fn$;
revoke all on function public.observance_past_years(uuid, int) from public;
grant execute on function public.observance_past_years(uuid, int) to anon, authenticated, service_role;

do $verify$
declare v_n int;
begin
  -- P1 both run as the caller, never as their owner
  select count(*) into v_n from pg_proc
   where proname in ('observances_index', 'observance_past_years') and pronamespace = 'public'::regnamespace
     and prosecdef;
  if v_n <> 0 then
    raise exception 'P1 failed: % observance read RPC(s) are SECURITY DEFINER', v_n;
  end if;
  -- P2 the index lists every published observance
  select count(*) into v_n from public.observances_index();
  if v_n <> (select count(*) from public.observances where status = 'published') then
    raise exception 'P2 failed: observances_index returns % rows', v_n;
  end if;
end
$verify$;
