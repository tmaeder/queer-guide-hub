-- ============================================================================
-- Event Validator Module — extends automation pipeline with event-specific rules
-- ============================================================================

-- ── 1. Extend CHECK constraints ──────────────────────────────────────────────

ALTER TABLE public.automation_modules
  DROP CONSTRAINT automation_modules_module_type_check;
ALTER TABLE public.automation_modules
  ADD CONSTRAINT automation_modules_module_type_check
  CHECK (module_type IN (
    'content_validation','link_sanitization','data_normalization',
    'geo_enrichment','auto_tagging','ai_enhancement','event_validation'
  ));

ALTER TABLE public.automation_rules
  DROP CONSTRAINT automation_rules_rule_type_check;
ALTER TABLE public.automation_rules
  ADD CONSTRAINT automation_rules_rule_type_check
  CHECK (rule_type IN (
    'required','format','length','regex','url_valid','geo_match',
    'normalize','sanitize','ai_check','custom',
    'event_time_window','event_day_check','event_time_order','event_dedup'
  ));

-- ── 2. Workflow definition ───────────────────────────────────────────────────

INSERT INTO public.workflow_definitions
  (name, display_name, description, edge_function, queue_name, default_payload,
   schedule, max_retries, retry_backoff_base, max_concurrency, timeout_seconds,
   is_enabled, priority, tags)
VALUES
  ('automation-event-validator', 'Automation: Event Validator',
   'Validates event time windows, date ordering, and deduplication by time+place',
   'content-automation', 'content_processing',
   '{"module":"event-validator","automated":true}'::jsonb,
   '0 4 * * *', 2, 60, 1, 300, true, 5,
   ARRAY['automation','events','validation']);

-- ── 3. Module registration ───────────────────────────────────────────────────

INSERT INTO public.automation_modules
  (slug, display_name, description, module_type, content_types,
   auto_approve_threshold, batch_size, rate_limit_per_hour, config)
VALUES
  ('event-validator', 'Event Validator',
   'Validates event time windows, day-of-week, date ordering, and dedup by time+place',
   'event_validation',
   ARRAY['events'],
   0.95, 200, 10,
   '{"pride_types":["rally"],"party_types":["party"]}'::jsonb);

-- Link module to workflow definition
UPDATE public.automation_modules m
SET workflow_definition_id = d.id
FROM public.workflow_definitions d
WHERE d.name = 'automation-event-validator' AND m.slug = 'event-validator';

-- ── 4. Validation rules ──────────────────────────────────────────────────────

WITH ev AS (SELECT id FROM public.automation_modules WHERE slug = 'event-validator')
INSERT INTO public.automation_rules
  (module_id, name, description, content_type, field_name, rule_type,
   rule_config, severity, auto_fix, sort_order)
SELECT ev.id, r.*
FROM ev, (VALUES
  ('pride_demo_time_window',
   'Rally events must start between 10:00 and 15:00 local time',
   'events', 'start_date', 'event_time_window',
   '{"event_types":["rally"],"min_hour":10,"max_hour":15}'::jsonb,
   'warning', false, 1),

  ('pride_demo_saturday',
   'Rally events should be on Saturday',
   'events', 'start_date', 'event_day_check',
   '{"event_types":["rally"],"expected_day":6}'::jsonb,
   'warning', false, 2),

  ('time_order_autofix',
   'Auto-swap end_date when it is before start_date',
   'events', 'end_date', 'event_time_order',
   '{}'::jsonb,
   'error', true, 3),

  ('party_start_time_window',
   'Party events must start between 18:00 and 23:00 local time',
   'events', 'start_date', 'event_time_window',
   '{"event_types":["party"],"min_hour":18,"max_hour":23}'::jsonb,
   'warning', false, 4),

  ('duplicate_same_time_place',
   'Detect duplicates: same local start time (+-10min) and same location',
   'events', 'start_date', 'event_dedup',
   '{"time_tolerance_min":10,"distance_threshold_m":50}'::jsonb,
   'warning', false, 5)
) AS r(name, description, content_type, field_name, rule_type, rule_config, severity, auto_fix, sort_order);
