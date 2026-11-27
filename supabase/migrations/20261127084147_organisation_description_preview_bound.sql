-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261127084147 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
-- Limit jobs before source lookups; otherwise the planner evaluates 42k
-- source snapshots before sorting, exceeding the Data API statement timeout.
create or replace function public.preview_organisation_description_jobs(p_stage text default 'pending',p_limit integer default 100)
returns table(entity_table text,id uuid,source_field text,lease uuid,name text,description text,content_language text,expected jsonb)
language sql stable security invoker set search_path='' as $$
  with picked as materialized (
    select j.* from api_private.organisation_description_jobs j where j.state=p_stage
    order by j.priority desc,j.available_at,j.entity_table,j.entity_id,j.source_field
    limit greatest(1,least(p_limit,100))
  ), sources as materialized (
    select j.*,api_private.organisation_description_source(j.entity_table,j.entity_id,j.source_field) s from picked j
  ) select j.entity_table,j.entity_id,j.source_field,j.lease,j.s->>'name',j.s->>'description',j.s->>'content_language',j.s
    from sources j where j.s is not null;
$$;
;
