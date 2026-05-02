-- Add cause_of_death column to personalities (controlled vocabulary)
ALTER TABLE public.personalities
  ADD COLUMN IF NOT EXISTS cause_of_death text
  CHECK (cause_of_death IS NULL OR cause_of_death IN (
    'natural', 'illness', 'hiv_aids', 'suicide', 'homicide',
    'accident', 'overdose', 'execution', 'unknown', 'other'
  ));

COMMENT ON COLUMN public.personalities.cause_of_death IS
  'Cause of death (controlled vocabulary). Only meaningful when death_date is set.';
