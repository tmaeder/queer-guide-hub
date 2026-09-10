-- URGENT CORRECTION to 20260910143903 (applied ~40 minutes earlier in the same session).
--
-- That migration "repaired" venues.safety_gated to equal location_is_high_risk(country_id, city_id).
-- That is NOT the definition. Since 20261112100000 the venue rule is:
--
--     safety_gated = location_is_high_risk(country_id, city_id) OR category = 'cruising'
--
-- Cruising venues are gated EVERYWHERE, independent of the destination's laws, because publishing
-- a cruising location to anonymous visitors is an outing/safety exposure in its own right. By
-- dropping that term the repair ungated 106 cruising venues in legal countries -- exactly the
-- fail-open direction the migration's own abort guard was written to prevent. The guard did not
-- fire because it was built from the same wrong predicate it was meant to check.
--
-- release_gate_checks().city_safety_gate_drift caught it within minutes (critical, 106, venues),
-- and its inline comment states the rule verbatim -- including the sentence "Measured on prod
-- while this PR omitted it: 106 drift rows against the live arm's 0, over 107 gated cruising
-- venues". The number matched exactly.
--
-- AFTERMATH, measured: venues.safety_gated went 1346 -> 1224 -> 1346. ALL 122 venues the earlier
-- migration "unhid" were cruising venues, correctly gated by the term it did not know about; 122
-- of the 1346 are gated ONLY by that term. There was never any drift. The original finding was a
-- false positive produced by reconstructing a derived flag from an inferred predicate. The
-- country-name pattern that made it look real (Spain 36, Germany 21, Italy 10) is simply where
-- this catalogue's cruising venues are.
--
-- Lesson recorded where the next person will hit it: safety_gated has TWO terms, and
-- location_is_high_risk() is only one of them. Never reconstruct a derived safety flag from a
-- predicate you inferred -- read the writer (the BEFORE trigger) or the gate that audits it.

do $$
declare
  v_regated integer;
  v_drift   integer;
begin
  update public.venues v
  set safety_gated = true
  where coalesce(v.category = 'cruising', false)
    and not coalesce(v.safety_gated, false);

  get diagnostics v_regated = row_count;
  raise notice 're-gated % cruising venue(s) wrongly ungated by 20260910143903', v_regated;

  -- Re-assert the REAL invariant, matching release_gate_checks().city_safety_gate_drift.
  select count(*) into v_drift
  from public.venues t
  where t.duplicate_of_id is null
    and coalesce(t.safety_gated, false) is distinct from coalesce(
          public.location_is_high_risk(t.country_id, t.city_id)
          or coalesce(t.category = 'cruising', false), false);

  if v_drift > 0 then
    raise exception 'safety_gated still drifted on % venue(s) against the two-term rule', v_drift;
  end if;
end $$;
