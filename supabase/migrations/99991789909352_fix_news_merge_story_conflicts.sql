-- Make News duplicate merges safe when both articles already belong to different
-- stories. news_story_articles permits one story per article, so moving the drop
-- row onto an already-associated keep article raises 23505. Preserve the drop
-- membership in the merge audit, delete it for the merge, and restore it on undo.
-- Retries of a partially completed cluster are idempotent when the drop already
-- points at the requested survivor.

CREATE OR REPLACE FUNCTION public._news_merge_core(p_keep_id uuid, p_drop_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_drop_slug text; v_keep_dup uuid; v_drop_dup uuid; v_counts jsonb := '{}'::jsonb; v_audit_id uuid; n int;
        v_moved jsonb := '{}'::jsonb; v_removed jsonb := '{}'::jsonb; v_ids jsonb;
        v_prior_redirect uuid; v_had_redirect boolean := false;
begin
  if p_keep_id = p_drop_id then raise exception 'keep and drop must differ'; end if;
  select duplicate_of_id into v_keep_dup from public.news_articles where id = p_keep_id;
  if not found then raise exception 'keep article % not found', p_keep_id; end if;
  if v_keep_dup is not null then raise exception 'keep article is itself a duplicate'; end if;
  select duplicate_of_id, slug into v_drop_dup, v_drop_slug from public.news_articles where id = p_drop_id;
  if not found then raise exception 'drop article % not found', p_drop_id; end if;
  if v_drop_dup is not null then
    if v_drop_dup = p_keep_id then
      return jsonb_build_object('audit_id', null, 'entity_type', 'news', 'keep_id', p_keep_id,
        'drop_id', p_drop_id, 'reparented', '{}'::jsonb, 'already_merged', true);
    end if;
    raise exception 'drop article already merged into %', v_drop_dup;
  end if;

  with moved as (
    update public.news_article_cities c set article_id = p_keep_id where c.article_id = p_drop_id
      and not exists (select 1 from public.news_article_cities k where k.article_id = p_keep_id and k.city_id = c.city_id)
    returning c.id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('news_article_cities', n);
  v_moved  := v_moved  || jsonb_build_object('news_article_cities', v_ids);

  with moved as (
    update public.news_article_countries c set article_id = p_keep_id where c.article_id = p_drop_id
      and not exists (select 1 from public.news_article_countries k where k.article_id = p_keep_id and k.country_id = c.country_id)
    returning c.id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('news_article_countries', n);
  v_moved  := v_moved  || jsonb_build_object('news_article_countries', v_ids);

  with moved as (
    update public.news_article_entities e set article_id = p_keep_id where e.article_id = p_drop_id
      and not exists (select 1 from public.news_article_entities k where k.article_id = p_keep_id and k.entity_type = e.entity_type and k.entity_id = e.entity_id)
    returning e.id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('news_article_entities', n);
  v_moved  := v_moved  || jsonb_build_object('news_article_entities', v_ids);

  if exists (select 1 from public.news_story_articles where article_id = p_keep_id) then
    with removed as (
      delete from public.news_story_articles where article_id = p_drop_id
      returning story_id, similarity, added_at)
    select count(*)::int,
      coalesce(jsonb_agg(jsonb_build_object('story_id', story_id, 'similarity', similarity,
        'added_at', added_at)), '[]'::jsonb)
      into n, v_ids from removed;
    v_counts  := v_counts  || jsonb_build_object('news_story_articles_removed', n);
    v_moved   := v_moved   || jsonb_build_object('news_story_articles', '[]'::jsonb);
    v_removed := v_removed || jsonb_build_object('news_story_articles', v_ids);
  else
    with moved as (
      update public.news_story_articles s set article_id = p_keep_id where s.article_id = p_drop_id
      returning s.story_id)
    select count(*)::int, coalesce(jsonb_agg(story_id), '[]'::jsonb) into n, v_ids from moved;
    v_counts := v_counts || jsonb_build_object('news_story_articles', n);
    v_moved  := v_moved  || jsonb_build_object('news_story_articles', v_ids);
    v_removed := v_removed || jsonb_build_object('news_story_articles', '[]'::jsonb);
  end if;

  with moved as (
    update public.user_news_reads u set article_id = p_keep_id where u.article_id = p_drop_id
      and not exists (select 1 from public.user_news_reads k where k.user_id = u.user_id and k.article_id = p_keep_id)
    returning u.user_id)
  select count(*)::int, coalesce(jsonb_agg(user_id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('user_news_reads', n);
  v_moved  := v_moved  || jsonb_build_object('user_news_reads', v_ids);

  with moved as (
    update public.news_stories set hero_article_id = p_keep_id where hero_article_id = p_drop_id returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('news_stories_hero', n);
  v_moved  := v_moved  || jsonb_build_object('news_stories_hero', v_ids);

  with moved as (
    update public.guides set recap_article_id = p_keep_id where recap_article_id = p_drop_id returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('guides_recap', n);
  v_moved  := v_moved  || jsonb_build_object('guides_recap', v_ids);

  if v_drop_slug is not null then
    select article_id into v_prior_redirect from public.news_slug_redirects where old_slug = v_drop_slug;
    v_had_redirect := found;
    insert into public.news_slug_redirects (old_slug, article_id) values (v_drop_slug, p_keep_id)
      on conflict (old_slug) do update set article_id = excluded.article_id;
  end if;

  update public.news_articles set duplicate_of_id = p_keep_id, updated_at = now() where id = p_drop_id;

  insert into public.entity_merge_audit (entity_type, keep_id, drop_id, actor, reparented, details)
    values ('news', p_keep_id, p_drop_id, p_actor, v_counts,
            jsonb_build_object('schema', 1, 'moved', v_moved, 'removed', v_removed,
              'drop_slug', v_drop_slug, 'slug_redirect_existed', v_had_redirect,
              'slug_redirect_prior_article_id', v_prior_redirect))
    returning id into v_audit_id;
  return jsonb_build_object('audit_id', v_audit_id, 'entity_type','news','keep_id', p_keep_id,
    'drop_id', p_drop_id, 'reparented', v_counts);
end; $function$;

-- Keep the established all-entity unmerge implementation intact and make the two
-- narrowly scoped source edits needed for schema-2 News audits.
do $patch_unmerge$
declare
  v_src text; v_new text;
  v_decl_old constant text := 'v_moved jsonb; v_restored boolean';
  v_decl_new constant text := 'v_moved jsonb; v_removed jsonb; v_restored boolean';
  v_load_old constant text := 'v_moved := r.details->''moved'';';
  v_load_new constant text := 'v_moved := r.details->''moved'';' || chr(10) ||
    '  v_removed := coalesce(r.details->''removed'', ''{}''::jsonb);';
  v_story_old constant text := $old$
      update public.user_news_reads set article_id = r.drop_id
$old$;
  v_story_new constant text := $new$
      insert into public.news_story_articles (story_id, article_id, similarity, added_at)
      select x.story_id, r.drop_id, x.similarity, x.added_at
      from jsonb_to_recordset(coalesce(v_removed->'news_story_articles', '[]'::jsonb))
        as x(story_id uuid, similarity real, added_at timestamptz);
      get diagnostics n = row_count;
      v_counts := v_counts || jsonb_build_object('news_story_articles_removed', n);

      update public.user_news_reads set article_id = r.drop_id
$new$;
begin
  select regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g') into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'unmerge_entities'
    and pg_get_function_identity_arguments(p.oid) = 'p_audit_id uuid, p_force boolean';
  if v_src is null then raise exception 'unmerge_entities(uuid, boolean) not installed'; end if;
  if position(v_decl_old in v_src) = 0 or position(v_load_old in v_src) = 0 or position(v_story_old in v_src) = 0 then
    raise exception 'unmerge_entities source no longer matches the expected reversible-merge definition';
  end if;
  v_new := replace(replace(replace(v_src, v_decl_old, v_decl_new), v_load_old, v_load_new),
    v_story_old, v_story_new);
  execute v_new;
end $patch_unmerge$;

do $verify$
declare v_core text; v_unmerge text;
begin
  select regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g') into v_core
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = '_news_merge_core';
  select regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g') into v_unmerge
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'unmerge_entities'
    and pg_get_function_identity_arguments(p.oid) = 'p_audit_id uuid, p_force boolean';

  if position('v_drop_dup = p_keep_id' in v_core) = 0 then
    raise exception '_news_merge_core is not idempotent for same-survivor retries';
  end if;
  if position('news_story_articles_removed' in v_core) = 0
     or position('''removed'', v_removed' in v_core) = 0 then
    raise exception '_news_merge_core does not audit removed story memberships';
  end if;
  if position('jsonb_to_recordset' in v_unmerge) = 0
     or position('v_removed->''news_story_articles''' in v_unmerge) = 0 then
    raise exception 'unmerge_entities does not restore removed story memberships';
  end if;
end $verify$;
