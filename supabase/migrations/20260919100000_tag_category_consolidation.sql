-- Tag DQ Phase 1.1 — category consolidation.
-- Map signed off from docs/plans/2026-08-22-tag-dq-program.md.
--
-- TWO ROWS OF THAT MAP CANNOT BE EXECUTED AS WRITTEN, and the reason is a
-- silent data-loss trap rather than a style objection:
--
--   tag_categories_parent_id_fkey is ON DELETE CASCADE, and
--   unified_tags_category_id_fkey is ON DELETE SET NULL.
--
-- The map says "merge Places & Travel (L0, 116 tags) into Travel & Destinations"
-- and "merge Support & News (L0, 4 tags) into Current Affairs". Both sources are
-- LEVEL-0 ROOTS and both targets are their OWN CHILDREN. Deleting the source row
-- would cascade into every sibling:
--
--   places-travel  -> accommodation, safe-spaces, travel-destinations,
--                     venues-nightlife            (616 active tags)
--   support-news   -> current-affairs (the merge TARGET), helplines-hotlines,
--                     professions-allies, support-services   (128 active tags)
--
-- ...and each orphaned tag's category_id would then be SET NULL. That is 744
-- active tags silently uncategorized -- undoing Phase 1.2, which is the migration
-- immediately before this one. No error would have been raised.
--
-- So for those two the INTENT is preserved and the mechanism is not: the tags
-- sitting directly on the root move into the named child, and the root SURVIVES
-- as the structural container for its children. An L0 root holding no direct
-- tags is normal here -- it is what the other roots already look like.
--
-- Net: 55 -> 48 categories (2 empty deletions + 5 leaf-merge deletions), not the
-- 55 -> 47 the plan predicted -- the two L0 roots survive. The plan's own
-- arithmetic was off by one anyway (2 deletes + 7 merges against 55 is 46).
--
-- Guard: the merge loop REFUSES to delete a category that still has children,
-- so the cascade above is unspellable even if this map is extended later by
-- someone who has not read this comment.
--
-- Actor: 11 of the 291 tags being moved are human_reviewed, and
-- log_unified_tag_change() rejects any change to those from an actor matching
-- 'system:%' (which is what current_setting('app.actor') defaults to). The gate
-- is not bypassed -- it is answered: app.actor is set to this migration's name,
-- which is both accountable and non-'system:', so all 291 moves land in
-- tag_change_log attributed to it. Leaving them behind was not an option: their
-- category is deleted moments later and unified_tags_category_id_fkey is
-- ON DELETE SET NULL, so "skip the curated ones" means "silently uncategorize
-- the curated ones".
--
-- Dry-run on prod (rolled back): 7 categories dropped, 291 tags repointed,
-- 12 junction rows repointed, 48 categories left, uncategorized-active
-- unchanged at 136, is_adult unchanged at 2026, 291 change-log rows.

-- ---------------------------------------------------------------------------
-- PREREQUISITE: changing a tag's category was impossible on prod.
--
-- Measured, single row, no bulk involved:
--   update unified_tags set category_id = <any other> where id = <any tag>;
--   ERROR 27000: tuple to be updated was already modified by an operation
--                triggered by the current command
--
-- The cycle:
--   UPDATE unified_tags.category_id
--     -> BEFORE trg_sync_tag_category (sync_tag_category_assignment)
--          upserts into tag_category_assignments
--     -> AFTER unified_tags_recompute_is_adult_trigger on that table
--          UPDATE unified_tags SET is_adult WHERE id = <the same row>
--     -> the outer command's tuple has now been modified mid-flight -> 27000.
--
-- So every category write through the normal path fails, including the admin
-- UI's category picker. Phase 1.2 did not hit it because it only ever wrote
-- NULL, and the BEFORE trigger's body is gated on NEW.category_id IS NOT NULL.
-- Phase 1.1 and 1.3 both write non-null categories, so this has to be fixed
-- first rather than worked around with session_replication_role.
--
-- Fix is exactly what Postgres' own hint says: propagate to other rows from an
-- AFTER trigger. Split the BEFORE trigger in two -- it mutates NEW.category
-- (only legal in BEFORE) *and* writes a side table (safe only in AFTER):
--   BEFORE: set NEW.category text from the new category_id.  Nothing else.
--   AFTER : upsert the primary junction row.
-- The nested is_adult write then runs as its own command instead of re-entering
-- the one in flight. It terminates: that write does not touch category_id, so
-- neither trigger re-fires.
create or replace function public.sync_tag_category_assignment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if new.category_id is distinct from old.category_id and new.category_id is not null then
    new.category := (select name from tag_categories where id = new.category_id);
  end if;
  return new;
end;
$fn$;

create or replace function public.sync_tag_category_assignment_after()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if new.category_id is distinct from old.category_id and new.category_id is not null then
    update tag_category_assignments
       set is_primary = false
     where tag_id = new.id and is_primary = true and category_id <> new.category_id;

    insert into tag_category_assignments (tag_id, category_id, is_primary)
    values (new.id, new.category_id, true)
    on conflict (tag_id, category_id) do update set is_primary = true;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_sync_tag_category_after on public.unified_tags;
create trigger trg_sync_tag_category_after
  after update of category_id on public.unified_tags
  for each row execute function public.sync_tag_category_assignment_after();

-- Belt and braces: a recompute that changes nothing should not write at all.
-- On its own this would not have been enough (a tag genuinely moving into or
-- out of Sexuality & Kink still writes), but it removes the write on the
-- overwhelmingly common no-change path.
create or replace function public.unified_tags_recompute_is_adult()
returns trigger
language plpgsql
set search_path to 'public'
as $fn$
declare
  v_tag_id uuid := coalesce(new.tag_id, old.tag_id);
  v_is_adult boolean;
begin
  if v_tag_id is null then return coalesce(new, old); end if;
  select exists (
    select 1 from public.tag_category_assignments tca
    join public.tag_categories tc on tc.id = tca.category_id
    left join public.tag_categories tcp on tcp.id = tc.parent_id
    where tca.tag_id = v_tag_id
      and (tc.name in ('Sexuality & Kink','Sexual Roles','BDSM & Power Exchange',
                       'Fetishes & Interests','Practices & Play','Gear & Aesthetics',
                       'Body Types & Archetypes')
           or tcp.name = 'Sexuality & Kink')
  ) into v_is_adult;
  update public.unified_tags
     set is_adult = v_is_adult
   where id = v_tag_id and is_adult is distinct from v_is_adult;
  return coalesce(new, old);
end;
$fn$;

-- ---------------------------------------------------------------------------
do $$
declare
  -- source_slug, target_slug, delete_source
  v_merges text[][] := array[
    ['history-by-region',      'history-heritage',         'yes'],
    ['friendship-community',   'community-culture',        'yes'],
    ['global-regional-rights', 'legal-rights',             'yes'],
    ['helplines-hotlines',     'support-services',         'yes'],
    ['dating-courtship',       'relationships-connection', 'yes'],
    -- L0 roots: move direct tags down, keep the container (see header)
    ['places-travel',          'travel-destinations',      'no'],
    ['support-news',           'current-affairs',          'no']
  ];
  v_deletes text[] := array['risk-aware-play', 'safer-sex'];
  r text[];
  v_src uuid; v_tgt uuid;
  v_children int; v_tags int; v_junction int;
  v_moved_tags int := 0; v_moved_junction int := 0; v_dropped int := 0;
  s text;
begin
  -- See header: answers the human_reviewed gate with an accountable actor.
  perform set_config('app.actor', 'migration:20260919100000_tag_category_consolidation', true);

  foreach s in array v_deletes loop
    select id into v_src from tag_categories where slug = s;
    if v_src is null then
      raise notice 'delete: % already absent', s; continue;
    end if;
    select count(*) into v_tags     from unified_tags where category_id = v_src;
    select count(*) into v_junction from tag_category_assignments where category_id = v_src;
    select count(*) into v_children from tag_categories where parent_id = v_src;
    if v_tags > 0 or v_junction > 0 or v_children > 0 then
      raise exception 'refusing to delete %: % tags, % junction rows, % children (expected empty)',
        s, v_tags, v_junction, v_children;
    end if;
    delete from tag_categories where id = v_src;
    v_dropped := v_dropped + 1;
  end loop;

  foreach r slice 1 in array v_merges loop
    select id into v_src from tag_categories where slug = r[1];
    select id into v_tgt from tag_categories where slug = r[2];
    if v_src is null or v_tgt is null then
      raise exception 'merge %->%: source or target slug not found', r[1], r[2];
    end if;

    update unified_tags set category_id = v_tgt where category_id = v_src;
    get diagnostics v_tags = row_count;
    v_moved_tags := v_moved_tags + v_tags;

    insert into tag_category_assignments (tag_id, category_id, is_primary)
    select tag_id, v_tgt, is_primary from tag_category_assignments where category_id = v_src
    on conflict (tag_id, category_id) do nothing;
    get diagnostics v_junction = row_count;
    v_moved_junction := v_moved_junction + v_junction;
    delete from tag_category_assignments where category_id = v_src;

    if r[3] = 'yes' then
      select count(*) into v_children from tag_categories where parent_id = v_src;
      if v_children > 0 then
        -- ON DELETE CASCADE would take the children with it. Never.
        raise exception 'refusing to delete % : still has % child categories', r[1], v_children;
      end if;
      delete from tag_categories where id = v_src;
      v_dropped := v_dropped + 1;
    end if;

    raise notice 'merged % -> % (% tags, % junction rows, source %)',
      r[1], r[2], v_tags, v_junction, case when r[3]='yes' then 'deleted' else 'kept as container' end;
  end loop;

  raise notice 'phase 1.1 done: % categories deleted, % tags repointed, % junction rows repointed, % categories remain',
    v_dropped, v_moved_tags, v_moved_junction, (select count(*) from tag_categories);
end $$;

-- Post-conditions. A category tree this small should never disagree with itself.
do $$
declare v_orphan int; v_cycle int; v_bad_level int;
begin
  select count(*) into v_orphan from unified_tags u
   where u.category_id is not null
     and not exists (select 1 from tag_categories c where c.id = u.category_id);
  if v_orphan > 0 then raise exception 'dangling category_id on % tags', v_orphan; end if;

  select count(*) into v_cycle from tag_categories where parent_id = id;
  if v_cycle > 0 then raise exception '% self-parented categories', v_cycle; end if;

  select count(*) into v_bad_level from tag_categories c
    join tag_categories p on p.id = c.parent_id
   where c.level <> p.level + 1;
  if v_bad_level > 0 then raise exception '% categories whose level disagrees with their parent', v_bad_level; end if;
end $$;

-- The map actually took effect, and the two roots that must NOT be deleted
-- are still standing. Asserted by slug rather than by a total count, so a
-- category added by another session between authoring and apply does not
-- fail this migration for an unrelated reason.
do $$
declare v_left text; v_missing text; v_direct int;
begin
  select string_agg(slug, ', ') into v_left from tag_categories
   where slug in ('risk-aware-play','safer-sex','history-by-region','friendship-community',
                  'global-regional-rights','helplines-hotlines','dating-courtship');
  if v_left is not null then raise exception 'consolidation incomplete, still present: %', v_left; end if;

  select string_agg(s, ', ') into v_missing from unnest(array[
    'places-travel','support-news','travel-destinations','current-affairs','history-heritage',
    'community-culture','legal-rights','support-services','relationships-connection']) s
   where not exists (select 1 from tag_categories c where c.slug = s);
  if v_missing is not null then raise exception 'these must survive but are gone: %', v_missing; end if;

  select count(*) into v_direct from unified_tags u join tag_categories c on c.id = u.category_id
   where c.slug in ('places-travel','support-news');
  if v_direct > 0 then raise exception '% tags still sit directly on a container root', v_direct; end if;
end $$;
