-- Guard run_event_city_link against same-name city collisions.
--
-- `cities` holds at most one row per (name, country), so a US corpus containing
-- Charleston SC *and* Charleston IL can only ever match one of them. The original
-- runner's "exactly one match" test therefore proved nothing: an unrepresentable
-- twin looks identical to an unambiguous name, and 116 events were silently
-- attached to the wrong city (Portland ME -> Portland OR, Springfield MO ->
-- Springfield VT, Charleston SC -> Charleston IL, ...), then given that city's
-- centroid coordinates and timezone.
--
-- Two corroboration guards. Either contradiction blocks the link and records why,
-- rather than guessing: a null city_id is recoverable, a wrong one is not.
--   A. events.state vs cities.region_name.
--   B. the gaycities source metro slug, which encodes the state for exactly the
--      ambiguous names (charlestonsc, springfieldmo, portland-maine).
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
      if coalesce(btrim(r.state), '') <> '' and coalesce(btrim(v_region), '') <> ''
         and lower(btrim(r.state)) <> lower(btrim(v_region)) then
        v_block := true;
      end if;

      -- Guard B: gaycities metro slug = <cityname><statecode>.
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
          if v_claimed is not null and v_claimed is distinct from v_region then
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

comment on function public.run_event_city_link(integer, boolean) is
  'Batched: resolves events.city_id from (country, city text). Refuses to link when events.state or the gaycities source metro slug contradicts cities.region_name — cities holds one row per (name, country), so same-name twins are otherwise linked silently and wrongly.';
