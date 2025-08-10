-- Recreate privacy-aware public profiles view with required public fields used by directory
DROP VIEW IF EXISTS public.profiles_public CASCADE;

CREATE VIEW public.profiles_public AS
SELECT
  p.user_id,
  p.display_name,
  p.avatar_url,
  p.created_at,
  p.last_active_at,
  p.age_range,
  p.relationship_status,
  p.occupation,
  p.education,
  p.is_business,
  p.has_children,
  p.has_pets,
  p.verified_identity,
  p.interests,
  p.user_mode,
  -- Privacy-gated fields
  CASE WHEN COALESCE(p.privacy_settings->>'pronouns_public','false')::boolean THEN p.pronouns ELSE NULL END AS pronouns,
  CASE WHEN COALESCE(p.privacy_settings->>'bio_public','false')::boolean THEN p.bio ELSE NULL END AS bio,
  CASE WHEN COALESCE(p.privacy_settings->>'location_public','false')::boolean THEN p.location ELSE NULL END AS location,
  CASE WHEN COALESCE(p.privacy_settings->>'gender_identity_public','false')::boolean THEN p.gender_identity ELSE NULL END AS gender_identity,
  CASE WHEN COALESCE(p.privacy_settings->>'sexual_orientation_public','false')::boolean THEN p.sexual_orientation ELSE NULL END AS sexual_orientation
FROM public.profiles p;

GRANT SELECT ON public.profiles_public TO anon, authenticated;