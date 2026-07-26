-- [Drift recovery 2026-07-26] Applied live via MCP by a concurrent session;
-- recovered verbatim from supabase_migrations.schema_migrations.statements.

-- Business Spine Unification — org link suggestions join the triage registry.
-- get_admin_counts auto-derives review_org_links from this row; the unified
-- inbox shows the queue; decisions deep-link to /admin/business?tab=review.

CREATE OR REPLACE VIEW public.triage_src_org_link_review AS
SELECT
  s.id,
  'org-link-review'::text AS queue_type,
  s.entity_type AS content_type,
  coalesce(s.payload->'entity'->>'name','?') || ' → ' ||
    coalesce(s.payload->'org'->>'name','new business') AS title,
  s.reason AS subtitle,
  s.status,
  s.confidence AS confidence_score,
  s.created_at,
  s.source,
  s.entity_id,
  s.entity_type AS entity_table,
  false AS has_diff,
  NULL::uuid AS reporter_id,
  s.payload AS meta,
  NULL::text AS flag_type,
  '{}'::jsonb AS risk_flags
FROM public.org_link_suggestions s
WHERE s.status = 'open';

INSERT INTO public.triage_sources
  (queue_key, view_name, label, priority_weight, sla_hours, count_key, capabilities)
VALUES
  ('org-link-review', 'triage_src_org_link_review', 'Business link review', 40, 168, 'org_links',
   '{"can_reopen": false, "external_console": "/admin/business?tab=review"}')
ON CONFLICT (queue_key) DO UPDATE SET
  view_name = EXCLUDED.view_name,
  label = EXCLUDED.label,
  priority_weight = EXCLUDED.priority_weight,
  sla_hours = EXCLUDED.sla_hours,
  count_key = EXCLUDED.count_key,
  capabilities = EXCLUDED.capabilities;
