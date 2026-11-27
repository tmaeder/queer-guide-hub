-- Observances phase 2.2: observance_signals(), read by scripts/check-pipeline-health.mjs.
--
-- Coverage is reported before verdicts: zero review rows over zero links is not a clean
-- linker, it is a linker that ran over nothing. `upcoming` lists every published observance
-- whose next occurrence starts within 14 days, with the count of linked events inside its
-- window — the health script warns under 5.
--
-- The anon-visibility invariant is deliberately NOT computed here: this function runs as its
-- owner, which bypasses RLS, so it cannot see what anon sees. It reports `gated_linked` (the
-- population at risk) and the health script reads event_observances AS ANON over REST and
-- hard-fails if any gated event comes back. That is the only test that exercises the real
-- policies.

create or replace function public.observance_signals()
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  with pub as (
    select o.id, o.slug, o.tone, o.window_days_before as wb, o.window_days_after as wa
    from public.observances o where o.status = 'published'
  ),
  nxt as (
    -- one row per observance: the global rule, else its earliest country rule
    select distinct on (p.id) p.id, p.slug, p.tone, p.wb, p.wa, d.starts, d.ends
    from pub p cross join lateral public.observance_next_dates(p.id) d
    order by p.id, (d.country_id is not null), d.starts
  ),
  upcoming as (
    select n.slug, n.tone, n.starts,
           (select count(*) from public.event_observances eo
              join public.events e on e.id = eo.event_id
             where eo.observance_id = n.id and eo.status = 'linked'
               and e.duplicate_of_id is null
               and e.start_date::date between n.starts - n.wb and n.ends + n.wa) as linked_upcoming
    from nxt n
    where n.starts between current_date and current_date + 14
  )
  select jsonb_build_object(
    'probe_ok', true,
    'observances_published', (select count(*) from pub),
    'links_linked',   (select count(*) from public.event_observances where status = 'linked'),
    'links_review',   (select count(*) from public.event_observances where status = 'review'),
    'links_rejected', (select count(*) from public.event_observances where status = 'rejected'),
    'links_human',    (select count(*) from public.event_observances where method = 'human'),
    'oldest_review_hours', (select round(extract(epoch from now() - min(created_at)) / 3600)
                              from public.event_observances where status = 'review'),
    'gated_linked', (select count(*) from public.event_observances eo
                       join public.events e on e.id = eo.event_id
                      where eo.status = 'linked' and e.safety_gated and e.duplicate_of_id is null),
    'upcoming', coalesce((select jsonb_agg(jsonb_build_object(
                    'slug', u.slug, 'tone', u.tone, 'starts', u.starts,
                    'linked_upcoming', u.linked_upcoming) order by u.starts)
                  from upcoming u), '[]'::jsonb))
$fn$;

revoke all on function public.observance_signals() from public, anon, authenticated;
grant execute on function public.observance_signals() to service_role;

do $verify$
declare v jsonb := public.observance_signals();
begin
  if not coalesce((v->>'probe_ok')::boolean, false) then
    raise exception 'P1 failed: observance_signals probe_ok is not true: %', v;
  end if;
  if (v->>'observances_published')::int < 1 then
    raise exception 'P2 failed: observance_signals sees no published observance — it measures nothing';
  end if;
  if has_function_privilege('anon', 'public.observance_signals()', 'execute')
     or has_function_privilege('authenticated', 'public.observance_signals()', 'execute') then
    raise exception 'P3 failed: observance_signals is callable by anon/authenticated';
  end if;
end
$verify$;
