-- `city_safety_gate_drift` went CRITICAL on 96 venues the moment the cruising
-- gate landed, and the data was never wrong — the gate was.
--
-- WHAT HAPPENED --------------------------------------------------------------
-- `20261110100000_cruising_category_safety_gate.sql` (#3241) made venue gating
-- geographic OR category: `venue_is_safety_gated(country_id, city_id, category)`.
-- It correctly repointed the trigger AND `recompute_safety_gated_for_country()`
-- at that one predicate, precisely so the two could not drift.
--
-- It missed a THIRD consumer. `release_gate_checks()` carries its own inlined
-- copy of the geographic predicate, under a comment that says:
--
--     "Predicate copied verbatim from the body of location_is_high_risk so the
--      two cannot diverge."
--
-- A copy is exactly what cannot survive a deliberate divergence. Venues are now
-- gated on a rule the gate does not know about, so every correctly-gated
-- cruising venue reads as drift.
--
-- MEASURED, and the direction matters ----------------------------------------
-- 111 cruising venues are `safety_gated = true` while NOT geographically
-- high-risk — which is the new rule working. Crucially, in the other direction:
--
--     ungated_but_geographically_risky = 0, across every category.
--
-- Nothing is under-gated. No venue that should be hidden from signed-out users
-- is visible. This was a false positive, not an exposure — but a false positive
-- on a CRITICAL gate is not harmless: `Critical data-quality gates` is a
-- required check, so it went red on main at 05:22 and on every open PR after,
-- and a critical safety gate that cries wolf is one people learn to skip.
--
-- THE FIX --------------------------------------------------------------------
-- Point the venues branch at the shared predicate, which is what #3241's own
-- "ONE predicate" rule asks for. The `cc` CTE stays: events / hotels /
-- organizations / guides still resolve their country via the city and have no
-- `category` column, so their branches are unchanged. `venue_is_safety_gated`
-- resolves the city itself, so the venues branch no longer needs the join.
--
-- VERIFIED BEFORE SHIPPING ---------------------------------------------------
-- The patched function was built in a scratch schema on prod and every gate
-- compared against the live one. All 14 gates identical except the target:
--     city_safety_gate_drift   live 96  →  patched 0
-- So the change moves exactly one number and nothing else.
--
-- WHY A TEXTUAL PATCH AND NOT A RESTATE --------------------------------------
-- `release_gate_checks()` is ~10 KB. Restating it whole to change three lines
-- is a merge-collision surface, and hand-transcribing 10 KB of safety-critical
-- SQL is how a silent semantic change gets in. This asserts the fragment exists
-- BEFORE patching and asserts the result afterwards, so it cannot half-apply:
-- if a later migration edits that branch, this raises instead of silently
-- matching nothing. Same reasoning as restating from the LIVE definition rather
-- than from a migration file, which #3241 itself documents.

do $outer$
declare
  v_src text;
  v_new text;
  v_old_frag constant text :=
    E'    select ''venues'' tbl, count(*) cnt from public.venues t\n'
    '      left join cc on cc.id = t.city_id\n'
    '      where t.duplicate_of_id is null\n'
    '        and coalesce(t.safety_gated, false)\n'
    '            is distinct from coalesce(coalesce(t.country_id, cc.country_id) in (select country_id from hr), false)';
  v_new_frag constant text :=
    E'    select ''venues'' tbl, count(*) cnt from public.venues t\n'
    '      where t.duplicate_of_id is null\n'
    '        and coalesce(t.safety_gated, false)\n'
    '            is distinct from coalesce(public.venue_is_safety_gated(t.country_id, t.city_id, t.category), false)';
begin
  if to_regprocedure('public.venue_is_safety_gated(uuid,uuid,text)') is null then
    raise exception
      'venue_is_safety_gated(uuid,uuid,text) is missing — 20261110100000 must apply first';
  end if;

  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'release_gate_checks';

  if v_src is null then
    raise exception 'public.release_gate_checks() not found';
  end if;

  -- Already patched (re-run, or a later migration got here first): nothing to do.
  if position(v_new_frag in v_src) > 0 then
    raise notice 'release_gate_checks() venues branch already uses venue_is_safety_gated — skipping';
    return;
  end if;

  if position(v_old_frag in v_src) = 0 then
    raise exception
      'release_gate_checks() venues branch does not match the expected text — it has been '
      'edited since 20261112100000 was written. Re-read the live definition and redo this patch '
      'by hand rather than letting it silently match nothing.';
  end if;

  v_new := replace(v_src, v_old_frag, v_new_frag);
  execute v_new;

  -- Post-condition: the new predicate is in, the old one is out.
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'release_gate_checks';

  if position(v_new_frag in v_src) = 0 then
    raise exception 'patch did not take: venues branch still lacks venue_is_safety_gated';
  end if;
  if position(v_old_frag in v_src) > 0 then
    raise exception 'patch left the old geographic venues predicate in place';
  end if;

  raise notice 'release_gate_checks() venues branch now uses venue_is_safety_gated()';
end
$outer$;
