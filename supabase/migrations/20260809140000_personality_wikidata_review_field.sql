-- Make personality namesake-conflict reviews actionable.
--
-- The namesake sweep (scripts/data-quality/verify-personality-wikidata.mjs)
-- auto-repairs the adult cohort but QUEUES conflicts for every other cohort,
-- because ~2,600 of the 4,676 non-adult QID rows carry German professions whose
-- conflict rate was never measured and a false strip on a real historical LGBTQ+
-- figure is worse than a stale date.
--
-- Those queued rows were un-approvable: approve_entity_review() looks the
-- (entity_type, field) pair up in review_field_registry and raises
-- `unsupported review field: wikidata_qid` (22023) when it is absent. Only
-- lgbti_connection, lgbti_details and verification_status were registered for
-- personalities, so every queued namesake conflict would have thrown.
--
-- Approving clears the Wikidata link to a SKIP_ sentinel — the convention the
-- promotion gate and truth engine already read as "no Wikidata match" — and
-- flags the row for attention. It deliberately does NOT clear birth_date /
-- death_date / external_ids the way the adult auto-repair does: outside the
-- measured cohort we are only confident the LINK is wrong, not that every
-- inherited value is. Breaking the link stops the row being re-poisoned on the
-- next refresh and leaves the facts for a human.

insert into public.review_field_registry
  (entity_type, field, label, target_table, target_column, value_key,
   apply_mode, apply_args, batchable, risk_gate, active)
values
  ('personality', 'wikidata_qid', 'Wikidata link (namesake conflict)',
   'personalities', 'wikidata_qid', 'value',
   'text_required',
   -- set_true on needs_attention keeps the row in triage after the link is cut,
   -- since the inherited dates still want a human eye.
   '{"touch": ["updated_at"], "set_true": ["needs_attention"]}'::jsonb,
   -- Not batchable: each row is an individual identity judgement, and batch
   -- approval of person records is the same namesake/outing risk that keeps
   -- personalities out of approve_dedup_review_batch.
   false,
   null,
   true)
on conflict (entity_type, field) do update
  set label         = excluded.label,
      target_table  = excluded.target_table,
      target_column = excluded.target_column,
      value_key     = excluded.value_key,
      apply_mode    = excluded.apply_mode,
      apply_args    = excluded.apply_args,
      batchable     = excluded.batchable,
      active        = excluded.active;
