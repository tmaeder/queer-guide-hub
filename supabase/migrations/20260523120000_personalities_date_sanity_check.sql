-- Ensure death_date is strictly after birth_date when both are set.
ALTER TABLE public.personalities
  ADD CONSTRAINT personalities_birth_before_death
  CHECK (
    death_date IS NULL
    OR birth_date IS NULL
    OR death_date > birth_date
  );

COMMENT ON CONSTRAINT personalities_birth_before_death ON public.personalities
  IS 'death_date must be strictly after birth_date when both are set';
