-- 99991792753155_org_safety_gate_follows_venue_merge
--
-- organizations.safety_gated is decided by trg_organizations_safety_gated
-- (set_org_safety_gated). Two defects, one producer:
--
-- 1. STALE ON MERGE. The rule reads the primary venue's duplicate_of_id, but the
--    venue->org propagation (zzz_venue_gate_to_org, 99991792403561) fired only on
--    venues.safety_gated. 2026-10-23 06:30 the dedup sweep merged 'El Gremio'
--    (cruising, gated); org 0250db11-... stayed gated against its own rule and
--    city_safety_gate_drift (critical) went red on every open PR.
--
-- 2. A MERGE UNGATED THE ORG. The rule counted the primary venue only while live
--    and never consulted the merge survivor, and no cron runs
--    repoint_merged_primary_venues(). Measured on prod: 133 orgs point at a
--    merged-away venue whose SURVIVOR is gated (132 cruising), 58 of them live
--    and ungated, i.e. anon-readable cruising-venue identities. Fixing (1) alone
--    would make every cruising->cruising merge ungate its org on the spot.
--
-- Rule now: high-risk location OR live primary venue gated OR the primary's
-- merge survivor gated. One hop: 0 venue merge chains exist today.
--
-- The critical gate encodes the same rule in two places (drift arm in
-- release_gate_checks_raw, venue_identity_gate_bypass in release_gate_checks).
-- Both are widened here by exactly-once string surgery on the LIVE bodies
-- (never restated from a file), or gating these orgs would read as drift.

-- 1. The rule.
create or replace function public.set_org_safety_gated()
returns trigger language plpgsql
set search_path to 'public' as $fn$
begin
  new.safety_gated :=
    public.location_is_high_risk(new.country_id, new.city_id)
    or exists (
      select 1 from public.venues v
        left join public.venues s on s.id = v.duplicate_of_id
       where v.id = new.primary_venue_id
         and ((v.duplicate_of_id is null and v.safety_gated is true)
              or s.safety_gated is true)
    );
  return new;
end $fn$;

-- 2. Propagation: a venue's gate or merge state changed -> re-decide orgs whose
--    primary IS it, or whose primary was merged INTO it.
create or replace function public.propagate_venue_gate_to_organization()
returns trigger language plpgsql security definer
set search_path to 'public', 'pg_temp' as $prop$
begin
  update public.organizations o
     set primary_venue_id = o.primary_venue_id
   where o.primary_venue_id = new.id
      or o.primary_venue_id in (select d.id from public.venues d where d.duplicate_of_id = new.id);
  return null;
end $prop$;

drop trigger if exists zzz_venue_gate_to_org on public.venues;
create trigger zzz_venue_gate_to_org
  after update of safety_gated, duplicate_of_id on public.venues
  for each row
  when (old.safety_gated is distinct from new.safety_gated
        or old.duplicate_of_id is distinct from new.duplicate_of_id)
  execute function public.propagate_venue_gate_to_organization();

-- 3. The gate learns the same rule.
do $gate$
declare
  v_src text;
  v_old text;
  v_new text;
begin
  v_src := pg_get_functiondef('public.release_gate_checks_raw'::regproc);
  v_old := 'or exists (select 1 from public.venues pv
                          where pv.id = t.primary_venue_id
                            and pv.duplicate_of_id is null
                            and pv.safety_gated is true), false)';
  v_new := 'or exists (select 1 from public.venues pv
                          left join public.venues ps on ps.id = pv.duplicate_of_id
                          where pv.id = t.primary_venue_id
                            and ((pv.duplicate_of_id is null and pv.safety_gated is true)
                                 or ps.safety_gated is true)), false)';
  if position(v_old in v_src) > 0 then
    if (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old) <> 1 then
      raise exception 'drift arm anchor is not unique';
    end if;
    execute replace(v_src, v_old, v_new);
  elsif position('ps.safety_gated is true' in v_src) = 0 then
    raise exception 'drift arm anchor not found and survivor term absent';
  end if;

  v_src := pg_get_functiondef('public.release_gate_checks'::regproc);
  v_old := 'JOIN public.venues v ON v.id = o.primary_venue_id
  WHERE coalesce(o.safety_gated, false) IS FALSE
    AND v.duplicate_of_id IS NULL
    AND v.safety_gated IS TRUE;';
  v_new := 'JOIN public.venues v ON v.id = o.primary_venue_id
  LEFT JOIN public.venues s ON s.id = v.duplicate_of_id
  WHERE coalesce(o.safety_gated, false) IS FALSE
    AND ((v.duplicate_of_id IS NULL AND v.safety_gated IS TRUE)
         OR s.safety_gated IS TRUE);';
  if position(v_old in v_src) > 0 then
    if (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old) <> 1 then
      raise exception 'bypass anchor is not unique';
    end if;
    execute replace(v_src, v_old, v_new);
  elsif position('s.safety_gated IS TRUE' in v_src) = 0 then
    raise exception 'bypass anchor not found and survivor term absent';
  end if;
end $gate$;

-- 4. Heal through the seal: every org whose primary venue was merged away
--    (~580 rows). Writes no answer itself.
update public.organizations o
   set primary_venue_id = o.primary_venue_id
  from public.venues v
 where v.id = o.primary_venue_id
   and v.duplicate_of_id is not null;

do $verify$
declare v_def text; v_bad bigint;
begin
  select pg_get_triggerdef(t.oid) into v_def
    from pg_trigger t
   where t.tgrelid = 'public.venues'::regclass and t.tgname = 'zzz_venue_gate_to_org';
  if v_def is null or position('duplicate_of_id' in v_def) = 0 then
    raise exception 'P1 failed: zzz_venue_gate_to_org does not fire on duplicate_of_id: %', v_def;
  end if;

  if position('s.safety_gated is true' in regexp_replace(pg_get_functiondef('public.set_org_safety_gated'::regproc), '--[^' || chr(10) || ']*', '', 'g')) = 0 then
    raise exception 'P2 failed: set_org_safety_gated does not consult the merge survivor';
  end if;

  -- No org is ungated while its primary venue's survivor is gated.
  select count(*) into v_bad
    from public.organizations o
    join public.venues v on v.id = o.primary_venue_id
    join public.venues s on s.id = v.duplicate_of_id
   where s.safety_gated is true and coalesce(o.safety_gated, false) is false;
  if v_bad <> 0 then
    raise exception 'P3 failed: % orgs ungated under a gated merge survivor', v_bad;
  end if;

  -- No org is gated by a merged-away primary when neither its location nor the
  -- survivor gates it. location_is_high_risk runs on the candidates only.
  with c as materialized (
    select o.country_id, o.city_id
      from public.organizations o
      join public.venues v on v.id = o.primary_venue_id
      left join public.venues s on s.id = v.duplicate_of_id
     where v.duplicate_of_id is not null
       and o.safety_gated is true
       and s.safety_gated is not true
  )
  select count(*) into v_bad from c
   where not public.location_is_high_risk(c.country_id, c.city_id);
  if v_bad <> 0 then
    raise exception 'P4 failed: % orgs still gated by a merged-away primary venue', v_bad;
  end if;
end $verify$;
