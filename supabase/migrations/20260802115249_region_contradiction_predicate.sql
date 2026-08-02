-- Guard A refused correct links outside the US.
--
-- 20260802090844 added two corroboration guards to run_event_city_link. Guard B
-- (the gaycities metro slug) is US-only and precise. Guard A compares
-- events.state to cities.region_name as raw strings, and that is wrong for every
-- corpus whose region vocabulary is not "spelled-out US state name".
--
-- Measured on production 2026-08-02 over the 114 already-linked events whose
-- state disagreed with cities.region_name: 113 were FALSE POSITIVES and exactly
-- one was a real mis-link. Three shapes account for all 113:
--
--   opaque numeric code     Melbourne   state 'VIC'    vs region_name '07'   (27 events)
--   unexpanded short code   Byron Bay   state 'NSW'    vs 'New South Wales'  (13 events)
--   administrative wording  Madrid      state 'Madrid' vs 'Community of Madrid' (22 events)
--
-- The single real one: a Durango, COLORADO event attached to Durango, Durango —
-- in Mexico. That pair still blocks below, so the guard keeps its teeth.
--
-- Rules, mirrored exactly by supabase/functions/_shared/city-collision-guard.ts
-- (the hourly geo-link-content edge function applies the same guards, and the
-- two must not disagree about what a contradiction is):
--   * a purely numeric value is an opaque code            -> no signal
--   * a code claimed by two countries (WA, NT)            -> no signal
--   * an unrecognized value of <= 3 chars                 -> no signal
--   * one value containing the other                      -> agreement
--   * otherwise, two differing region NAMES               -> contradiction
--
-- Guard B is deliberately NOT relaxed: an explicit US metro slug that cannot be
-- corroborated is itself a reason not to link. Only the comparison is improved,
-- so 'SC' and 'South Carolina' now agree.

-- ── Region vocabulary ────────────────────────────────────────────────
-- Empty name = the code means different things in different countries; refuse
-- to resolve it rather than guess.
create or replace function public.region_expand_abbr(p_code text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select nm from (values
    ('al','Alabama'),('ak','Alaska'),('az','Arizona'),('ar','Arkansas'),('ca','California'),
    ('co','Colorado'),('ct','Connecticut'),('de','Delaware'),('fl','Florida'),('ga','Georgia'),
    ('hi','Hawaii'),('id','Idaho'),('il','Illinois'),('in','Indiana'),('ia','Iowa'),('ks','Kansas'),
    ('ky','Kentucky'),('la','Louisiana'),('me','Maine'),('maine','Maine'),('md','Maryland'),
    ('ma','Massachusetts'),('mi','Michigan'),('mn','Minnesota'),('ms','Mississippi'),
    ('mo','Missouri'),('mt','Montana'),('ne','Nebraska'),('nv','Nevada'),('nh','New Hampshire'),
    ('nj','New Jersey'),('nm','New Mexico'),('ny','New York'),('nc','North Carolina'),
    ('nd','North Dakota'),('oh','Ohio'),('ok','Oklahoma'),('or','Oregon'),('pa','Pennsylvania'),
    ('ri','Rhode Island'),('sc','South Carolina'),('sd','South Dakota'),('tn','Tennessee'),
    ('tx','Texas'),('ut','Utah'),('vt','Vermont'),('va','Virginia'),
    ('wv','West Virginia'),('wi','Wisconsin'),('wy','Wyoming'),
    -- Australia
    ('nsw','New South Wales'),('vic','Victoria'),('qld','Queensland'),('tas','Tasmania'),
    ('act','Australian Capital Territory'),('sa','South Australia'),
    -- Canada
    ('ab','Alberta'),('bc','British Columbia'),('mb','Manitoba'),('nb','New Brunswick'),
    ('nl','Newfoundland and Labrador'),('ns','Nova Scotia'),('nu','Nunavut'),('on','Ontario'),
    ('pe','Prince Edward Island'),('qc','Quebec'),('sk','Saskatchewan'),('yt','Yukon'),
    -- Claimed by more than one country: WA = Washington / Western Australia,
    -- NT = Northern Territory / Northwest Territories.
    ('wa',''),('nt','')
  ) t(ab, nm) where t.ab = lower(btrim(coalesce(p_code, '')));
$$;

-- '' means "carries no comparable signal", never "empty region".
create or replace function public.region_name_signal(p_value text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case
    when v = '' then ''
    when v ~ '^[0-9]+$' then ''                      -- opaque code: '07', '02'
    when ex is not null then lower(ex)               -- '' when ambiguous
    when length(v) <= 3 then ''                      -- unknown short code
    else v
  end
  from (
    select lower(btrim(coalesce(p_value, ''))) as v,
           public.region_expand_abbr(p_value)  as ex
  ) s;
$$;

create or replace function public.regions_contradict(p_a text, p_b text)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select case
    when x = '' or y = '' or x = y then false
    when position(y in x) > 0 or position(x in y) > 0 then false  -- "madrid" in "community of madrid"
    else true
  end
  from (select public.region_name_signal(p_a) x, public.region_name_signal(p_b) y) s;
$$;

comment on function public.regions_contradict(text, text) is
  'True only when both values name a region and the names genuinely disagree. Numeric codes, unrecognized short codes and codes claimed by two countries carry no signal; one value containing the other is agreement. Mirrors _shared/city-collision-guard.ts — 113 of 114 raw-string mismatches on prod were false positives (VIC vs 07, NSW vs New South Wales, Madrid vs Community of Madrid).';

-- ── Runner: use the predicate for guard A, and for guard B's comparison ──
drop function if exists public.run_event_city_link(integer, boolean);

create function public.run_event_city_link(
  p_batch integer default 300,
  p_force boolean default false
)
returns table(processed integer, linked integer, blocked integer)
language plpgsql
set search_path to 'public'
as $$
declare
  r          record;
  v_city     uuid;
  v_region   text;
  v_proc     integer := 0;
  v_linked   integer := 0;
  v_blocked  integer := 0;
  v_cnorm    text;
  v_suffix   text;
  v_claimed  text;
  v_block    boolean;
begin
  for r in
    select e.id, e.city, e.country, e.country_id, e.state,
           lower(replace(coalesce(
             (select coalesce(es.payload->'normalized', es.payload)->'metadata'->>'gaycities_subdomain'
              from public.event_sources es where es.event_id = e.id limit 1), ''), '-', '')) sub
    from public.events e
    where e.duplicate_of_id is null
      and e.city_id is null
      and coalesce(btrim(e.city), '') <> ''
      and (p_force or not (coalesce(e.enrichment_status, '{}'::jsonb) ? 'event_city_link'))
    order by (e.start_date >= now()) desc nulls last, e.start_date desc nulls last, e.id
    limit greatest(p_batch, 1)
  loop
    v_proc := v_proc + 1;
    v_block := false;
    v_city := null; v_region := null; v_claimed := null;

    select c.id, c.region_name into v_city, v_region
    from public.cities c
    where c.duplicate_of_id is null
      and c.country_id = coalesce(
            r.country_id,
            (select co.id from public.countries co where upper(co.code) = upper(btrim(r.country)) limit 1))
      and lower(btrim(c.name)) = lower(btrim(r.city))
    limit 1;

    if v_city is not null then
      -- Guard A: the event's own state must not contradict the candidate.
      -- Only a genuine disagreement between two region NAMES counts.
      if public.regions_contradict(r.state, v_region) then
        v_block := true;
      end if;

      -- Guard B: gaycities metro slug = <cityname><statecode>. Unlike guard A
      -- this blocks an uncorroborated claim too: the slug is explicit evidence,
      -- so failing to confirm it is itself a reason not to link.
      if not v_block and r.sub <> '' then
        v_cnorm := replace(replace(replace(lower(btrim(r.city)), ' ', ''), '.', ''), '-', '');
        if left(r.sub, length(v_cnorm)) = v_cnorm then
          v_suffix := substr(r.sub, length(v_cnorm) + 1);
          select nm into v_claimed from (values
            ('al','Alabama'),('ak','Alaska'),('az','Arizona'),('ar','Arkansas'),('ca','California'),
            ('co','Colorado'),('ct','Connecticut'),('de','Delaware'),('fl','Florida'),('ga','Georgia'),
            ('hi','Hawaii'),('id','Idaho'),('il','Illinois'),('in','Indiana'),('ia','Iowa'),('ks','Kansas'),
            ('ky','Kentucky'),('la','Louisiana'),('me','Maine'),('maine','Maine'),('md','Maryland'),
            ('ma','Massachusetts'),('mi','Michigan'),('mn','Minnesota'),('ms','Mississippi'),
            ('mo','Missouri'),('mt','Montana'),('ne','Nebraska'),('nv','Nevada'),('nh','New Hampshire'),
            ('nj','New Jersey'),('nm','New Mexico'),('ny','New York'),('nc','North Carolina'),
            ('nd','North Dakota'),('oh','Ohio'),('ok','Oklahoma'),('or','Oregon'),('pa','Pennsylvania'),
            ('ri','Rhode Island'),('sc','South Carolina'),('sd','South Dakota'),('tn','Tennessee'),
            ('tx','Texas'),('ut','Utah'),('vt','Vermont'),('va','Virginia'),('wa','Washington'),
            ('wv','West Virginia'),('wi','Wisconsin'),('wy','Wyoming')
          ) t(ab, nm) where t.ab = v_suffix;
          -- Compare through the signal so 'SC' and 'South Carolina' agree.
          if v_claimed is not null
             and lower(v_claimed) is distinct from public.region_name_signal(v_region) then
            v_block := true;
          end if;
        end if;
      end if;
    end if;

    if v_block then
      v_city := null;
      v_blocked := v_blocked + 1;
    elsif v_city is not null then
      v_linked := v_linked + 1;
    end if;

    update public.events set
      city_id = coalesce(v_city, city_id),
      needs_attention = case when v_block then true else needs_attention end,
      enrichment_status = jsonb_set(
        coalesce(enrichment_status, '{}'::jsonb), '{event_city_link}',
        case when v_block
          then jsonb_build_object('at', now(), 'linked', false,
                 'blocked', 'same-name-city collision; source metro or state contradicts cities.region_name')
          else jsonb_build_object('at', now(), 'linked', v_city is not null)
        end, true)
    where id = r.id;
  end loop;

  processed := v_proc; linked := v_linked; blocked := v_blocked; return next;
end;
$$;

revoke all on function public.run_event_city_link(integer, boolean) from public, anon, authenticated;
grant execute on function public.run_event_city_link(integer, boolean) to service_role;

revoke all on function public.region_expand_abbr(text) from public, anon, authenticated;
revoke all on function public.region_name_signal(text) from public, anon, authenticated;
revoke all on function public.regions_contradict(text, text) from public, anon, authenticated;
grant execute on function public.region_expand_abbr(text) to service_role;
grant execute on function public.region_name_signal(text) to service_role;
grant execute on function public.regions_contradict(text, text) to service_role;

comment on function public.run_event_city_link(integer, boolean) is
  'Batched: resolves events.city_id from (country, city text). Refuses to link when the gaycities source metro slug contradicts cities.region_name, or when events.state and region_name name two genuinely different regions (regions_contradict — raw string compare produced 113 false positives out of 114 on prod). cities holds one row per (name, country), so same-name twins are otherwise linked silently and wrongly.';
