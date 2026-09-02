-- RECOVERED, 2026-09-02: this is the SQL that actually ran at version
-- 20260420180000, restored verbatim from schema_migrations.statements.
--
-- The file that stood here was `pipeline_p4_reenable_automation_and_city`, and
-- it NEVER RAN. Two migrations claimed this version; `scraper_migrations_deny_policy`
-- won and was recorded, so `db push` treated the version as done and skipped the
-- other one — the collision documented in CLAUDE.md. The version reads as applied,
-- which is why this went unnoticed for four months: only comparing the recorded
-- `name` against the file reveals it (scripts/check-migration-drift.mjs).
--
-- P4 is deleted rather than re-versioned, and that is a deliberate call, not
-- tidying. Its job was to re-schedule eight `wf-automation-*` crons that P1
-- (20260420160000, which DID apply) had unscheduled. Applying it today would be
-- actively harmful: `workflow_definitions` holds ZERO matching rows — the P0-P5
-- consolidation deleted those workflows — so it would recreate crons pointing at
-- workflows that do not exist, which is exactly the `wf-enrich-wolfram-countries`
-- shape CLAUDE.md records as a job that "never once succeeded".
--
-- So the eight crons stay unscheduled, which is the state prod has run in since
-- 2026-04-20 and the state the current pipeline expects. The deleted content
-- remains in git history if it is ever wanted.
--
-- Nothing here re-executes: the version is already in schema_migrations, so
-- `db push` skips it. This file exists so the repo and remote history agree.

-- scraper_migrations is internal-only; accessed exclusively by the
-- scraper service role which bypasses RLS. Explicit deny-all makes
-- the intent clear and silences the rls_enabled_no_policy advisory.
CREATE POLICY "deny_all" ON public.scraper_migrations
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
