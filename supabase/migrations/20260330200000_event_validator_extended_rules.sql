-- ============================================================================
-- Extended Event Validator Rules
-- Fixes pride event type (rally→pride/protest), adds venue dedup rules.
-- ============================================================================

-- ── 1. Extend rule_type CHECK to include venue dedup types ──────────────────

ALTER TABLE public.automation_rules
  DROP CONSTRAINT automation_rules_rule_type_check;
ALTER TABLE public.automation_rules
  ADD CONSTRAINT automation_rules_rule_type_check
  CHECK (rule_type IN (
    'required','format','length','regex','url_valid','geo_match',
    'normalize','sanitize','ai_check','ai_enhance','custom',
    'geo_reverse_fill','geo_text_validate','geo_village_assign',
    'event_time_window','event_day_check','event_time_order','event_dedup',
    'venue_dup_address','venue_dup_name'
  ));

-- ── 2. Fix existing Pride Demo rules to use actual event_type "pride" ───────
-- The DB has event_type="pride" (35 events) and "protest" (2), not "rally" (0).

UPDATE public.automation_rules
SET
  rule_config = '{"event_types":["pride","protest"],"min_hour":10,"max_hour":15}'::jsonb,
  description = 'Pride/protest events must start between 10:00 and 15:00 local time'
WHERE name = 'pride_demo_time_window';

UPDATE public.automation_rules
SET
  rule_config = '{"event_types":["pride","protest"],"expected_day":6}'::jsonb,
  description = 'Pride/protest events should be on Saturday'
WHERE name = 'pride_demo_saturday';

-- Update module config to reflect correct types
UPDATE public.automation_modules
SET config = '{"pride_types":["pride","protest"],"party_types":["party"]}'::jsonb
WHERE slug = 'event-validator';

-- ── 3. Add venue dedup rules ────────────────────────────────────────────────

WITH ev AS (SELECT id FROM public.automation_modules WHERE slug = 'event-validator')
INSERT INTO public.automation_rules
  (module_id, name, description, content_type, field_name, rule_type,
   rule_config, severity, auto_fix, sort_order)
SELECT ev.id, r.*
FROM ev, (VALUES
  ('venue_duplicate_address',
   'Flag venues with identical normalized addresses in the same city',
   'venues', 'address', 'venue_dup_address',
   '{}'::jsonb,
   'warning', false, 6),

  ('venue_similar_name_same_street',
   'Flag venues with similar names on the same street (fuzzy match >= 75%)',
   'venues', 'name', 'venue_dup_name',
   '{"min_similarity":0.75}'::jsonb,
   'warning', false, 7)
) AS r(name, description, content_type, field_name, rule_type, rule_config, severity, auto_fix, sort_order);

-- ── 4. Add venues to the module's content_types ─────────────────────────────

UPDATE public.automation_modules
SET content_types = ARRAY['events', 'venues']
WHERE slug = 'event-validator';
