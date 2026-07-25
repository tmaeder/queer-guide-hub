-- Targeted usage recount for just the affected tags — mirrors recount_unified_tag_usage()'s
-- slug-source logic (venues+news_articles+personalities) but touches only p_ids, avoiding the
-- blanket all-tags UPDATE that storms the search-sync trigger and trips log_unified_tag_change.
create or replace function public.recount_unified_tag_usage_for(p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  with tag_usage as (
    select slug, count(*)::int n from (
      select unnest(tags) slug from venues where tags is not null
      union all select unnest(tags) from news_articles where tags is not null
      union all select unnest(tags) from personalities where tags is not null
    ) a where slug is not null and slug <> '' group by slug
  )
  update public.unified_tags t set usage_count = coalesce(tu.n,0), updated_at = now()
    from tag_usage tu where t.slug = tu.slug and t.id = any(p_ids);
  update public.unified_tags t set usage_count = 0, updated_at = now()
   where t.id = any(p_ids)
     and not exists (
       select 1 from (
         select unnest(tags) slug from venues where tags is not null
         union all select unnest(tags) from news_articles where tags is not null
         union all select unnest(tags) from personalities where tags is not null
       ) u where u.slug = t.slug);
end $$;

-- Redefine merge to (1) attribute writes to a non-system actor so it can touch human_reviewed
-- endpoints (logged), and (2) use the targeted recount. Body identical to 20260724200000 otherwise.
create or replace function public.merge_tag_concept(
  p_canonical_id uuid, p_duplicate_id uuid,
  p_actor text default 'system', p_source text default 'manual'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_canon_slug text; v_dup_slug text; v_dup_name text;
  v_tables text[] := array['venues','news_articles','personalities','events','festivals',
                           'hotels','milestones','organizations','queer_villages',
                           'community_groups','community_posts','cms_content','cms_pages'];
  v_tbl text; v_rows jsonb; v_snapshot jsonb := '{}'::jsonb; v_alias_added boolean := false;
  v_audit_id uuid;
begin
  perform public.assert_admin_or_internal();
  perform set_config('app.actor', 'merge:'||coalesce(nullif(p_actor,''),'system'), true);
  if p_canonical_id = p_duplicate_id then raise exception 'merge_tag_concept: same id'; end if;
  select slug into v_canon_slug from public.unified_tags where id = p_canonical_id;
  select slug, name into v_dup_slug, v_dup_name from public.unified_tags where id = p_duplicate_id;
  if v_canon_slug is null or v_dup_slug is null then raise exception 'merge_tag_concept: tag(s) not found'; end if;
  if exists (select 1 from public.tag_relationship_exclusions e
       where e.tag1_id = least(p_canonical_id,p_duplicate_id)
         and e.tag2_id = greatest(p_canonical_id,p_duplicate_id)) then
    raise exception 'merge_tag_concept: pair is a do-not-merge exclusion';
  end if;
  if exists (select 1 from public.unified_tags where id = p_duplicate_id and status = 'merged') then
    raise exception 'merge_tag_concept: duplicate already merged';
  end if;

  foreach v_tbl in array v_tables loop
    execute format(
      'select coalesce(jsonb_agg(jsonb_build_object(''id'', id, ''tags'', tags)), ''[]''::jsonb)
         from %I where %L = any(tags)', v_tbl, v_dup_slug) into v_rows;
    if v_rows <> '[]'::jsonb then
      v_snapshot := v_snapshot || jsonb_build_object(v_tbl, v_rows);
      execute format(
        'update %I set tags = (select array_agg(distinct t)
             from unnest(array_replace(tags, %L, %L)) t where t is not null)
         where %L = any(tags)', v_tbl, v_dup_slug, v_canon_slug, v_dup_slug);
    end if;
  end loop;

  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_rows
    from (select id, entity_id, entity_type from public.unified_tag_assignments where tag_id = p_duplicate_id) x;
  v_snapshot := v_snapshot || jsonb_build_object('__uta', v_rows);
  delete from public.unified_tag_assignments d
   where d.tag_id = p_duplicate_id
     and exists (select 1 from public.unified_tag_assignments c
        where c.tag_id = p_canonical_id and c.entity_id = d.entity_id and c.entity_type = d.entity_type);
  update public.unified_tag_assignments set tag_id = p_canonical_id where tag_id = p_duplicate_id;

  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_rows
    from (select id, category_id from public.tag_category_assignments where tag_id = p_duplicate_id) x;
  v_snapshot := v_snapshot || jsonb_build_object('__cat', v_rows);
  delete from public.tag_category_assignments d
   where d.tag_id = p_duplicate_id
     and exists (select 1 from public.tag_category_assignments c
        where c.tag_id = p_canonical_id and c.category_id = d.category_id);
  update public.tag_category_assignments set tag_id = p_canonical_id where tag_id = p_duplicate_id;

  if not exists (select 1 from public.tag_aliases where alias_slug = v_dup_slug) then
    insert into public.tag_aliases (canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
    values (p_canonical_id, v_dup_name, v_dup_slug, 'synonym', 'approved');
    v_alias_added := true;
  end if;
  v_snapshot := v_snapshot || jsonb_build_object('__alias_added', v_alias_added);

  update public.unified_tags
     set status = 'merged', merged_into_id = p_canonical_id, deprecated_at = now(),
         deprecation_reason = format('merged into %s by %s (%s)', v_canon_slug, p_actor, p_source),
         updated_at = now()
   where id = p_duplicate_id;

  insert into public.tag_merge_audit
    (canonical_id, duplicate_id, canonical_slug, duplicate_slug, actor, source, snapshot, is_reversed)
  values (p_canonical_id, p_duplicate_id, v_canon_slug, v_dup_slug, p_actor, p_source, v_snapshot, false)
  returning id into v_audit_id;

  perform public.recount_unified_tag_usage_for(array[p_canonical_id, p_duplicate_id]);
  return v_audit_id;
end $$;

create or replace function public.unmerge_tag_concept(p_audit_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_a public.tag_merge_audit; v_tbl text; v_snap jsonb;
begin
  perform public.assert_admin_or_internal();
  select * into v_a from public.tag_merge_audit where id = p_audit_id;
  if not found then raise exception 'unmerge_tag_concept: audit not found'; end if;
  if v_a.is_reversed then return false; end if;
  perform set_config('app.actor', 'unmerge:'||coalesce(nullif(v_a.actor,''),'system'), true);
  v_snap := v_a.snapshot;

  foreach v_tbl in array array['venues','news_articles','personalities','events','festivals',
                               'hotels','milestones','organizations','queer_villages',
                               'community_groups','community_posts','cms_content','cms_pages'] loop
    if v_snap ? v_tbl then
      execute format(
        'update %I t set tags = s.tags
           from jsonb_to_recordset(%L::jsonb) as s(id uuid, tags text[])
          where t.id = s.id', v_tbl, v_snap->v_tbl);
    end if;
  end loop;

  update public.unified_tag_assignments u set tag_id = v_a.duplicate_id
    from jsonb_to_recordset(coalesce(v_snap->'__uta','[]'::jsonb)) as s(id uuid, entity_id uuid, entity_type text)
   where u.id = s.id;
  insert into public.unified_tag_assignments (id, tag_id, entity_id, entity_type)
  select s.id, v_a.duplicate_id, s.entity_id, s.entity_type
    from jsonb_to_recordset(coalesce(v_snap->'__uta','[]'::jsonb)) as s(id uuid, entity_id uuid, entity_type text)
   where not exists (select 1 from public.unified_tag_assignments u where u.id = s.id)
  on conflict do nothing;

  update public.tag_category_assignments c set tag_id = v_a.duplicate_id
    from jsonb_to_recordset(coalesce(v_snap->'__cat','[]'::jsonb)) as s(id uuid, category_id uuid)
   where c.id = s.id;
  insert into public.tag_category_assignments (id, tag_id, category_id)
  select s.id, v_a.duplicate_id, s.category_id
    from jsonb_to_recordset(coalesce(v_snap->'__cat','[]'::jsonb)) as s(id uuid, category_id uuid)
   where not exists (select 1 from public.tag_category_assignments c where c.id = s.id)
  on conflict do nothing;

  if coalesce((v_snap->>'__alias_added')::boolean, false) then
    delete from public.tag_aliases
     where alias_slug = v_a.duplicate_slug and canonical_tag_id = v_a.canonical_id and alias_type = 'synonym';
  end if;

  update public.unified_tags
     set status = 'active', merged_into_id = null, deprecated_at = null,
         deprecation_reason = null, updated_at = now()
   where id = v_a.duplicate_id;

  update public.tag_merge_audit set is_reversed = true, reversed_at = now() where id = p_audit_id;
  perform public.recount_unified_tag_usage_for(array[v_a.canonical_id, v_a.duplicate_id]);
  return true;
end $$;

revoke all on function public.recount_unified_tag_usage_for(uuid[]) from public;
grant execute on function public.recount_unified_tag_usage_for(uuid[]) to service_role;
