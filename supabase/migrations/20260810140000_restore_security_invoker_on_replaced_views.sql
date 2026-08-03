-- SECURITY: restore `security_invoker` on two views that silently lost it, and add a
-- regression gate for the mechanism that stripped it.
--
-- ROOT CAUSE — this is NOT the #2450 default-privileges story, despite presenting the
-- same way in CI. `CREATE OR REPLACE VIEW` **resets reloptions to NULL**. Any later
-- maintenance edit to a view body therefore silently discards a prior
-- `ALTER VIEW ... SET (security_invoker = true)` security fix, turning the view back
-- into a SECURITY DEFINER view that bypasses base-table RLS. Verified directly on prod
-- inside a rolled-back transaction:
--
--   create view zz_probe as select 1 as a;
--   alter view zz_probe set (security_invoker = true);   -- reloptions {security_invoker=true}
--   create or replace view zz_probe as select 2 as a;    -- reloptions NULL   <-- stripped
--
-- The tempting misdiagnosis, explicitly measured and REJECTED: "the replace made it a
-- fresh relation, so ALTER DEFAULT PRIVILEGES re-armed the writes." It does not. REPLACE
-- keeps the same pg_class row and its ACL; only reloptions are reset. Proven on prod in a
-- rolled-back transaction:
--
--   create view zz as select 1 as a;      -- acl: anon=awdDxtm  (stock default privileges)
--   revoke all on zz from anon;           -- acl: anon absent
--   create or replace view zz as ...;     -- acl: anon STILL absent  <-- not re-armed
--
-- This distinction is not academic. Note the stock default ACL for anon is `awdDxtm`,
-- with NO `r` — so "anon has writes but not SELECT" looks identical under both stories
-- and cannot be used to tell them apart. The write set here dates from the view's
-- original 2026-06-07 CREATE and simply persisted; what 20260810130000 actually changed
-- was the invoker flag. Revoking the grants alone therefore turns the CI gate green while
-- leaving the view running as SECURITY DEFINER, i.e. it fixes the symptom and not the
-- defect.
--
-- Two views regressed, from two independent replaces:
--
--   news_quality_scorecard  invoker set by 20260610190942, stripped by 20260810130000
--                           (CREATE OR REPLACE to add the code_residue column).
--                           Write grants intact -> CI gate fired. Not exploitable today:
--                           the view is an aggregate, so is_updatable = NO. Latent, per
--                           the 20260806180000 precedent, which revokes on those too.
--
--   admin_media_unified     invoker set by 20260524410000, stripped by 20260724250000 and
--                           again by 20260725230000. Its write grants had already been
--                           revoked by 20260806180000, so the existing gate — which only
--                           looks at write grants — stayed SILENT on it. That blind spot
--                           is what the new registry gate below closes.
--
-- MEASURED, and deliberately not overstated: restoring invoker on admin_media_unified is
-- a hardening fix, not a data-leak fix. A plain non-admin `authenticated` role sees the
-- same 110,161 rows with invoker on as with it off, because cms_media and image_assets
-- are readable by authenticated anyway. The only definer/invoker delta is the per-asset
-- usage count sub-select over cms_media_attachments (admin-gated, count only — no row
-- contents). Both changes are behaviour-preserving: news_quality_scorecard returns byte
-- identical figures either way (total_live 37920 / no_geo 14931 / code_residue 54 /
-- avg_quality 80.9), checked as a non-admin authenticated user before and after.

alter view public.news_quality_scorecard set (security_invoker = on);
alter view public.admin_media_unified    set (security_invoker = on);

-- Defense in depth: invoker alone already satisfies the gate, but an aggregate view has
-- no business carrying a write set. REVOKE is idempotent — and a concurrent session
-- already revoked the news_quality_scorecard write set on prod out-of-band, so this is
-- expected to be a no-op there and is kept so the repo alone still describes the end
-- state.
revoke insert, update, delete, truncate on
  public.news_quality_scorecard,
  public.admin_media_unified
from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Regression gate for the reloptions reset.
--
-- The existing definer_view_api_write_grants() gate keys on write grants, so it can only
-- see a stripped view that also happens to still hold them. admin_media_unified proves
-- that misses the general case. A blanket "every view must be security_invoker" rule is
-- the wrong shape — several views are definer ON PURPOSE (tag_broader / tag_narrower /
-- tag_facets / v_silo_concept_crosswalk exist precisely to expose the tag ontology past
-- an admin-only base RLS, per 20260806180000). So the assertion is narrower and has no
-- false positives: a view that a migration once deliberately made invoker must STAY
-- invoker.
-- ---------------------------------------------------------------------------

create table if not exists public.security_invoker_required_views (
  view_name text primary key,
  reason text,
  registered_at timestamptz not null default now()
);

comment on table public.security_invoker_required_views is
  'Registry of public views that MUST keep security_invoker=on. CREATE OR REPLACE VIEW resets reloptions, so a view body edit silently reverts the setting; security_invoker_view_regressions() fails CI when that happens. Register a view here in the same migration that sets its invoker flag.';

-- This table is itself born with the stock ALTER DEFAULT PRIVILEGES write grants for
-- anon/authenticated (the very hole this file guards), so lock it down explicitly.
-- RLS on with zero policies is deny-all for non-bypass roles; service_role bypasses.
alter table public.security_invoker_required_views enable row level security;
revoke all on public.security_invoker_required_views from anon, authenticated;

insert into public.security_invoker_required_views (view_name, reason) values
  ('admin_media_unified',        'Media Library; base cms_media_attachments is admin-gated. 20260524410000'),
  ('cities_admin',               'Admin city console over RLS-gated cities. 20260610190942'),
  ('cluster_entity_counts',      'Dedup console. 20260524410000'),
  ('coverage_gaps',              'Admin coverage radar. 20260524410000'),
  ('dedup_precision',            'Dedup metrics. 20260524410000'),
  ('dlq_summary',                'Workflow dead-letter summary. 20260524410000'),
  ('entity_cluster_membership',  'Dedup console. 20260524410000'),
  ('hotel_ingest_stats',         'Hotel ingest health. 20260524410000'),
  ('news_corroborated_stories',  'News corroboration view. 20260524410000'),
  ('news_quality_scorecard',     'Admin news quality panel over news_articles. 20260610190942'),
  ('news_quality_source_health', 'Admin news source health. 20260610190942'),
  ('news_source_editor_feedback','News editor feedback. 20260524410000'),
  ('personality_data_health',    'Admin personality health. 20260610190942'),
  ('source_reliability_current', 'Search-intelligence source reliability. 20260524410000'),
  ('tag_assignments_norm',       'Tag assignment normalization. 20260524410000'),
  ('user_submission_reputation', 'Submission reputation. 20260524410000'),
  ('v_popular_entities',         'Popular-entity rollup. 20260524410000')
on conflict (view_name) do nothing;

create or replace function public.security_invoker_view_regressions()
returns table(view_name text, reason text)
language sql
stable
security definer
set search_path = public
as $$
  -- Only reports views that still EXIST and have lost the flag. A dropped view is not a
  -- regression; a renamed one surfaces as a stale registry row, which is worth seeing.
  select r.view_name, r.reason
  from public.security_invoker_required_views r
  join pg_class c on c.relname = r.view_name and c.relkind = 'v'
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where coalesce(
          (select option_value from pg_options_to_table(c.reloptions)
           where option_name = 'security_invoker'),
          'false') in ('false', 'off')
  order by 1
$$;

comment on function public.security_invoker_view_regressions() is
  'CI gate: registered views that have lost security_invoker (almost always a CREATE OR REPLACE VIEW that omitted the WITH clause). Must return zero rows.';

revoke execute on function public.security_invoker_view_regressions() from anon, authenticated;
grant execute on function public.security_invoker_view_regressions() to service_role;
