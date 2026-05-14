-- Create a safe public view for profiles with privacy-aware masking
-- This avoids exposing sensitive columns directly via the base table

-- Create or replace the view
CREATE OR REPLACE VIEW public.profiles_public AS
SELECT
  p.id,
  p.user_id,
  p.display_name,
  p.avatar_url,
  p.created_at,
  p.updated_at,
  p.verified_identity,
  p.is_business,
  p.age_range,
  p.relationship_status,
  p.has_children,
  p.has_pets,
  p.occupation,
  p.education,
  p.website,
  p.interests,
  -- Masked fields based on privacy settings
  CASE WHEN (p.privacy_settings->>'pronouns_public') = 'true' THEN p.pronouns ELSE NULL END AS pronouns,
  CASE WHEN (p.privacy_settings->>'bio_public') = 'true' THEN p.bio ELSE NULL END AS bio,
  CASE WHEN (p.privacy_settings->>'location_public') = 'true' THEN p.location ELSE NULL END AS location,
  CASE WHEN (p.privacy_settings->>'gender_identity_public') = 'true' THEN p.gender_identity ELSE NULL END AS gender_identity,
  CASE WHEN (p.privacy_settings->>'sexual_orientation_public') = 'true' THEN p.sexual_orientation ELSE NULL END AS sexual_orientation
FROM public.profiles p
WHERE
  (p.privacy_settings->>'pronouns_public') = 'true'
  OR (p.privacy_settings->>'bio_public') = 'true'
  OR (p.privacy_settings->>'location_public') = 'true'
  OR (p.privacy_settings->>'gender_identity_public') = 'true'
  OR (p.privacy_settings->>'sexual_orientation_public') = 'true';

-- Grant read access to the view for public API roles
GRANT SELECT ON public.profiles_public TO anon, authenticated;