-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 99991790011910 with no repo file — the signature of
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
-- Complete controlled-tag migration per assignment. The v2 bootstrap excluded
-- an entire venue once any assignment existed, which could leave multi-tag
-- venues partially migrated when a batch boundary split their legacy array.
create or replace function public.backfill_venue_tag_assignments(p_batch integer default 1000)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $tags$
declare
  v_inserted integer;
  v_remaining integer;
begin
  with candidates as (
    select v.id, t.id as tag_id
    from public.venues v
    cross join lateral unnest(coalesce(v.tags, '{}')) tag_slug
    join public.unified_tags t on t.slug = tag_slug and t.status = 'active'
    where not exists (
      select 1 from public.venue_tag_assignments a
      where a.venue_id = v.id and a.tag_id = t.id
    )
    order by v.id, t.id
    limit greatest(1, least(coalesce(p_batch, 1000), 5000))
  )
  insert into public.venue_tag_assignments (venue_id, tag_id)
  select id, tag_id from candidates
  on conflict (venue_id, tag_id) do nothing;
  get diagnostics v_inserted = row_count;

  select count(*)::integer into v_remaining
  from public.venues v
  cross join lateral unnest(coalesce(v.tags, '{}')) tag_slug
  join public.unified_tags t on t.slug = tag_slug and t.status = 'active'
  where not exists (
    select 1 from public.venue_tag_assignments a
    where a.venue_id = v.id and a.tag_id = t.id
  );

  return jsonb_build_object(
    'inserted', v_inserted,
    'remaining', v_remaining,
    'converged', v_remaining = 0
  );
end;
$tags$;

revoke all on function public.backfill_venue_tag_assignments(integer) from public, anon, authenticated;

grant execute on function public.backfill_venue_tag_assignments(integer) to service_role;
