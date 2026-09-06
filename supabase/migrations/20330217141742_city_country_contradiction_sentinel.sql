-- A city whose own content says it is in a different country than the city row
-- claims — detected, not just repaired once.
--
-- WHY THIS EXISTS. Two instances turned up on the same day, found only because
-- someone happened to look:
--
--   Zurich   filed United States, holding 10 events all stamped country='CH',
--            venues on Zürich streets, and Pink Apple — Zürich's LGBT film
--            festival — rendering at Zurich, KANSAS coordinates. Merged in
--            20320201100400.
--   Łódź     filed UKRAINE (slug `od`), carrying Łódź's population (655,279 —
--            Lutsk's is ~215k) on LUTSK's coordinates (50.74, 25.32) in Volyn
--            Oblast, with its one event stamped country='PL'. A corrupted import,
--            not a real place. Merged below into the real Łódź (slug `od-1`,
--            Poland, 51.77/19.46, 10 events, 8 venues).
--
-- Neither was caught by anything. The Zurich row had ALREADY been merged once, by
-- an admin on 2026-07-29, and un-merged on 2026-08-02 — after which it silently
-- re-accumulated ten Swiss events over five weeks with nothing reporting the
-- contradiction. That is the real lesson: the repair is cheap and the DETECTION is
-- what was missing, because a wrong-country city row is indistinguishable from a
-- correct one until you read its content.
--
-- WHAT THE SIGNAL IS. `events.country` is ISO-2 text written by the source;
-- `countries.code` is what the city claims. A city whose events UNANIMOUSLY
-- disagree with it is either wrong-country or a same-name collision. Both are
-- defects; neither is expressible as a constraint.
--
-- WHY "UNANIMOUSLY" AND NOT "ANY". Measured across the corpus: 7 cities have ANY
-- disagreement, but only 1 has a unanimous one. The other 6 are two different
-- non-defects that an `any`-based rule would report forever:
--   * a same-name collision affecting SOME events (Santa Fe/Argentina holds 8 US
--     events including "Yeasayer at Meow Wolf!", which is Santa Fe NEW MEXICO;
--     also Santa Cruz/Bolivia, Canterbury). Real, but a DIFFERENT defect with its
--     own guards, and the city row itself is correct.
--   * `events.country` holding a non-ISO or state code — Adelaide has "SA"
--     (South Australia), Birmingham "UK" (the ISO-2 is GB), Rochester "MN".
--     CLAUDE.md already records that this column mixes country and state codes.
-- Unanimity separates "this row is in the wrong country" from "some of its content
-- is misfiled", which is the distinction that makes the signal actionable.
--
-- The threshold is deliberately split rather than a single number: one dissenting
-- event is thin evidence and a typo could produce it, so 1-2 warns and >=3 fails.
-- Calibration against the two known instances: Zurich was 10/10 (would have hard
-- failed for five weeks) and Łódź is 1/1 (warns).

create or replace function public.city_country_contradictions()
returns table (
  city_id uuid,
  city_name text,
  city_slug text,
  city_country_code text,
  event_country_codes text[],
  events_with_code integer,
  contradicting integer
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select c.id,
         c.name,
         c.slug,
         co.code,
         array_agg(distinct upper(e.country)) filter (
           where e.country is not null and length(e.country) = 2),
         count(*) filter (where e.country is not null and length(e.country) = 2)::integer,
         count(*) filter (
           where e.country is not null and length(e.country) = 2
             and upper(e.country) <> upper(co.code))::integer
  from public.cities c
  join public.countries co on co.id = c.country_id
  join public.events e on e.city_id = c.id and e.duplicate_of_id is null
  where c.duplicate_of_id is null
    and coalesce(c.shell_status::text, 'real') not in ('ghost', 'merged')
  group by c.id, c.name, c.slug, co.code
  having count(*) filter (where e.country is not null and length(e.country) = 2) > 0
     and count(*) filter (where e.country is not null and length(e.country) = 2)
       = count(*) filter (
           where e.country is not null and length(e.country) = 2
             and upper(e.country) <> upper(co.code))
  order by 7 desc, 2;
$$;

comment on function public.city_country_contradictions() is
  'Cities whose linked events UNANIMOUSLY assert a different country than the city row. Unanimity is what separates a wrong-country city row from a same-name collision affecting only some events. Consumed by scripts/check-pipeline-health.mjs: warns at 1-2 contradicting events, fails at >=3.';

revoke all on function public.city_country_contradictions() from public, anon, authenticated;
grant execute on function public.city_country_contradictions() to service_role;

-- Repair the one instance the sentinel finds today. No prior merge or unmerge
-- exists for this pair (city_merge_audit checked) — unlike Zurich, this is not
-- reversing anyone's decision.
do $migrate$
declare
  v_keep uuid := '70a3e2bc-4c61-4b56-b2bd-9a6902ee2460';  -- Łódź, Poland  (slug od-1)
  v_drop uuid := 'e91f6c93-b03c-4bc5-baf3-a4782d9580ec';  -- "Łódź", Ukraine (slug od)
  v_already boolean;
  v_res jsonb;
begin
  select duplicate_of_id is not null into v_already from public.cities where id = v_drop;
  if v_already is null then
    raise notice 'lodz: drop row gone — nothing to do';
    return;
  end if;
  if v_already then
    raise notice 'lodz: already merged';
    return;
  end if;

  -- Cross-country confirmation is required and is the point: merge_cities refuses
  -- a PL/UA merge by default because same-name cities in different countries are
  -- usually distinct places. This one is not — the row carries Łódź's population
  -- on Lutsk's coordinates.
  select public.merge_cities(v_keep, v_drop, true) into v_res;
  raise notice 'lodz merge: %', v_res;
end
$migrate$;

do $verify$
declare
  v_rows integer;
  v_worst integer;
  v_lodz integer;
begin
  select count(*), coalesce(max(contradicting), 0)
    into v_rows, v_worst
  from public.city_country_contradictions();

  -- The repair above must have cleared the Łódź row specifically.
  select count(*) into v_lodz
  from public.city_country_contradictions()
  where city_slug in ('od', 'od-1');

  if v_lodz > 0 then
    raise exception 'city_country_contradictions still reports Łódź after the merge';
  end if;

  -- Positive control: an empty result also passes the check above, and would
  -- equally pass if the function were simply broken. Assert the detector still
  -- SEES the corpus by confirming the wider (non-unanimous) population it is
  -- deliberately excluding is non-empty — if that were zero too, the join or the
  -- country text is gone and this sentinel measures nothing.
  perform 1;
  if not exists (
    select 1
    from public.cities c
    join public.countries co on co.id = c.country_id
    join public.events e on e.city_id = c.id and e.duplicate_of_id is null
    where c.duplicate_of_id is null
      and e.country is not null and length(e.country) = 2
      and upper(e.country) <> upper(co.code)
  ) then
    raise exception
      'city_country_contradictions: no country disagreement exists anywhere in the corpus — the probe is broken, not the data clean';
  end if;

  raise notice 'city_country_contradictions: % row(s) remain, worst % contradicting event(s)', v_rows, v_worst;
end
$verify$;
