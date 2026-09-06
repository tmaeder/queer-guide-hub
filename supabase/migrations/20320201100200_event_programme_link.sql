-- Link a multi-day umbrella event to its programme children, so a festival stops
-- publishing itself once per day in the browse feed.
--
-- THE REPORTED CASE. "lila Queer Festival" (Zürich, 10-13 Sep) publishes alongside
-- "lila. 26 - queer festival: Donnerstag / Freitag / Samstag" — four cards for one
-- festival. Neither the dedup engine nor the series collapse can touch it: the
-- titles differ so it is not a series, and merging would be WRONG because the three
-- day rows carry the real venue (Rote Fabrik) and real times while the umbrella
-- carries a junk one ("ilia queer festival"). The relationship this needs already
-- exists — `parent_event_id` + `pride_subtypes`, rendered by groupProgramme() on
-- /pride and on the event page — and had NEVER been populated: 0 rows.
--
-- WHY TOKENS AND NOT TITLE CONTAINMENT. `dedup_despace` gives "lila26queerfestival"
-- for the child and "lilaqueerfestival" for the umbrella: the edition number "26"
-- breaks both equality and containment, which is why every existing dedup arm is
-- blind to this pair. Shared `dedup_core_tokens` is the only signal that survives.
--
-- THE RULE THAT MAKES IT PRECISE: A SHARED TOKEN THAT RESTATES THE JOIN KEY IS NOT
-- EVIDENCE. Requiring >= 2 shared core tokens on its own yields 15 pairs, of which
-- 7 are wrong — and all 7 are wrong the same way, because `same city_id` is already
-- a precondition so any token contributed by the CITY NAME is guaranteed rather
-- than informative:
--   * "Halloween Alegria, New York" -> "Village Halloween Parade New York"
--     shares {halloween, new, york}: two of the three are the city.
--   * "Mr S Leather San Francisco Folsom Block Party" swallowed three unrelated
--     Folsom-weekend parties on {san, francisco, folsom}.
--   * "Atlanta Pride Circuit Party" -> "Atlanta Pride 2026" is BACKWARDS on
--     {atlanta, pride} — the satellite party has a sloppier, wider date range than
--     Pride itself, so span-containment picked the wrong direction entirely.
-- Subtracting the city's own tokens takes it to 8 pairs, and all 8 were read by
-- hand and are correct: lila x3, Baltic Battle -> Main Party, Urban Bear Weekend ->
-- Street Fair, WE Party New Year Festival -> NYE + New Year's Day, White Party
-- Bangkok -> NYE Countdown. That backwards Atlanta pair is why the city-token
-- subtraction is a correctness guard and not a tidiness one.
--
-- WHY AUTO IS ACCEPTABLE HERE WHERE IT IS NOT FOR A MERGE. Parenting destroys
-- nothing: both rows keep their content, their slug and their page, and the link is
-- undone by setting the column back to NULL. That is a categorically smaller
-- commitment than `_event_merge_core`, which reparents children and redirects a
-- slug. The ambiguity guard below is what keeps it honest.

create or replace function public.run_event_programme_link(p_batch integer default 200)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_linked integer := 0;
  v_ambiguous integer := 0;
begin
  with live as (
    select e.id, e.start_date, coalesce(e.end_date, e.start_date) as end_date,
           e.city_id, e.parent_event_id,
           public.dedup_core_tokens(e.title) as toks,
           coalesce(public.dedup_core_tokens(ci.name), '{}'::text[])
             || coalesce(public.dedup_core_tokens(e.city), '{}'::text[]) as city_toks
    from public.events e
    left join public.cities ci on ci.id = e.city_id
    where e.duplicate_of_id is null
      and e.status = 'active'
      and e.city_id is not null
      and e.title is not null
  ),
  cand as (
    select c.id as child_id, p.id as parent_id
    from live p
    join live c
      on c.id <> p.id
     and c.city_id = p.city_id
     -- The umbrella spans more than a day and strictly contains the child. The 6h
     -- slack absorbs a child whose end is stamped just past midnight.
     and p.end_date - p.start_date >= interval '20 hours'
     and c.end_date - c.start_date < p.end_date - p.start_date
     and c.start_date >= p.start_date
     and c.end_date <= p.end_date + interval '6 hours'
    where c.parent_event_id is null
      -- The parent must itself be top-level, and the child must not already be a
      -- parent: events_programme_depth_guard() rejects a two-level chain, so
      -- building one here would raise rather than link.
      and p.parent_event_id is null
      and not exists (select 1 from public.events x where x.parent_event_id = c.id)
      and cardinality(
            array(select unnest(p.toks) intersect select unnest(c.toks)
                  except select unnest(p.city_toks))
          ) >= 2
  ),
  grouped as (
    -- `min(uuid)` does not exist in Postgres — hence array_agg.
    select child_id,
           count(distinct parent_id) as n_parents,
           (array_agg(parent_id order by parent_id))[1] as parent_id
    from cand
    group by child_id
  ),
  picked as (
    -- Two candidate umbrellas means we cannot tell which one owns the child, and a
    -- wrong parent is not self-correcting. Block rather than guess.
    select child_id, parent_id from grouped where n_parents = 1 limit p_batch
  ),
  upd as (
    update public.events e
       set parent_event_id = pk.parent_id
      from picked pk
     where e.id = pk.child_id
    returning 1
  )
  select (select count(*) from upd)::integer,
         -- Reported, not silently dropped: a blocked child is work for a human, and
         -- a run that links nothing because everything is ambiguous must not read
         -- the same as a run with nothing to do.
         (select count(*) from grouped where n_parents > 1)::integer
    into v_linked, v_ambiguous;

  return jsonb_build_object('linked', v_linked, 'ambiguous', v_ambiguous);
end;
$$;

comment on function public.run_event_programme_link(integer) is
  'Links a programme child to its multi-day umbrella via parent_event_id. Non-destructive and reversible (set the column back to NULL). Requires >=2 shared core tokens AFTER subtracting the city name''s own tokens, and blocks when a child has more than one candidate umbrella.';

revoke all on function public.run_event_programme_link(integer) from public, anon, authenticated;
grant execute on function public.run_event_programme_link(integer) to service_role;

-- `trigger` is NOT NULL with NO default and `managed_by` defaults to 'user' while
-- every scheduled sibling is 'system'. Omitting `trigger` aborts the INSERT, and
-- because db push wraps a migration in one transaction that rolls back the whole
-- file including its DDL — which is exactly how 20320201100000 took /events down.
insert into public.admin_automations
  (slug, name, description, schedule, trigger, managed_by, action, enabled, auto_pause_threshold)
values (
  'event_programme_link',
  'Event programme link',
  'Links programme children (festival day-parts, satellite parties) to their multi-day umbrella event so the browse feed shows one card per festival.',
  '45 3 * * *',
  jsonb_build_object('type', 'schedule'),
  'system',
  jsonb_build_object(
    'type', 'rpc',
    'fn', 'run_event_programme_link',
    'command', 'SELECT public.run_event_programme_link(200);',
    'jobname', 'event_programme_link'
  ),
  true,
  3
)
on conflict (slug) do update
  set schedule = excluded.schedule,
      action   = excluded.action,
      enabled  = true;

select cron.schedule(
  'event_programme_link',
  '45 3 * * *',
  'SELECT public.run_event_programme_link(200);'
);

select public.run_event_programme_link(500);

do $verify$
declare
  v_children integer;
  v_lila     integer;
  v_depth    integer;
begin
  select count(*) into v_children from public.events where parent_event_id is not null;

  -- Positive control: "no bad links" also passes when nothing was linked at all,
  -- which is the state this migration exists to change.
  if v_children = 0 then
    raise exception 'event_programme_link: linked nothing — the reported lila case is unfixed';
  end if;

  -- The reported case specifically: all three day-parts under the umbrella.
  select count(*) into v_lila
  from public.events c
  join public.events p on p.id = c.parent_event_id
  where p.slug = 'lila-queer-festival';

  if v_lila <> 3 then
    raise exception 'event_programme_link: expected 3 lila day-parts linked, got %', v_lila;
  end if;

  -- No two-level chains: a child must never itself be a parent.
  select count(*) into v_depth
  from public.events a
  join public.events b on b.parent_event_id = a.id
  where a.parent_event_id is not null;

  if v_depth > 0 then
    raise exception 'event_programme_link: % grandchild link(s) created', v_depth;
  end if;

  raise notice 'event_programme_link: % programme children linked (% under lila)', v_children, v_lila;
end
$verify$;
