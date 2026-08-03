-- Merging INTO an already-merged tag builds a chain, and resolution only hops once.
--
-- merge_tag_concept() refuses to merge a tag that is already merged (the
-- DUPLICATE side) but never checked the CANONICAL side. So merge(B -> C) after
-- merge(A -> B) leaves A -> B -> C. resolve_tag_slug() does a single hop and
-- joins the target with status='active', so /tags/A finds B, B is not active,
-- and the visitor gets a 404 -- even though a good canonical exists one hop on.
--
-- Live effect, both real 404s:
--     /tags/nightclubs    -> night-clubs   (merged) -> night-club    (active)
--     /tags/femboyfemboi  -> femboy/femboi (merged) -> femboy-femboi (active)
--
-- Scope check before fixing: of 127 merged tags with a target, only 4 needed
-- more than one hop and only these 2 reach an active tag. The other 19 rows
-- that "look broken" terminate at a DEPRECATED tag, which is correct -- that
-- concept was retired, not re-homed, and 404 is the right answer. Deliberately
-- left alone rather than resurrected.
--
-- 'nightclubs' is the pair the plural predicate identifies as a genuine variant
-- (night-club/nightclubs); the plural runner skipped it only because it was
-- already mid-chain and therefore not active. Flattening finishes that job.

-- 1. Point every merged tag directly at the terminal canonical it resolves to.
--    Cycle-safe (tracks visited ids) and depth-capped.
with recursive chain as (
  select d.id sid, d.merged_into_id nid, 1 dep, array[d.id] seen
    from public.unified_tags d
   where d.status = 'merged' and d.merged_into_id is not null
  union all
  select c.sid, t.merged_into_id, c.dep + 1, c.seen || t.id
    from chain c
    join public.unified_tags t on t.id = c.nid
   where t.status <> 'active' and t.merged_into_id is not null
     and not t.id = any(c.seen) and c.dep < 10
),
terminal as (select distinct on (sid) sid, nid, dep from chain order by sid, dep desc)
update public.unified_tags u
   set merged_into_id = tm.nid
  from terminal tm
  join public.unified_tags target on target.id = tm.nid
 where u.id = tm.sid
   and tm.dep > 1
   and target.status = 'active'      -- only collapse when the walk lands somewhere live
   and u.merged_into_id is distinct from tm.nid;

-- 2. Repoint the routing rows that followed those chains.
update public.tag_slug_redirects r
   set new_slug = c.slug, tag_id = c.id
  from public.unified_tags d
  join public.unified_tags c on c.id = d.merged_into_id
 where r.old_slug = d.slug and d.status = 'merged' and c.status = 'active'
   and (r.new_slug is distinct from c.slug or r.tag_id is distinct from c.id);

-- 3. Stop new chains forming: resolve the canonical to its terminal up front.
--    Defaults preserved -- CREATE OR REPLACE cannot drop them (42P13).
create or replace function public.merge_tag_concept(
  p_canonical_id uuid,
  p_duplicate_id uuid,
  p_actor text default 'system',
  p_source text default 'manual'
)
returns uuid
language plpgsql security definer set search_path = public as $fn$
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
end $fn$;

do $do$
declare v_bad int;
begin
  with recursive chain as (
    select d.id sid, d.merged_into_id nid, 1 dep, array[d.id] seen
      from public.unified_tags d where d.status='merged' and d.merged_into_id is not null
    union all
    select c.sid, t.merged_into_id, c.dep+1, c.seen||t.id from chain c
      join public.unified_tags t on t.id=c.nid
     where t.status<>'active' and t.merged_into_id is not null and not t.id=any(c.seen) and c.dep<10
  ), terminal as (select distinct on (sid) sid, nid, dep from chain order by sid, dep desc)
  select count(*) into v_bad from terminal join public.unified_tags t on t.id=terminal.nid
   where terminal.dep > 1 and t.status = 'active';
  if v_bad > 0 then raise exception '% merge chains still reach an active tag via >1 hop', v_bad; end if;
end $do$;
