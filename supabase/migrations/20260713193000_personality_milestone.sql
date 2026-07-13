-- Personality milestones (ported from the standalone PHP curation tool).
-- A free-text "Meilenstein" note per person — a notable first / landmark event
-- (e.g. "First openly gay MP in ..."). Distinct from `achievements` (jsonb list
-- of awards) and from tags: it is a single editorial highlight string, surfaced
-- as its own admin stream at /admin/personalities/milestones.
ALTER TABLE public.personalities
  ADD COLUMN IF NOT EXISTS milestone text;

COMMENT ON COLUMN public.personalities.milestone IS
  'Editorial milestone highlight (free text). Ported from the PHP curation tool''s meilenstein column. Admin-curated; surfaced in the /admin/personalities/milestones stream.';

-- Partial index: the milestone stream only ever reads rows that HAVE a milestone,
-- and that is a tiny fraction of the ~16k personalities.
CREATE INDEX IF NOT EXISTS idx_personalities_milestone
  ON public.personalities (name)
  WHERE milestone IS NOT NULL AND milestone <> '';
