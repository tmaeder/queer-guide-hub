-- =============================================================================
-- Migration: CMS connector tables + profiles normalization (Phase 1)
-- =============================================================================

-- 1. CMS Connector tables (needed by cms-connector-sync edge function)
CREATE TABLE IF NOT EXISTS public.cms_connectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  connector_type text NOT NULL CHECK (connector_type IN ('wordpress', 'strapi', 'contentful', 'sanity', 'custom')),
  config jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cms_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id uuid NOT NULL REFERENCES public.cms_connectors(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  started_at timestamptz,
  completed_at timestamptz,
  items_synced integer DEFAULT 0,
  items_failed integer DEFAULT 0,
  error_log jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cms_sync_jobs_connector_id ON public.cms_sync_jobs(connector_id);
CREATE INDEX idx_cms_sync_jobs_status ON public.cms_sync_jobs(status);

ALTER TABLE public.cms_connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on cms_connectors"
  ON public.cms_connectors FOR ALL
  USING (public.has_role_jwt('admin'));

CREATE POLICY "Admin full access on cms_sync_jobs"
  ON public.cms_sync_jobs FOR ALL
  USING (public.has_role_jwt('admin'));

-- 2. Profiles normalization Phase 1: Extract physical, lifestyle, dating into JSONB buckets
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS physical_attributes jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS lifestyle jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS dating_profile jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS identity_details jsonb DEFAULT '{}';

-- Backfill physical_attributes
UPDATE public.profiles SET physical_attributes = jsonb_strip_nulls(jsonb_build_object(
  'height_cm', height_cm,
  'body_type', body_type,
  'hair_color', hair_color,
  'eye_color', eye_color,
  'ethnicity', ethnicity
)) WHERE height_cm IS NOT NULL OR body_type IS NOT NULL OR hair_color IS NOT NULL
  OR eye_color IS NOT NULL OR ethnicity IS NOT NULL;

-- Backfill lifestyle
UPDATE public.profiles SET lifestyle = jsonb_strip_nulls(jsonb_build_object(
  'smoking_preference', smoking_preference,
  'drinking_preference', drinking_preference,
  'diet_preferences', diet_preferences,
  'exercise_frequency', exercise_frequency,
  'sleep_schedule', sleep_schedule,
  'has_pets', has_pets,
  'pet_preferences', pet_preferences,
  'has_children', has_children,
  'wants_children', wants_children,
  'housing_situation', housing_situation,
  'transportation_method', transportation_method,
  'willing_to_relocate', willing_to_relocate
)) WHERE smoking_preference IS NOT NULL OR drinking_preference IS NOT NULL
  OR diet_preferences IS NOT NULL OR exercise_frequency IS NOT NULL;

-- Backfill dating_profile
UPDATE public.profiles SET dating_profile = jsonb_strip_nulls(jsonb_build_object(
  'relationship_style', relationship_style,
  'relationship_goals', relationship_goals,
  'relationship_goals_detailed', relationship_goals_detailed,
  'relationship_structure_preference', relationship_structure_preference,
  'current_relationship_status', current_relationship_status,
  'partner_preferences', partner_preferences,
  'love_languages', love_languages,
  'romance_style', romance_style,
  'physical_affection_preference', physical_affection_preference,
  'dating_preferences', dating_preferences,
  'jealousy_comfort_level', jealousy_comfort_level,
  'kink_experience_level', kink_experience_level,
  'kink_interests', kink_interests,
  'bdsm_role', bdsm_role,
  'sexual_health_status', sexual_health_status,
  'protection_preferences', protection_preferences,
  'boundaries_and_limits', boundaries_and_limits,
  'consent_practices', consent_practices,
  'sexual_frequency_preference', sexual_frequency_preference,
  'sexual_exploration_openness', sexual_exploration_openness,
  'communication_about_sex', communication_about_sex,
  'intimacy_preferences', intimacy_preferences
)) WHERE relationship_style IS NOT NULL OR kink_experience_level IS NOT NULL
  OR love_languages IS NOT NULL OR dating_preferences IS NOT NULL;

-- Backfill identity_details
UPDATE public.profiles SET identity_details = jsonb_strip_nulls(jsonb_build_object(
  'chosen_name', chosen_name,
  'name_pronunciation', name_pronunciation,
  'coming_out_status', coming_out_status,
  'family_acceptance_level', family_acceptance_level,
  'workplace_safety', workplace_safety,
  'chosen_family_status', chosen_family_status,
  'romantic_orientation', romantic_orientation,
  'sexual_orientation_details', sexual_orientation_details,
  'neurodivergent_status', neurodivergent_status,
  'disability_status', disability_status,
  'mental_health_openness', mental_health_openness,
  'cultural_background', cultural_background,
  'immigration_status', immigration_status
)) WHERE chosen_name IS NOT NULL OR coming_out_status IS NOT NULL
  OR neurodivergent_status IS NOT NULL OR romantic_orientation IS NOT NULL;
