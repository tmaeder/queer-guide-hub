-- A news survivor can later be merged into a better canonical article. The
-- merge core historically moved its relational children but left articles
-- whose duplicate_of_id pointed at the dropped survivor, creating a chain.
-- Repoint those children atomically, record their ids in the merge audit, and
-- restore them when that merge is undone.

do $patch_news_merge$
declare
  v_src text;
  v_new text;
  v_anchor constant text :=
    '  update public.news_articles set duplicate_of_id = p_keep_id, updated_at = now() where id = p_drop_id;';
  v_replacement constant text := $sql$
  with moved as (
    update public.news_articles
       set duplicate_of_id = p_keep_id, updated_at = now()
     where duplicate_of_id = p_drop_id and id <> p_keep_id
     returning id
  )
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb)
    into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('news_dup_children', n);
  v_moved  := v_moved  || jsonb_build_object('news_dup_children', v_ids);

  update public.news_articles set duplicate_of_id = p_keep_id, updated_at = now() where id = p_drop_id;
$sql$;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = '_news_merge_core'
    and pg_get_function_identity_arguments(p.oid) =
      'p_keep_id uuid, p_drop_id uuid, p_actor uuid';

  if v_src is null then
    raise exception '_news_merge_core(uuid, uuid, uuid) is not installed';
  end if;
  if position('news_dup_children' in v_src) = 0 then
    if position(v_anchor in v_src) = 0 then
      raise exception '_news_merge_core source no longer matches the expected definition';
    end if;
    v_new := replace(v_src, v_anchor, v_replacement);
    execute v_new;
  end if;
end $patch_news_merge$;

do $patch_news_unmerge$
declare
  v_src text;
  v_new text;
  v_anchor constant text := $sql$
      update public.guides set recap_article_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'guides_recap','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('guides_recap', n);

      if coalesce(r.details->>'drop_slug','') <> '' then
$sql$;
  v_replacement constant text := $sql$
      update public.guides set recap_article_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'guides_recap','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('guides_recap', n);

      update public.news_articles set duplicate_of_id = r.drop_id, updated_at = now()
        where duplicate_of_id = r.keep_id
          and id in (select v::uuid from jsonb_array_elements_text(
            coalesce(v_moved->'news_dup_children', '[]'::jsonb)) v);
      get diagnostics n = row_count;
      v_counts := v_counts || jsonb_build_object('news_dup_children', n);

      if coalesce(r.details->>'drop_slug','') <> '' then
$sql$;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'unmerge_entities'
    and pg_get_function_identity_arguments(p.oid) =
      'p_audit_id uuid, p_force boolean';

  if v_src is null then
    raise exception 'unmerge_entities(uuid, boolean) is not installed';
  end if;
  if position('v_moved->''news_dup_children''' in v_src) = 0 then
    if position(v_anchor in v_src) = 0 then
      raise exception 'unmerge_entities source no longer matches the expected news branch';
    end if;
    v_new := replace(v_src, v_anchor, v_replacement);
    execute v_new;
  end if;
end $patch_news_unmerge$;

-- Repair rows produced between the prior one-time cleanup and this invariant.
select public.collapse_entity_dup_chains('news');

do $verify$
declare
  v_merge text;
  v_unmerge text;
  v_remaining bigint;
begin
  select pg_get_functiondef(p.oid) into v_merge
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = '_news_merge_core'
    and pg_get_function_identity_arguments(p.oid) =
      'p_keep_id uuid, p_drop_id uuid, p_actor uuid';
  select pg_get_functiondef(p.oid) into v_unmerge
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'unmerge_entities'
    and pg_get_function_identity_arguments(p.oid) =
      'p_audit_id uuid, p_force boolean';

  if position('news_dup_children' in v_merge) = 0
     or position('v_moved->''news_dup_children''' in v_unmerge) = 0 then
    raise exception 'news duplicate-child merge/unmerge invariant was not installed';
  end if;

  select count(*) into v_remaining
  from public.news_articles n
  left join public.news_articles parent on parent.id = n.duplicate_of_id
  where n.duplicate_of_id is not null
    and (parent.id is null or parent.duplicate_of_id is not null);
  if v_remaining <> 0 then
    raise exception 'news duplicate integrity repair left % invalid pointer(s)', v_remaining;
  end if;
end $verify$;
