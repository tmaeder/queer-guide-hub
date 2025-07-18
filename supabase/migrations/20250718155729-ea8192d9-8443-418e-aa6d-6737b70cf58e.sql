-- Add more comprehensive user profile attributes
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS height_cm integer;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS body_type text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hair_color text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS eye_color text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ethnicity text;

-- Lifestyle preferences
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS smoking_preference text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS drinking_preference text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS diet_preferences text[];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS exercise_frequency text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sleep_schedule text;

-- Relationship and family
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS relationship_goals text[];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS has_children boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wants_children text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pet_preferences text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS has_pets boolean DEFAULT false;

-- Professional details
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS industry text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS job_title text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS work_schedule text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS income_range text;

-- Personal interests and preferences
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hobbies text[];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS favorite_music_genres text[];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS favorite_books text[];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS favorite_movies text[];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS travel_preferences jsonb DEFAULT '{}';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS food_preferences text[];

-- Personality and beliefs
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS personality_type text; -- MBTI, etc.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS zodiac_sign text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS political_views text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS religious_beliefs text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS life_philosophy text;

-- Verification and trust
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verified_email boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verified_phone boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verified_identity boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS background_check boolean DEFAULT false;

-- Activity and engagement
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_active_at timestamp with time zone;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS profile_completion_percentage integer DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS communication_style text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS response_time_preference text;

-- Social and community
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS community_involvement text[];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS volunteer_work text[];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS causes_supported text[];

-- Health and wellness
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mental_health_advocacy boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS therapy_friendly boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS medication_status text;

-- Location and mobility
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS willing_to_relocate boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS transportation_method text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS neighborhood_preference text;

-- Update the trigger to calculate profile completion
CREATE OR REPLACE FUNCTION public.calculate_profile_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  total_fields INTEGER := 50; -- Adjust based on total profile fields
  filled_fields INTEGER := 0;
  completion_percentage INTEGER;
BEGIN
  -- Count non-null fields
  IF NEW.display_name IS NOT NULL AND NEW.display_name != '' THEN filled_fields := filled_fields + 1; END IF;
  IF NEW.first_name IS NOT NULL AND NEW.first_name != '' THEN filled_fields := filled_fields + 1; END IF;
  IF NEW.last_name IS NOT NULL AND NEW.last_name != '' THEN filled_fields := filled_fields + 1; END IF;
  IF NEW.bio IS NOT NULL AND NEW.bio != '' THEN filled_fields := filled_fields + 1; END IF;
  IF NEW.avatar_url IS NOT NULL AND NEW.avatar_url != '' THEN filled_fields := filled_fields + 1; END IF;
  IF NEW.location IS NOT NULL AND NEW.location != '' THEN filled_fields := filled_fields + 1; END IF;
  IF NEW.age_range IS NOT NULL AND NEW.age_range != '' THEN filled_fields := filled_fields + 1; END IF;
  IF NEW.gender_identity IS NOT NULL AND NEW.gender_identity != '' THEN filled_fields := filled_fields + 1; END IF;
  IF NEW.pronouns IS NOT NULL AND NEW.pronouns != '' THEN filled_fields := filled_fields + 1; END IF;
  IF NEW.sexual_orientation IS NOT NULL AND NEW.sexual_orientation != '' THEN filled_fields := filled_fields + 1; END IF;
  IF NEW.occupation IS NOT NULL AND NEW.occupation != '' THEN filled_fields := filled_fields + 1; END IF;
  IF NEW.education IS NOT NULL AND NEW.education != '' THEN filled_fields := filled_fields + 1; END IF;
  IF NEW.height_cm IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF NEW.body_type IS NOT NULL AND NEW.body_type != '' THEN filled_fields := filled_fields + 1; END IF;
  IF NEW.industry IS NOT NULL AND NEW.industry != '' THEN filled_fields := filled_fields + 1; END IF;
  IF NEW.relationship_status IS NOT NULL AND NEW.relationship_status != '' THEN filled_fields := filled_fields + 1; END IF;
  
  -- Calculate percentage
  completion_percentage := ROUND((filled_fields::FLOAT / total_fields) * 100);
  NEW.profile_completion_percentage := completion_percentage;
  
  RETURN NEW;
END;
$$;

-- Create trigger for profile completion calculation
DROP TRIGGER IF EXISTS update_profile_completion ON public.profiles;
CREATE TRIGGER update_profile_completion
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_profile_completion();