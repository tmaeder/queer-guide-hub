-- ============================================================================
-- Ingestion unification P2.3 — fold automated_review_rules into automation_rules
-- ----------------------------------------------------------------------------
-- `automated_review_rules` held 2 rows and has NO code readers (verified:
-- only the generated types file references it). `automation_rules` is the
-- live, module-scoped rule registry. Copy the rows under a dedicated
-- 'review-automation' module with rule_type='custom' (the legacy rule_type +
-- config are preserved verbatim in rule_config — no `kind` discriminator
-- needed, provenance lives in rule_config.migrated_from), then drop the
-- legacy table.
-- ============================================================================

-- ── 1. Ensure a module to hang the migrated rules on ────────────────────────
INSERT INTO public.automation_modules
  (slug, display_name, description, module_type, content_types, is_enabled)
SELECT
  'review-automation',
  'Review automation (legacy)',
  'Container for rules migrated from the retired automated_review_rules table (2026-08 ingestion unification).',
  'content_validation',
  '{}'::text[],
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.automation_modules WHERE slug = 'review-automation'
);

-- ── 2. Copy the rows (idempotent by module + name) ──────────────────────────
INSERT INTO public.automation_rules
  (module_id, name, description, content_type, field_name, rule_type,
   rule_config, severity, is_enabled, created_at)
SELECT
  m.id,
  r.rule_name,
  'Migrated from automated_review_rules',
  'all',
  '*',
  'custom',
  coalesce(r.config, '{}'::jsonb) || jsonb_build_object(
    'migrated_from', 'automated_review_rules',
    'legacy_rule_type', r.rule_type,
    'legacy_last_run_at', r.last_run_at
  ),
  'warning',
  r.enabled,
  r.created_at
FROM public.automated_review_rules r
CROSS JOIN (SELECT id FROM public.automation_modules WHERE slug = 'review-automation') m
WHERE NOT EXISTS (
  SELECT 1 FROM public.automation_rules ar
  WHERE ar.module_id = m.id AND ar.name = r.rule_name
);

-- ── 3. Drop the legacy table ────────────────────────────────────────────────
DROP TABLE public.automated_review_rules;
