-- An organization's safety gate must follow its primary venue's, whichever
-- statement changed the venue.
--
-- zzz_venue_gate_to_org (99991792753155) was AFTER UPDATE OF safety_gated,
-- duplicate_of_id. A column list fires on the columns NAMED IN THE STATEMENT,
-- not on what changed: when a statement sets only `category`, the venue's own
-- BEFORE trigger recomputes safety_gated (cruising is gated everywhere), the
-- value changes, and the propagation trigger never fires. The organization
-- keeps the old gate.
--
-- Found 2026-11-27: an admin cruising-category review set `category` on ~180
-- venues between 17:56 and 18:07. Their venues were ungated, their linked
-- organizations stayed gated, and city_safety_gate_drift (critical) went
-- 0 -> 161 and failed every open PR. Reproduced in a rolled-back transaction
-- on prod: `update venues set category = 'bar'` on a gated cruising venue left
-- its organization gated; the same change with `safety_gated = false` named in
-- the statement ungated it. The 161 rows were resynced through the existing
-- rule (set_org_safety_gated, actor admin:org-safety-gate-resync), after which
-- the gate read 0.
--
-- That incident was the safe direction (over-gated). The same hole runs the
-- other way: reclassifying a venue TO cruising by setting only `category`
-- gates the venue and leaves its organization visible to signed-out readers.
--
-- The fix drops the column list. The WHEN clause already compares OLD and NEW
-- values, so the trigger still fires only when the gate or the merge state
-- actually changed; it just no longer depends on how the statement was
-- written. The function and the rule are unchanged.

-- DROP TRIGGER takes ACCESS EXCLUSIVE on venues, and a pending exclusive lock
-- queues every new reader behind it. Retry under a short lock_timeout instead
-- of waiting (the 99991792403561 pattern). Drop and create share one
-- subtransaction, so no writer ever sees venues without the trigger.
do $swap$
begin
  for i in 1..20 loop
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
      if i = 20 then raise; end if;
      perform pg_sleep(2);
    end;
  end loop;
  perform set_config('lock_timeout', '0', true);
end $swap$;

-- Resync any organization that drifted before this trigger landed (today's 161
-- were fixed live; this catches anything a category-only write produced since).
-- Re-asserting primary_venue_id recomputes the gate through set_org_safety_gated,
-- so the rule decides, never this statement.
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
  v_def text;
  v_bad bigint;
  v_org uuid;
  v_venue uuid;
  v_gated text;
begin
  select pg_get_triggerdef(t.oid) into v_def
    from pg_trigger t
   where t.tgrelid = 'public.venues'::regclass
     and t.tgname = 'zzz_venue_gate_to_org'
     and not t.tgisinternal;
  if v_def is null then
    raise exception 'P1 failed: zzz_venue_gate_to_org is not attached to public.venues';
  end if;
  -- A column list (UPDATE OF ...) is the defect this migration removes.
  if v_def ~* 'update of' then
    raise exception 'P2 failed: zzz_venue_gate_to_org is still column-scoped: %', v_def;
  end if;
  -- Without the WHEN clause every venue write would rewrite its organizations.
  if v_def !~* 'old\.safety_gated is distinct from new\.safety_gated' then
    raise exception 'P3 failed: zzz_venue_gate_to_org lost its value comparison: %', v_def;
  end if;

  -- P4: the exposure direction. No organization may be visible above a gated
  -- venue. Zero on an empty database too, so this never needs data to pass.
  select count(*) into v_bad
    from public.organizations o
    join public.venues v on v.id = o.primary_venue_id
    left join public.venues s on s.id = v.duplicate_of_id
   where coalesce(o.safety_gated, false) is false
     and ((v.duplicate_of_id is null and v.safety_gated is true) or s.safety_gated is true);
  if v_bad <> 0 then
    raise exception 'P4 failed: % ungated organization(s) above a gated venue', v_bad;
  end if;

  -- P5, behavioural: a statement naming ONLY category must move the
  -- organization's gate. A definition check cannot tell a live trigger from a
  -- dead one. The probe runs in a sub-block that always raises, so its
  -- savepoint rolls the change back. With no row to probe (a fresh database
  -- in CI) it is skipped with a notice: absence of data is not a defect.
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
    raise notice 'P5 skipped: no ungated organization above an ungated venue to probe with';
  else
    begin
      update public.venues set category = 'cruising' where id = v_venue;
      select coalesce(o.safety_gated::text, 'null') into v_gated
        from public.organizations o where o.id = v_org;
      raise exception using errcode = 'QG001', message = v_gated;
    exception when sqlstate 'QG001' then
      if sqlerrm <> 'true' then
        raise exception 'P5 failed: a category-only venue update left its organization gated=%', sqlerrm;
      end if;
    end;
  end if;
end $verify$;
