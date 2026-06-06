-- C-2 / H-5 (audit 2026-06-05) — finalize the controlled-vocab constraint.
-- Runs after scripts/data-quality/backfill-personality-identity.sql has remapped
-- every legacy free-text value to the controlled vocab. VALIDATE now confirms no
-- row violates it; the constraint was added NOT VALID in 20260605120000.
alter table public.personalities
  validate constraint personalities_lgbti_connection_vocab;
