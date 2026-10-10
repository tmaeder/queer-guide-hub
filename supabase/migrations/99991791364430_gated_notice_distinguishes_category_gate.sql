-- `GatedContentNotice` told 1,807 cities in SAFE countries that they carry
-- "heightened legal risk for LGBTQ+ people".
--
-- The notice reads `gated_count_for_location`, which returns counts and nothing
-- else, so the component had to GUESS why a row was gated and guessed the only
-- reason that existed when it was written: `location_is_high_risk`. Since
-- 20261112100000 that is not the rule. For venues it is
--
--   venues.safety_gated = location_is_high_risk(country_id, city_id)
--                         OR category = 'cruising'
--
-- -- a cruising venue is gated in EVERY country, however safe, because
-- publishing a cruising location to anonymous visitors is an outing exposure on
-- its own. CLAUDE.md already recorded that this makes the column "look exactly
-- like drift in liberal Europe" and named the cohort as 122 venues. The
-- 2026-10-05 import of 55,934 cruising venues made the second term dominant:
-- measured on prod, of the 1,964 cities whose page shows this notice, 1,807 are
-- in a country that is NOT high risk, and in ALL 1,807 of them every gated
-- venue is a cruising venue. 92% of the banner's appearances asserted a false
-- legal claim about the country the reader is looking at -- on /city/madrid,
-- two paragraphs above that page's own "legal since 1979, married since 2005"
-- panel.
--
-- A wrong safety claim is not a copy bug on this platform. It is the same class
-- as the 86 cities that published another country's `safety_notes`: a derived
-- statement that outlived the input it was derived from.
--
-- The fix is to stop making the caller infer. `high_risk` is computed by the
-- one predicate that owns the question (`location_is_high_risk`, unchanged),
-- costs no extra round trip, and lets the component say which of the two
-- reasons applies. The counts are untouched -- they were never wrong; only the
-- stated reason was.
--
-- Deliberately NOT done here:
--   * The gate itself is correct and is not loosened. Cruising venues stay
--     hidden from anonymous visitors in every country.
--   * The new copy must never name the category. Naming cruising on a
--     signed-out page advertises it to exactly the audience the gate exists to
--     keep it from -- the reason `AUTH_ONLY_CATEGORIES` hides the filter chip.
--   * `queer_villages` is returned by this function and still not summed by the
--     component, so a location gated only by a village shows no notice. Real,
--     pre-existing, and a separate decision.

create or replace function public.gated_count_for_location(
  p_country_id uuid default null,
  p_city_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'venues', (
      select count(*) from public.venues v
      where v.safety_gated
        and v.duplicate_of_id is null
        and v.closed_at is null
        and (p_country_id is null or v.country_id = p_country_id)
        and (p_city_id    is null or v.city_id    = p_city_id)
    ),
    'events', (
      select count(*) from public.events e
      where e.safety_gated
        and (p_country_id is null or e.country_id = p_country_id)
        and (p_city_id    is null or e.city_id    = p_city_id)
    ),
    'organizations', (
      select count(*) from public.organizations o
      where o.safety_gated
        and o.status = 'active'
        and (p_country_id is null or o.country_id = p_country_id)
        and (p_city_id    is null or o.city_id    = p_city_id)
    ),
    'queer_villages', (
      select count(*) from public.queer_villages qv
      where qv.safety_gated
        and qv.duplicate_of_id is null
        and (p_country_id is null or qv.country_id = p_country_id)
        and (p_city_id    is null or qv.city_id    = p_city_id)
    ),
    -- Whether the LOCATION is criminalising / death-penalty, which is a
    -- different question from whether anything here is gated. The notice needs
    -- both: the counts say how much is hidden, this says why.
    'high_risk', public.location_is_high_risk(p_country_id, p_city_id)
  );
$function$;

comment on function public.gated_count_for_location(uuid, uuid) is
  'Aggregate counts of safety-gated entities for a city or country, plus high_risk: '
  'whether the location itself is criminalising/death-penalty. Counts alone cannot '
  'say WHY a row is gated -- since 20261112100000 a cruising venue is gated in every '
  'country -- and a caller that inferred the reason from a non-zero count published '
  '"heightened legal risk" about Spain. Aggregates only, no row data: safe anonymously.';

do $verify$
declare
  v_probe jsonb;
  v_disagree int;
  v_low_risk_gated int;
begin
  -- 1. The key the component branches on must exist, and must be a boolean.
  --    An absent key reads as `undefined` in JS, which is falsy, which would
  --    silently serve the SENSITIVE copy to a reader in a criminalising
  --    country -- the inverse of the bug being fixed and the more dangerous
  --    direction.
  v_probe := public.gated_count_for_location(null, null);
  if not (v_probe ? 'high_risk') then
    raise exception 'gated_count_for_location did not return high_risk: %', v_probe;
  end if;
  if jsonb_typeof(v_probe -> 'high_risk') <> 'boolean' then
    raise exception 'high_risk is %, expected boolean: %',
      jsonb_typeof(v_probe -> 'high_risk'), v_probe;
  end if;

  -- 2. The flag must agree with the predicate that owns the question, on a
  --    sample drawn from BOTH branches.
  --
  --    Bounded at 100 per branch on purpose: asserting it over every gated city
  --    was written first and timed out at 8s against 1,964 of them (57014 --
  --    the function does four counts per call and `venues` is 99k rows since
  --    the 2026-10-05 import). A verify block that cannot finish aborts
  --    `db push` on main and takes every migration queued behind it.
  --
  --    Deterministic `order by id`, not `random()`: a probe that passes on one
  --    apply and fails on the next is indistinguishable from a real defect.
  with sampled as (
    (select c.id, c.country_id, false as want_high
     from public.cities c
     where c.duplicate_of_id is null
       and not public.location_is_high_risk(c.country_id, c.id)
       and exists (select 1 from public.venues v
                   where v.city_id = c.id and v.safety_gated
                     and v.duplicate_of_id is null and v.closed_at is null)
     order by c.id limit 100)
    union all
    (select c.id, c.country_id, true as want_high
     from public.cities c
     where c.duplicate_of_id is null
       and public.location_is_high_risk(c.country_id, c.id)
       and exists (select 1 from public.venues v
                   where v.city_id = c.id and v.safety_gated
                     and v.duplicate_of_id is null and v.closed_at is null)
     order by c.id limit 100)
  )
  select
    count(*) filter (
      where (public.gated_count_for_location(null, s.id) ->> 'high_risk')::boolean
            is distinct from s.want_high
    ),
    count(*) filter (where not s.want_high)
  into v_disagree, v_low_risk_gated
  from sampled s;

  if v_disagree <> 0 then
    raise exception 'high_risk disagreed with location_is_high_risk on % sampled cities', v_disagree;
  end if;

  -- 3. Positive control for the branch this migration exists to create. Zero
  --    gated-but-low-risk cities would mean the SENSITIVE copy is unreachable
  --    and step 2 proved nothing about it -- i.e. the probe is measuring
  --    nothing, not that the corpus is clean.
  if v_low_risk_gated = 0 then
    raise exception 'no gated low-risk city sampled, so the sensitive-copy branch is untested';
  end if;

  raise notice 'gated_count_for_location: high_risk present, 0 disagreements, % low-risk gated cities sampled',
    v_low_risk_gated;
end
$verify$;
