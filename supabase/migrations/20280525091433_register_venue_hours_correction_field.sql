-- Register `venue.hours`, the one field the P3 POI join writes that no review
-- surface had ever needed — so its corrections can be rolled back.
--
-- This is the same defect class as 20270310100000, caught before it shipped
-- rather than after. `rollback_external_correction_batch` (20270301100400)
-- resolves (entity_type, field) -> target_table.target_column through
-- `review_field_registry` and refuses the WHOLE batch when any field is
-- unmapped. The P3 join (scripts/data-quality/poi-match.mjs) writes three
-- venue fields into `external_correction_audit`:
--
--     venues.phone     — already registered (20260801130000)
--     venues.website   — already registered (20260801130000)
--     venues.hours     — NOT registered anywhere: this file
--
-- `hours` had no registry row because nothing has ever reviewed opening hours;
-- it is the field with the largest gap in the corpus (97.9% empty in Germany)
-- and the one P3 exists to fill, which is exactly the combination that makes an
-- unregistered field dangerous: high write volume, zero prior human contact.
--
-- WHY `jsonb_shallow_merge` AND NOT `text`. `venues.hours` is jsonb. `text`
-- would write a JSON string into a jsonb column on any review approval. The
-- ROLLBACK path ignores apply_mode entirely and always SETs verbatim (its
-- header says so, because one of the modes merges and a merging revert would
-- union the bad value back in) — so the mode matters only for the approval
-- path, which is precisely why it must still be right.
--
-- WHY `active = true` rather than registering it inert. `erq_validate_field()`
-- gates queue INSERTs on `active`, while the rollback join does not check it,
-- so `active=false` would also have satisfied the revert path. It is set true
-- so the field behaves like every other registered one: if a human ever does
-- review an hours proposal, the approval writes correct jsonb instead of
-- raising `unregistered review field`. An active row creates no queue rows by
-- itself.
--
-- Accessibility is deliberately NOT touched here. `venue.accessibility_attributes`
-- is already registered with `batchable = false`, and the CHECK
-- `rfr_never_batch_high_risk` makes that unspellable otherwise. P3 never writes
-- accessibility to `venues` at all — it routes every accessibility finding to
-- `entity_review_queue`, because a wrong access claim is real-world harm and the
-- errors are not symmetric: a traveller wrongly told a door is step-free arrives
-- and cannot get in.

insert into public.review_field_registry
  (entity_type, field, label, target_table, target_column, value_key,
   apply_mode, apply_args, batchable, risk_gate, active)
values
  ('venue', 'hours', 'Opening hours', 'venues', 'hours', 'value',
   'jsonb_shallow_merge', '{}'::jsonb, true, null, true)
on conflict (entity_type, field) do update
  set target_table  = excluded.target_table,
      target_column = excluded.target_column,
      apply_mode    = excluded.apply_mode,
      active        = true;

-- Assert what this migration exists to guarantee, mirroring the rollback's own
-- resolution join, so it fails here rather than during an emergency revert.
do $$
declare
  v_missing text[];
begin
  select coalesce(array_agg(f.field order by f.field), '{}')
    into v_missing
  from (values ('hours'), ('phone'), ('website')) f(field)
  where not exists (
    select 1 from public.review_field_registry r
    where r.entity_type = 'venue'
      and r.field = f.field
      and r.target_table is not null
      and r.target_column is not null
  );

  if array_length(v_missing, 1) is not null then
    raise exception
      'venue fields still unresolvable for rollback: %. rollback_external_correction_batch would refuse any P3 batch containing them.',
      array_to_string(v_missing, ', ');
  end if;

  -- The column the registry points at must exist and be a type the rollback can
  -- restore. `jsonb` is in its supported set; an unsupported type RAISEs mid-revert,
  -- which is the worst possible moment to discover it.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'venues'
      and column_name = 'hours' and data_type = 'jsonb'
  ) then
    raise exception 'venues.hours is not jsonb — rollback_external_correction_batch cannot restore it';
  end if;

  -- Accessibility must remain review-only. Asserted rather than assumed: this
  -- is the carve-out the whole programme is built around.
  if exists (
    select 1 from public.review_field_registry
    where entity_type = 'venue' and field = 'accessibility_attributes' and batchable
  ) then
    raise exception 'venue.accessibility_attributes became batchable — it must never auto-apply in bulk';
  end if;
end $$;
