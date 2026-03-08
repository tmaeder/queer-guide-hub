-- ============================================================================
-- Add ai_enhance rule type and seed rules for ai-enhancer module.
-- Rules were missing from the initial seed, causing the module to do nothing.
-- ============================================================================

-- Add ai_enhance to the rule_type check constraint
ALTER TABLE public.automation_rules DROP CONSTRAINT automation_rules_rule_type_check;
ALTER TABLE public.automation_rules ADD CONSTRAINT automation_rules_rule_type_check
  CHECK (rule_type = ANY (ARRAY[
    'required', 'format', 'length', 'regex', 'url_valid',
    'geo_match', 'normalize', 'sanitize', 'ai_check', 'ai_enhance', 'custom'
  ]));

-- Seed AI Enhancer rules
WITH ae AS (SELECT id FROM public.automation_modules WHERE slug = 'ai-enhancer')
INSERT INTO public.automation_rules
  (module_id, name, description, content_type, field_name, rule_type, rule_config, severity, auto_fix, sort_order)
SELECT ae.id, r.*
FROM ae, (VALUES
  ('generate_venue_desc',       'Generate missing venue descriptions',       'venues',        'description', 'ai_enhance', '{"mode":"generate"}'::jsonb,                      'info', false, 1),
  ('expand_venue_desc',         'Expand thin venue descriptions',            'venues',        'description', 'ai_enhance', '{"mode":"expand","max_length":80}'::jsonb,        'info', false, 2),
  ('generate_event_desc',       'Generate missing event descriptions',       'events',        'description', 'ai_enhance', '{"mode":"generate"}'::jsonb,                      'info', false, 3),
  ('generate_personality_bio',  'Generate missing personality bios',         'personalities', 'bio',         'ai_enhance', '{"mode":"generate"}'::jsonb,                      'info', false, 4),
  ('generate_city_desc',        'Generate missing city descriptions',        'cities',        'description', 'ai_enhance', '{"mode":"generate"}'::jsonb,                      'info', false, 5)
) AS r(name, description, content_type, field_name, rule_type, rule_config, severity, auto_fix, sort_order);
