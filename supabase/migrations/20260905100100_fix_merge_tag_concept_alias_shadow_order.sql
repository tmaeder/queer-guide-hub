-- merge_tag_concept: retire the duplicate BEFORE writing its alias.
--
-- THE BUG
--
-- `tag_alias_reject_shadow()` (20260802123625) raises when an `alias_slug` is
-- also the slug of an ACTIVE tag other than the alias's own canonical:
--
--     select u.id from unified_tags u
--      where lower(u.slug) = lower(NEW.alias_slug)
--        and u.status = 'active' and u.id <> NEW.canonical_tag_id
--
-- `merge_tag_concept` ends every merge by recording the duplicate's slug as a
-- synonym of the canonical, so the merged-away URL keeps resolving. It did that
-- INSERT while the duplicate row was still `status='active'` — the status flip
-- came in the next statement. So the guard looked up the duplicate's own slug,
-- found the duplicate itself still live, saw an id that is not the canonical,
-- and rejected the merge:
--
--     tag alias crystal-meth would shadow the live tag with the same slug
--
-- The two migrations landed the same day (guard 20260802123625, the last
-- merge_tag_concept edit 20260802141407) and nothing exercised the combination,
-- because the paths that ran afterwards merge duplicates that are ALREADY
-- deprecated — `tag_plural_merge` feeds on the auto-deprecated tail, and
-- `deprecate_unused_tags` retires anything with zero usage overnight. A
-- deprecated duplicate does not satisfy `status='active'`, so the guard stayed
-- silent and the fault stayed invisible.
--
-- BLAST RADIUS, MEASURED BEFORE THE FIX
--
--   * 85 of the 89 rows in `tag_merge_review` with `status='pending'` have an
--     ACTIVE duplicate, so `approve_tag_merge` → `merge_tag_concept` raised for
--     every one of them. The admin merge queue has been unusable since
--     2026-08-02; `run_tag_auto_merge` swallows the error into
--     `status='rejected'`, so the pairs were being silently discarded rather
--     than merged.
--   * The 59 merges that DID succeed in that window were all
--     deprecated-duplicate pairs, which is why the counter looked healthy.
--
-- Active-vs-active is the NORMAL case for a real duplicate — two live tags both
-- accumulating assignments is exactly what the dedup engine exists to collapse.
--
-- THE FIX
--
-- Move the `unified_tags` status update above the `tag_aliases` insert. Nothing
-- else changes: `v_dup_slug` and `v_dup_name` are read into local variables near
-- the top, long before either statement, so the alias still records the
-- duplicate's original identity. Once the row reads `status='merged'` the guard's
-- `and u.status = 'active'` no longer matches it and the insert proceeds.
--
-- Ordering the other way — teaching the guard to ignore a row mid-merge — was
-- rejected: the guard cannot know a merge is in flight without a session flag,
-- and a fail-open guard on a table that governs URL resolution is worse than the
-- bug it would paper over.
--
-- `__alias_added` keeps its meaning for `unmerge_tag_concept`, and the audit
-- snapshot is still assembled before either write.

create or replace function public.merge_tag_concept(
  p_canonical_id uuid,
  p_duplicate_id uuid,
  p_actor text default 'system',
  p_source text default 'manual'
)
returns uuid
language plpgsql security definer set search_path = public
as $function$
declare
  v_canon_slug text; v_dup_slug text; v_dup_name text;
  v_tables text[] := array['venues','news_articles','personalities','events','festivals',
                           'hotels','milestones','organizations','queer_villages',
                           'community_groups','community_posts','cms_content','cms_pages'];
  v_tbl text; v_rows jsonb; v_snapshot jsonb := '{}'::jsonb; v_alias_added boolean := false;
  v_audit_id uuid; v_hops int := 0;
begin
  perform public.assert_admin_or_internal();
  perform set_config('app.actor', 'merge:'||coalesce(nullif(p_actor,''),'system'), true);

  -- Follow the canonical to its terminal. Merging into an already-merged tag is
  -- how A -> B -> C chains appear, and single-hop resolution 404s on them.
  while v_hops < 10 loop
    exit when not exists (
      select 1 from public.unified_tags
       where id = p_canonical_id and status = 'merged' and merged_into_id is not null);
    select merged_into_id into p_canonical_id from public.unified_tags where id = p_canonical_id;
    v_hops := v_hops + 1;
  end loop;

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

  -- RETIRE THE DUPLICATE FIRST. This statement used to sit below the alias
  -- insert; see the header — while the row still read 'active',
  -- tag_alias_reject_shadow() treated the duplicate as shadowing itself and
  -- aborted every active-vs-active merge.
  update public.unified_tags
     set status = 'merged', merged_into_id = p_canonical_id, deprecated_at = now(),
         deprecation_reason = format('merged into %s by %s (%s)', v_canon_slug, p_actor, p_source),
         updated_at = now()
   where id = p_duplicate_id;

  if not exists (select 1 from public.tag_aliases where alias_slug = v_dup_slug) then
    insert into public.tag_aliases (canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
    values (p_canonical_id, v_dup_name, v_dup_slug, 'synonym', 'approved');
    v_alias_added := true;
  end if;
  v_snapshot := v_snapshot || jsonb_build_object('__alias_added', v_alias_added);

  insert into public.tag_merge_audit
    (canonical_id, duplicate_id, canonical_slug, duplicate_slug, actor, source, snapshot, is_reversed)
  values (p_canonical_id, p_duplicate_id, v_canon_slug, v_dup_slug, p_actor, p_source, v_snapshot, false)
  returning id into v_audit_id;

  perform public.recount_unified_tag_usage_for(array[p_canonical_id, p_duplicate_id]);
  return v_audit_id;
end $function$;

-- Prove the fix on the exact shape that was failing: two ACTIVE tags, merged,
-- then rolled back. Without the reorder this block raises inside the merge.
do $verify$
declare v_a uuid; v_b uuid;
begin
  insert into public.unified_tags (name, slug, status, entity_kind)
  values ('Zz Merge Order Probe A', 'zz-merge-order-probe-a', 'active', 'concept') returning id into v_a;
  insert into public.unified_tags (name, slug, status, entity_kind)
  values ('Zz Merge Order Probe B', 'zz-merge-order-probe-b', 'active', 'concept') returning id into v_b;

  perform public.merge_tag_concept(v_a, v_b, 'admin:merge-order-verify', 'verify');

  if not exists (select 1 from public.unified_tags
                  where id = v_b and status = 'merged' and merged_into_id = v_a) then
    raise exception 'merge_tag_concept verify: duplicate was not retired';
  end if;
  if not exists (select 1 from public.tag_aliases
                  where alias_slug = 'zz-merge-order-probe-b' and canonical_tag_id = v_a) then
    raise exception 'merge_tag_concept verify: alias was not recorded';
  end if;

  delete from public.tag_merge_audit where duplicate_id = v_b;
  delete from public.tag_aliases where canonical_tag_id in (v_a, v_b);
  delete from public.tag_slug_redirects where tag_id in (v_a, v_b)
     or old_slug in ('zz-merge-order-probe-a','zz-merge-order-probe-b');
  delete from public.tag_suggestions where entity_id in (v_a, v_b) or tag_id in (v_a, v_b);
  delete from public.unified_tags where id in (v_a, v_b);

  raise notice 'merge_tag_concept: active-vs-active merge verified';
end
$verify$;
