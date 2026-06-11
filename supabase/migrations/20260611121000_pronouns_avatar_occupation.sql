-- Settings redesign: ordered pronoun tags, unavatar avatar type,
-- occupation free-text feedback loop.

-- 1. Ordered pronoun sets. profiles.pronouns stays as the denormalized
--    display string (all render sites keep working); pronoun_tags is the
--    structured source the new combobox edits.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pronoun_tags text[];

UPDATE profiles
SET pronoun_tags = ARRAY[trim(pronouns)]
WHERE pronouns IS NOT NULL AND trim(pronouns) <> '' AND pronoun_tags IS NULL;

-- 2. avatar_type gains 'unavatar' (worker-proxied import) and 'initials'
--    (already written by the frontend but missing from the original CHECK).
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_avatar_type_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_avatar_type_check CHECK (
  avatar_type IS NULL OR avatar_type = ANY (ARRAY['upload','builder','initials','unavatar','gravatar'])
);

-- 3. Occupation free-text candidates: user self-descriptions that don't match
--    the shared professions vocabulary. Read-only editorial surface — terms
--    are promoted into public.professions MANUALLY, never automatically, and
--    user rows are never rewritten. service_role only (occupations of
--    non-public profiles must not leak through the view).
CREATE OR REPLACE VIEW occupation_freetext_candidates
WITH (security_invoker = false) AS
SELECT
  lower(trim(p.occupation)) AS term,
  count(*) AS user_count,
  min(p.created_at) AS first_seen
FROM profiles p
WHERE p.occupation IS NOT NULL
  AND trim(p.occupation) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM professions pr
    WHERE lower(pr.name) = lower(trim(p.occupation))
       OR lower(trim(p.occupation)) = ANY (pr.aliases)
  )
GROUP BY lower(trim(p.occupation))
ORDER BY count(*) DESC;

REVOKE ALL ON occupation_freetext_candidates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON occupation_freetext_candidates TO service_role;
