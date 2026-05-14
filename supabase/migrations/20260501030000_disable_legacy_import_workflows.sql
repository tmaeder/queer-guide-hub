-- Phase 2 caller migration. Both 410 stubs (background-import-manager,
-- ingestion-pipeline) had workflow_definitions rows still enabled. Callers
-- migrated to pipeline-executor; disable the legacy workflow rows so no
-- queued job picks them up.
-- Ref: docs/consolidation-2026-Q2-final.md
-- Already applied to prod via Supabase MCP on 2026-05-01.

UPDATE workflow_definitions
SET is_enabled = false,
    description = description || ' [DEPRECATED 2026-05-01: callers migrated to pipeline-executor; function deletion in follow-up PR]'
WHERE name IN ('background-import-manager', 'ingestion-pipeline')
  AND is_enabled = true;
