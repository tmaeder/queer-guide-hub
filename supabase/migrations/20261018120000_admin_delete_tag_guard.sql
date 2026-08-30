-- Deleting a glossary tag from /admin/tags was a raw `DELETE FROM unified_tags`
-- behind a `window.confirm`, and it destroys far more than the row.
--
-- MEASURED against prod 2026-08-29 — what a tag delete CASCADEs away today:
--   tag_sources          6,473 rows, 53 tags carrying published legal citations
--                        hand-researched one instrument at a time (there is no
--                        source to re-derive them from: P1031 is present on 0 of
--                        the 44 law tags).
--   tag_medical_codes    296 clinical codes across 95 tags.
--   tag_relations        773 curated ontology edges.
--   sti_profiles, substance_interactions, tag_myth_facts — curated health
--                        content, all ON DELETE CASCADE.
--   tag_embeddings, tag_follows, topic_cluster_tags, tag_category_assignments,
--   unified_tag_assignments (180,585 rows) — all CASCADE.
-- And two that do NOT cascade but rot instead:
--   tag_slug_redirects   ON DELETE SET NULL -> the redirect survives pointing at
--                        nothing, so an old URL resolves to a dangling row.
--   search_synonyms      ON DELETE SET NULL.
--
-- Separately, `tags text[]` is denormalised onto 20+ live content tables with NO
-- foreign key at all, so a delete leaves every venue/event/article still
-- claiming a tag whose page is now a 404. That is what `merge_tag_concept`
-- exists to repoint, and it is exactly what a bare DELETE skips.
--
-- So: delete stays available — it is the right action for a genuinely unused
-- junk row — but it goes through a function that REFUSES when the tag is in
-- use and names what is in the way, and snapshots what it does remove.

create or replace function public.admin_delete_tag(
  p_tag_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor        uuid := auth.uid();
  v_tag          public.unified_tags%rowtype;
  v_assignments  bigint := 0;
  v_denorm       bigint := 0;
  v_sources      bigint := 0;
  v_codes        bigint := 0;
  v_relations    bigint := 0;
  v_merged_in    bigint := 0;
  v_redirects    bigint := 0;
  v_tbl          record;
  v_n            bigint;
  v_blockers     text[] := '{}';
  v_snapshot     jsonb;
begin
  perform public.assert_admin_or_internal();

  select * into v_tag from public.unified_tags where id = p_tag_id;
  if not found then
    raise exception 'no tag with id %', p_tag_id using errcode = 'P0002';
  end if;

  -- 1) The junction — the authoritative usage record.
  select count(*) into v_assignments
  from public.unified_tag_assignments where tag_id = p_tag_id;

  -- 2) The denormalised arrays. Derived from information_schema rather than a
  --    hardcoded list, so a new content table is covered the day it appears;
  --    the exclusions are the non-content carriers (staging, revisions, dated
  --    backups, the workflow registry) where a name match is not a live claim.
  --    A delete is rare and interactive, so scanning is the right trade.
  for v_tbl in
    select c.table_name
    from information_schema.columns c
    join pg_tables t on t.schemaname = 'public' and t.tablename = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'tags'
      and c.data_type = 'ARRAY'
      and c.table_name not like '%backup%'
      and c.table_name not like 'scraper\_%'
      and c.table_name not in ('workflow_definitions', 'cms_content_revisions')
    order by c.table_name
  loop
    execute format('select count(*) from public.%I where %L = any(tags)', v_tbl.table_name, v_tag.name)
      into v_n;
    if v_n > 0 then
      v_denorm := v_denorm + v_n;
      v_blockers := v_blockers || format('%s: %s row(s) still list this tag by name', v_tbl.table_name, v_n);
    end if;
  end loop;

  -- 3) Curated satellites that CASCADE — losing these is the expensive part.
  select count(*) into v_sources   from public.tag_sources        where tag_id = p_tag_id;
  select count(*) into v_codes     from public.tag_medical_codes  where tag_id = p_tag_id;
  select count(*) into v_relations from public.tag_relations
    where source_tag_id = p_tag_id or target_tag_id = p_tag_id;

  -- 4) Rows that would rot rather than cascade.
  select count(*) into v_redirects from public.tag_slug_redirects where tag_id = p_tag_id;

  -- 5) Tags merged INTO this one. The FK is NO ACTION so the delete would error
  --    anyway — catching it here turns a raw 23503 into a sentence.
  select count(*) into v_merged_in from public.unified_tags where merged_into_id = p_tag_id;

  if v_assignments > 0 then
    v_blockers := v_blockers || format('unified_tag_assignments: %s assignment(s)', v_assignments);
  end if;
  if v_sources > 0 then
    v_blockers := v_blockers || format('tag_sources: %s citation(s) would be destroyed', v_sources);
  end if;
  if v_codes > 0 then
    v_blockers := v_blockers || format('tag_medical_codes: %s clinical code(s) would be destroyed', v_codes);
  end if;
  if v_relations > 0 then
    v_blockers := v_blockers || format('tag_relations: %s ontology edge(s) would be destroyed', v_relations);
  end if;
  if v_redirects > 0 then
    v_blockers := v_blockers || format('tag_slug_redirects: %s redirect(s) would be left pointing at nothing', v_redirects);
  end if;
  if v_merged_in > 0 then
    v_blockers := v_blockers || format('unified_tags: %s tag(s) were merged INTO this one', v_merged_in);
  end if;

  if array_length(v_blockers, 1) is not null then
    -- Deliberately no p_force escape hatch. Every blocker above has a correct
    -- alternative that preserves the data: merge_tag_concept repoints usage and
    -- writes a slug redirect, deprecate_unused_tags retires a tag while keeping
    -- its page resolvable. A force flag would only ever be used to skip past
    -- that reasoning at the moment it matters most.
    raise exception E'refusing to delete tag "%" — it is in use:\n  %\nUse merge_tag_concept() to fold it into another tag (repoints usage, writes a redirect), or set status=''deprecated'' to retire it.',
      v_tag.name, array_to_string(v_blockers, E'\n  ')
      using errcode = '23503';
  end if;

  -- Unused: snapshot everything that identifies it, then remove it. The
  -- snapshot is the only way back — there is no unmerge for a delete.
  v_snapshot := jsonb_build_object(
    'unified_tags', to_jsonb(v_tag),
    'aliases', coalesce((select jsonb_agg(to_jsonb(a)) from public.tag_aliases a where a.canonical_tag_id = p_tag_id), '[]'::jsonb),
    'category_assignments', coalesce((select jsonb_agg(to_jsonb(ca)) from public.tag_category_assignments ca where ca.tag_id = p_tag_id), '[]'::jsonb)
  );

  insert into public.admin_lifecycle_audit (entity_type, entity_id, action, actor, reason, row_snapshot, details)
  values (
    'tag', p_tag_id, 'delete', v_actor, p_reason, v_snapshot,
    jsonb_build_object('name', v_tag.name, 'slug', v_tag.slug, 'verified_unused', true)
  );

  delete from public.unified_tags where id = p_tag_id;

  return jsonb_build_object('deleted', true, 'id', p_tag_id, 'name', v_tag.name);
end; $function$;

revoke all on function public.admin_delete_tag(uuid, text) from public, anon;
grant execute on function public.admin_delete_tag(uuid, text) to authenticated, service_role;

comment on function public.admin_delete_tag(uuid, text) is
  'Hard-deletes a glossary tag, but only when it is provably unused. Refuses with a per-source breakdown otherwise and points at merge_tag_concept / deprecation, both of which preserve the data a delete would cascade away.';
