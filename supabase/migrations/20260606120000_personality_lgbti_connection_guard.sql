-- Trust-&-safety audit 2026-06-05 remediation: lock in the people outing-risk fix.
-- Findings C-2 / H-5 / M-6 (docs/audits/2026-06-05-trust-safety-audit.md).
--
-- 1. lgbti_connection must come from a controlled vocabulary (or be NULL = "not
--    classified"). Prevents regression to free-text identity labels like the
--    "Gay adult performer" string applied to 5k+ living people.
-- 2. A person with a death_date can never be is_living = true.

-- Guard 1: controlled vocabulary for lgbti_connection (NULL allowed = unknown).
ALTER TABLE public.personalities
  DROP CONSTRAINT IF EXISTS personalities_lgbti_connection_vocab;
ALTER TABLE public.personalities
  ADD CONSTRAINT personalities_lgbti_connection_vocab
  CHECK (
    lgbti_connection IS NULL
    OR lgbti_connection IN (
      'community_member', 'ally', 'activist', 'representation', 'none_known', 'unclear'
    )
  );

-- Guard 2: is_living / death_date consistency.
CREATE OR REPLACE FUNCTION public.enforce_personality_is_living()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- A recorded death date is authoritative: the person is not living.
  IF NEW.death_date IS NOT NULL THEN
    NEW.is_living := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_personality_is_living ON public.personalities;
CREATE TRIGGER trg_personality_is_living
  BEFORE INSERT OR UPDATE OF death_date, is_living
  ON public.personalities
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_personality_is_living();
