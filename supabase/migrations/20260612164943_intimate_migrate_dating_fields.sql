-- Move dating/kink data from profiles into the opt-in intimate module.
-- Only opted-in users get their data merged; everyone else's values live in
-- profiles_attic only (opt-in contract: never seed intimate data without consent).
-- NOTE: intimate_profiles.id holds the auth user id (see
-- 20260612160107_fix_intimate_profiles_fk_to_user_id), so the join is
-- profiles.user_id = intimate_profiles.id. The originally applied version of
-- this migration joined on profiles.id — a no-op since every movable column
-- was empty at apply time (verified 2026-06-12); this file carries the correct
-- join for fresh rebuilds.
ALTER TABLE public.intimate_profiles
  ADD COLUMN IF NOT EXISTS dating_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.intimate_profiles ip SET
  into_tags = (SELECT coalesce(array_agg(DISTINCT t), '{}')
               FROM unnest(ip.into_tags || coalesce(p.kink_interests, '{}')) t),
  role = CASE
           WHEN p.bdsm_role IN ('dominant','submissive','switch','top','bottom','versatile')
                AND NOT (p.bdsm_role = ANY(ip.role))
           THEN ip.role || p.bdsm_role
           ELSE ip.role
         END,
  limits = (SELECT coalesce(array_agg(DISTINCT t), '{}')
            FROM unnest(ip.limits || coalesce(p.boundaries_and_limits, '{}')) t),
  safer_sex_prefs = (SELECT coalesce(array_agg(DISTINCT t), '{}')
                     FROM unnest(ip.safer_sex_prefs
                       || coalesce(p.protection_preferences, '{}')
                       || CASE WHEN p.sexual_health_status IS NOT NULL
                               THEN ARRAY[p.sexual_health_status] ELSE '{}'::text[] END) t),
  dating_prefs = ip.dating_prefs || jsonb_strip_nulls(jsonb_build_object(
    'kink_experience_level', p.kink_experience_level,
    'sexual_frequency_preference', p.sexual_frequency_preference,
    'communication_about_sex', p.communication_about_sex,
    'sexual_exploration_openness', p.sexual_exploration_openness,
    'jealousy_comfort_level', p.jealousy_comfort_level,
    'physical_affection_preference', p.physical_affection_preference,
    'romance_style', p.romance_style,
    'love_languages', NULLIF(p.love_languages, '{}'),
    'consent_practices', NULLIF(p.consent_practices, '{}'),
    'relationship_goals', NULLIF(p.relationship_goals, '{}'),
    'relationship_goals_detailed', NULLIF(p.relationship_goals_detailed, '{}'),
    'relationship_structure_preference', NULLIF(p.relationship_structure_preference, '{}'),
    'intimacy_preferences', NULLIF(p.intimacy_preferences, '{}'::jsonb),
    'partner_preferences', NULLIF(p.partner_preferences, '{}'::jsonb),
    'dating_preferences', NULLIF(p.dating_preferences, '{}'::jsonb)
  )),
  updated_at = now()
FROM public.profiles p
WHERE p.user_id = ip.id AND ip.opted_in_at IS NOT NULL;
