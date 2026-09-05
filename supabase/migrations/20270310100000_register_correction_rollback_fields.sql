-- Register the three city fields the public-dataset backfills write, so their
-- corrections can actually be rolled back.
--
-- THE DEFECT, found by an end-to-end test on prod rather than by review:
--
-- `rollback_external_correction_batch` (20270301100400) resolves
-- (entity_type, field) -> target_table.target_column through
-- `review_field_registry`, deliberately reusing that map instead of adding a
-- second whitelist that would drift from it. It refuses a batch — the WHOLE
-- batch, by design, because a half-revert is a worse state than none — when any
-- field in it is unmapped.
--
-- The three jobs shipped alongside it write exactly these fields:
--     backfill-city-timezone.mjs  -> cities.timezone
--     backfill-city-climate.mjs   -> cities.climate_type
--     backfill-city-region.mjs    -> cities.region_name
-- and NONE of them was registered. Measured on prod 2026-09-05: all three
-- absent. So the before-image audit was recording changes faithfully while the
-- revert path for every one of them would have raised
--     cannot revert batch <uuid>: no review_field_registry mapping for
--     city.timezone, city.climate_type, city.region_name
--
-- The safety net was inoperative for precisely the jobs it was built to cover.
-- Nothing was damaged — `external_correction_audit` still holds 0 rows because
-- no backfill has run with --apply yet — which is the only reason this is a
-- registration and not an incident.
--
-- The guard itself behaved correctly: it named the missing mappings rather than
-- reverting the resolvable subset. That error message is what made this a
-- one-migration fix, and it is why the refusal is all-or-nothing.
--
-- WHY THIS WAS INVISIBLE UNTIL IT RAN. The rollback's own test asserts that an
-- unmapped field refuses and names the offender — it tests the GUARD. It cannot
-- test that a particular field is registered, because registration is data in a
-- table, not a property of the code. A text-scanning test would have had to know
-- which fields the scripts write, which is exactly the coupling the registry
-- exists to avoid. The check that closes this belongs at the end of this file.

insert into public.review_field_registry
  (entity_type, field, label, target_table, target_column, value_key,
   apply_mode, apply_args, batchable, risk_gate, active)
values
  -- text_required rather than text: a review approval must never NULL one of
  -- these back out. The rollback path ignores apply_mode entirely and always
  -- SETs verbatim — one of the modes is `text_array_union`, and a revert that
  -- merged would union the bad value back in instead of restoring.
  ('city', 'timezone', 'City timezone (IANA)', 'cities', 'timezone', 'value',
   'text_required', '{}'::jsonb, true, null, true),
  ('city', 'climate_type', 'City climate type', 'cities', 'climate_type', 'value',
   'text_required', '{}'::jsonb, true, null, true),
  ('city', 'region_name', 'City region / state', 'cities', 'region_name', 'value',
   'text_required', '{}'::jsonb, true, null, true)
on conflict (entity_type, field) do update
  set target_table  = excluded.target_table,
      target_column = excluded.target_column,
      apply_mode    = excluded.apply_mode,
      active        = true;

-- Assert the thing this migration exists to guarantee: that a batch touching
-- any of these three now resolves. This mirrors what the rollback does — join
-- the audit's (entity_type, field) against the registry and require a non-null
-- target_column — so it fails here rather than during an emergency revert.
do $$
declare
  v_missing text[];
begin
  select coalesce(array_agg(f.field order by f.field), '{}')
    into v_missing
  from (values ('timezone'), ('climate_type'), ('region_name')) f(field)
  where not exists (
    select 1 from public.review_field_registry r
    where r.entity_type = 'city'
      and r.field = f.field
      and r.active
      and r.target_table is not null
      and r.target_column is not null
  );

  if array_length(v_missing, 1) is not null then
    raise exception
      'city fields still unresolvable for rollback: %. rollback_external_correction_batch would refuse any batch containing them.',
      array_to_string(v_missing, ', ');
  end if;

  -- The registry's own CHECK forbids batchable together with a risk_gate or an
  -- accessibility field; assert we did not smuggle one in.
  if exists (
    select 1 from public.review_field_registry
    where entity_type = 'city'
      and field in ('timezone', 'climate_type', 'region_name')
      and batchable and (risk_gate is not null or field like 'accessibility%')
  ) then
    raise exception 'a city correction field is batchable AND risk-gated — rfr_never_batch_high_risk should have caught this';
  end if;
end $$;
