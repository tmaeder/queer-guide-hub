-- Profile declutter 2026-06: archive every DROP/MOVE candidate before column drops.
-- Restore snippet (per column):
--   ALTER TABLE public.profiles ADD COLUMN <col> <type>;
--   UPDATE public.profiles p SET <col> = (a.data->>'<col>')::<type>  -- arrays/jsonb: (a.data->'<col>')
--   FROM public.profiles_attic a WHERE a.user_id = p.user_id AND a.data ? '<col>';
-- Retention: delete table after ~2026-09-15 via a new migration.
CREATE TABLE public.profiles_attic (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  archived_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL DEFAULT 'profile_declutter_2026_06',
  data jsonb NOT NULL
);
ALTER TABLE public.profiles_attic ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles_attic FORCE ROW LEVEL SECURITY;
-- Zero policies, zero grants: service_role/postgres only. Holds sensitive residue — never widen.
REVOKE ALL ON public.profiles_attic FROM PUBLIC, anon, authenticated;

INSERT INTO public.profiles_attic (user_id, data)
SELECT user_id, jsonb_strip_nulls(
  jsonb_build_object(
    'phone_encrypted', phone_encrypted,
    'emergency_contact_phone_encrypted', emergency_contact_phone_encrypted,
    'sexual_orientation_encrypted', sexual_orientation_encrypted,
    'gender_identity_encrypted', gender_identity_encrypted,
    'relationship_status_encrypted', relationship_status_encrypted,
    'income_range_encrypted', income_range_encrypted,
    'political_views_encrypted', political_views_encrypted,
    'religious_beliefs_encrypted', religious_beliefs_encrypted,
    'physical_attributes', NULLIF(physical_attributes, '{}'::jsonb),
    'lifestyle', NULLIF(lifestyle, '{}'::jsonb),
    'dating_profile', NULLIF(dating_profile, '{}'::jsonb),
    'identity_details', NULLIF(identity_details, '{}'::jsonb),
    'height_cm', height_cm,
    'body_type', body_type,
    'hair_color', hair_color,
    'eye_color', eye_color,
    'ethnicity', ethnicity,
    'zodiac_sign', zodiac_sign,
    'personality_type', personality_type
  ) || jsonb_build_object(
    'smoking_preference', smoking_preference,
    'drinking_preference', drinking_preference,
    'diet_preferences', NULLIF(diet_preferences, '{}'),
    'food_preferences', NULLIF(food_preferences, '{}'),
    'exercise_frequency', exercise_frequency,
    'sleep_schedule', sleep_schedule,
    'has_children', has_children,
    'wants_children', wants_children,
    'has_pets', has_pets,
    'pet_preferences', pet_preferences,
    'hobbies', NULLIF(hobbies, '{}'),
    'favorite_music_genres', NULLIF(favorite_music_genres, '{}'),
    'favorite_books', NULLIF(favorite_books, '{}'),
    'favorite_movies', NULLIF(favorite_movies, '{}'),
    'industry', industry,
    'company', company,
    'job_title', job_title,
    'work_schedule', work_schedule,
    'income_range', income_range,
    'financial_situation', financial_situation,
    'housing_situation', housing_situation,
    'neighborhood_preference', neighborhood_preference,
    'willing_to_relocate', willing_to_relocate,
    'transportation_method', transportation_method
  ) || jsonb_build_object(
    'political_views', political_views,
    'religious_beliefs', religious_beliefs,
    'life_philosophy', life_philosophy,
    'community_involvement', NULLIF(community_involvement, '{}'),
    'volunteer_work', NULLIF(volunteer_work, '{}'),
    'causes_supported', NULLIF(causes_supported, '{}'),
    'activism_involvement', NULLIF(activism_involvement, '{}'),
    'support_offering', NULLIF(support_offering, '{}'),
    'support_seeking', NULLIF(support_seeking, '{}'),
    'safe_space_preferences', NULLIF(safe_space_preferences, '{}'),
    'mutual_aid_interests', NULLIF(mutual_aid_interests, '{}'),
    'community_roles', NULLIF(community_roles, '{}'),
    'content_warnings', NULLIF(content_warnings, '{}'),
    'communication_style', communication_style,
    'response_time_preference', response_time_preference,
    'communication_preferences', NULLIF(communication_preferences, '{}'::jsonb),
    'looking_for', NULLIF(looking_for, '{}'),
    'mental_health_advocacy', mental_health_advocacy,
    'therapy_friendly', therapy_friendly,
    'medication_status', medication_status,
    'mental_health_openness', mental_health_openness,
    'family_acceptance_level', family_acceptance_level,
    'workplace_safety', workplace_safety,
    'immigration_status', immigration_status
  ) || jsonb_build_object(
    'emergency_contact_name', emergency_contact_name,
    'emergency_contact_phone', emergency_contact_phone,
    'emergency_contact_relationship', emergency_contact_relationship,
    'relationship_status', relationship_status,
    'sexual_orientation_details', NULLIF(sexual_orientation_details, '{}'::jsonb),
    'relationship_goals', NULLIF(relationship_goals, '{}'),
    'relationship_goals_detailed', NULLIF(relationship_goals_detailed, '{}'),
    'relationship_structure_preference', NULLIF(relationship_structure_preference, '{}'),
    'background_check', background_check,
    'photos_visibility', photos_visibility,
    'kink_interests', NULLIF(kink_interests, '{}'),
    'bdsm_role', bdsm_role,
    'boundaries_and_limits', NULLIF(boundaries_and_limits, '{}'),
    'consent_practices', NULLIF(consent_practices, '{}'),
    'protection_preferences', NULLIF(protection_preferences, '{}'),
    'sexual_health_status', sexual_health_status,
    'kink_experience_level', kink_experience_level,
    'sexual_frequency_preference', sexual_frequency_preference,
    'communication_about_sex', communication_about_sex,
    'sexual_exploration_openness', sexual_exploration_openness,
    'jealousy_comfort_level', jealousy_comfort_level,
    'physical_affection_preference', physical_affection_preference,
    'romance_style', romance_style,
    'love_languages', NULLIF(love_languages, '{}'),
    'intimacy_preferences', NULLIF(intimacy_preferences, '{}'::jsonb),
    'partner_preferences', NULLIF(partner_preferences, '{}'::jsonb),
    'dating_preferences', NULLIF(dating_preferences, '{}'::jsonb)
  )
)
FROM public.profiles;
