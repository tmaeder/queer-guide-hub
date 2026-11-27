-- zzz_venue_gate_to_org: fire on every venue UPDATE, not only on a statement
-- that names safety_gated.
--
-- The trigger was `after update of safety_gated, duplicate_of_id on venues`. A
-- column-scoped trigger fires on the columns named in the UPDATE statement, not
-- on what changed. venues.safety_gated is usually not written by the statement
-- at all: zzzzzz_venues_safety_gated (BEFORE UPDATE OF country_id, city_id,
-- category, ...) derives it. So a statement that moved a venue's category or
-- country changed its gate and never told the organization above it.
--
-- Measured on prod 2026-11-27: one restore (actor
-- admin:cruising-merge-category-restore) moved ~100 venues from cruising to
-- sauna at 17:56. Their own gate cleared and 99 organizations stayed gated,
-- which took the critical city_safety_gate_drift gate from 0 to 99 and failed
-- `Critical data-quality gates` on every open PR. Those rows were resynced the
-- same evening by writing primary_venue_id onto itself, which fires
-- trg_organizations_safety_gated; the backfill below repeats that so the file
-- composes with any state.
--
-- That direction only hides content. The same hole opens the other way: a
-- venue moved TO cruising, or into a criminalizing country, is gated while its
-- organization stays public -- the venue_identity_gate_bypass exposure. That
-- is why this is a trigger fix and not only a data repair.
--
-- The WHEN clause already compares old and new safety_gated (and
-- duplicate_of_id), so the trigger still runs its function only when the gate
-- or the merge target actually changed; the unscoped form only lets it SEE a
-- change made by another trigger.

do $swap$
declare
  v_try int := 0;
begin
  loop
    begin
      perform set_config('lock_timeout', '2s', true);
      drop trigger if exists zzz_venue_gate_to_org on public.venues;
      create trigger zzz_venue_gate_to_org
        after update on public.venues
        for each row
        when (old.safety_gated is distinct from new.safety_gated
              or old.duplicate_of_id is distinct from new.duplicate_of_id)
        execute function public.propagate_venue_gate_to_organization();
      exit;
    exception when lock_not_available then
      v_try := v_try + 1;
      if v_try >= 20 then
        raise exception 'zzz_venue_gate_to_org: could not take the venues lock in % tries', v_try;
      end if;
      perform pg_sleep(2);
    end;
  end loop;
end
$swap$;

-- Resync any organization whose gate no longer matches its own rule. Writes the
-- value the row already holds and lets trg_organizations_safety_gated compute
-- the gate, so the result is the trigger's answer, not this file's.
update public.organizations o
   set primary_venue_id = o.primary_venue_id
 where o.primary_venue_id is not null
   and coalesce(o.safety_gated, false) is distinct from (
         public.location_is_high_risk(o.country_id, o.city_id)
         or exists (
           select 1 from public.venues v
             left join public.venues s on s.id = v.duplicate_of_id
            where v.id = o.primary_venue_id
              and ((v.duplicate_of_id is null and v.safety_gated is true)
                   or s.safety_gated is true)));

do $verify$
declare
  v_attr int2vector;
  v_qual text;
  v_bad bigint;
  v_org uuid;
  v_venue uuid;
  v_gated boolean;
begin
  select t.tgattr, pg_get_triggerdef(t.oid) into v_attr, v_qual
    from pg_trigger t
   where t.tgrelid = 'public.venues'::regclass
     and t.tgname = 'zzz_venue_gate_to_org'
     and not t.tgisinternal;
  if v_qual is null then
    raise exception 'P1 failed: zzz_venue_gate_to_org is missing';
  end if;
  if array_length(v_attr::int2[], 1) is not null then
    raise exception 'P1 failed: zzz_venue_gate_to_org is still column-scoped: %', v_qual;
  end if;
  if position('old.safety_gated IS DISTINCT FROM new.safety_gated' in v_qual) = 0 then
    raise exception 'P2 failed: zzz_venue_gate_to_org lost its WHEN clause: %', v_qual;
  end if;

  -- The exposure direction, with the predicate venue_identity_gate_bypass uses
  -- (read directly: release_gate_checks() is not assumed callable from db push).
  select count(*) into v_bad
    from public.organizations o
    join public.venues v on v.id = o.primary_venue_id
    left join public.venues s on s.id = v.duplicate_of_id
   where coalesce(o.safety_gated, false) is false
     and ((v.duplicate_of_id is null and v.safety_gated is true) or s.safety_gated is true);
  if v_bad <> 0 then
    raise exception 'P3 failed: % ungated organizations above a gated venue', v_bad;
  end if;

  -- Behavioural: a statement that names ONLY category must still move the
  -- organization's gate. Run inside a sub-block that always raises, so the
  -- savepoint rolls the probe back whatever happens.
  select o.id, v.id into v_org, v_venue
    from public.organizations o
    join public.venues v on v.id = o.primary_venue_id
   where v.duplicate_of_id is null
     and v.safety_gated is false
     and coalesce(o.safety_gated, false) is false
     and v.category::text <> 'cruising'
     and not public.location_is_high_risk(o.country_id, o.city_id)
   limit 1;
  if v_org is null then
    raise exception 'P4 failed: no ungated organization above an ungated venue to probe with';
  end if;
  begin
    update public.venues set category = 'cruising' where id = v_venue;
    select o.safety_gated into v_gated from public.organizations o where o.id = v_org;
    raise exception using errcode = 'QG001', message = coalesce(v_gated::text, 'null');
  exception when sqlstate 'QG001' then
    if sqlerrm <> 'true' then
      raise exception 'P4 failed: a category-only venue UPDATE left its organization gated=%', sqlerrm;
    end if;
  end;
end
$verify$;
