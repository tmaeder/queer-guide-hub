-- ============================================================================
-- best_time_to_visit becomes a review-gated field
-- ============================================================================
-- WHY, measured rather than assumed.
--
-- `city-agentic-enrich` auto-published three narrative fields into empty columns
-- at confidence >= 0.8: description, local_customs, best_time_to_visit. The third
-- had never once fired: across all 209 cities the composer had ever touched it
-- returned null 209/209, and this repo records that conservatism as CORRECT for a
-- no-fabrication stance, not as a coverage gap.
--
-- The 2026-09-11 voice A/B changed that. Running the same five cities twice against
-- live sources (dry run, nothing written), `voice: 'compact'` filled the field on 2
-- of 5 where `voice: 'off'` filled it on 0 of 5 — and one of the two was WRONG:
--
--   Busan   "May to October ... coinciding with the Busan Queer Festival typically
--            held in June or July."      <- the Busan Queer Culture Festival is a
--                                           September/October event. June/July is
--                                           SEOUL's festival. Confidence 0.8.
--   Chillan "December to February for dry, warm summers ..."   <- correct.
--
-- At the 0.8 bar that Busan sentence publishes. The field is a fabrication surface
-- BY CONSTRUCTION, unlike its two siblings: the grounding sources (a Wikipedia
-- extract and the city's official site) say what a city IS, and almost never say
-- when to go — so "best time to visit" is the one narrative field the model can only
-- answer by reaching past what it was given. description and local_customs restate
-- the sources; this one extrapolates from them.
--
-- NOTHING AUTOMATED WOULD HAVE CAUGHT IT. styleguide_content_drift() scores
-- vocabulary, and that sentence carries no avoid phrase — it is not in the wrong
-- REGISTER, it is wrong about a queer event on a queer travel platform. The voice
-- itself is a clear improvement on every measure taken (drift 2 hits -> 1, `vibrant`
-- gone, confidence 0.82 -> 0.86, JSON parsed 5/5, no truncation where the control
-- arm truncated Busan mid-sentence). So the answer is to gate the one field that
-- started fabricating, not to hold the voice back.
--
-- WHAT THIS MIGRATION IS FOR. The edge function change alone is NOT enough and would
-- be the worse half-fix: approve_entity_review() looks the field up in
-- review_field_registry and RAISES 'unsupported review field: %' when it is absent.
-- Queueing a field with no registry row produces exactly the failure this codebase
-- has already shipped once — a queue that collects human decisions and discards them
-- (the 40-day ai_validation_status incident). The row must land with the code.
--
-- batchable = FALSE is the load-bearing column. approve_entity_review_batch() approves
-- every OPEN row whose registry entry says `batchable`, with no human reading it — so
-- a batchable row here would hand the fabricated sentence straight back to the column
-- this migration is removing it from, and the whole change would be decorative.
--
-- apply_mode = 'text_required' so an empty or whitespace proposal RAISES instead of
-- blanking a column a human may have curated. risk_gate stays NULL: travel timing is
-- not an outing risk, and 'criminalizing_destination' is reserved for the fields where
-- approving is itself the dangerous act (safety_notes, venue category).
--
-- Soft on preconditions (a concurrent session may have added this row), hard on the
-- postcondition this file exists to reach.
-- ============================================================================

INSERT INTO public.review_field_registry
  (entity_type, field, label, target_table, target_column,
   value_key, apply_mode, apply_args, batchable, risk_gate, active)
VALUES
  ('city', 'best_time_to_visit', 'Best time to visit', 'cities', 'best_time_to_visit',
   'value', 'text_required', '{}'::jsonb, false, NULL, true)
ON CONFLICT (entity_type, field) DO UPDATE
   SET label         = EXCLUDED.label,
       target_table  = EXCLUDED.target_table,
       target_column = EXCLUDED.target_column,
       value_key     = EXCLUDED.value_key,
       apply_mode    = EXCLUDED.apply_mode,
       apply_args    = EXCLUDED.apply_args,
       batchable     = EXCLUDED.batchable,
       risk_gate     = EXCLUDED.risk_gate,
       active        = EXCLUDED.active;

-- ---------------------------------------------------------------
-- Postconditions
-- ---------------------------------------------------------------
DO $verify$
DECLARE
  reg public.review_field_registry%ROWTYPE;
  v_col_exists boolean;
BEGIN
  SELECT * INTO reg FROM public.review_field_registry
   WHERE entity_type = 'city' AND field = 'best_time_to_visit';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'registry row missing — every queued proposal would be unapprovable';
  END IF;

  IF NOT reg.active THEN
    RAISE EXCEPTION 'registry row is inactive — approve_entity_review requires active';
  END IF;

  -- The whole point of the change. A batchable row is auto-approved with no human,
  -- which puts the fabricated value back in the column.
  IF reg.batchable THEN
    RAISE EXCEPTION 'best_time_to_visit must not be batchable — bulk approve would publish it unread';
  END IF;

  IF reg.apply_mode <> 'text_required' THEN
    RAISE EXCEPTION 'expected apply_mode text_required, found %', reg.apply_mode;
  END IF;

  -- _apply_review_value does `UPDATE public.<target_table> SET <target_column>`, so a
  -- typo in either is a runtime 42703 on the reviewer's click, not here.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = reg.target_table
       AND column_name  = reg.target_column
  ) INTO v_col_exists;
  IF NOT v_col_exists THEN
    RAISE EXCEPTION 'registry points at %.% which does not exist', reg.target_table, reg.target_column;
  END IF;

  -- The two siblings that stay auto-published must still be absent from the registry:
  -- adding them here would silently route description/local_customs through review too
  -- and stall the enrichment path this change is meant to leave running.
  IF EXISTS (
    SELECT 1 FROM public.review_field_registry
     WHERE entity_type = 'city' AND field IN ('description', 'local_customs')
  ) THEN
    RAISE EXCEPTION 'description/local_customs were gated too — that is not this change';
  END IF;
END
$verify$;
