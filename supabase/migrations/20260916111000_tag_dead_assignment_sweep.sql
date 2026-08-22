-- Tag DQ Phase 0.2 + 0.3 (plan 2026-08-22).
--
-- 0.2a: 8,823 live unified_tag_assignments point at DEPRECATED tags - dead
--       vocabulary still rendered on public tag rails. Where exactly one active
--       tag shares the deprecated tag's name, the link is repointed; the rest
--       are deleted with a dated backup.
-- 0.2b: the entity_type='news_article' block (35,250 rows over 169 tags) is the
--       dead writer retired in March 2026 - the concentration junk (CABINS 4,136,
--       dick-on-a-stick, e-stim-machine) lives here. Measured 2026-08-16 and
--       re-verified 2026-08-22: only 152 rows also exist under the canonical
--       'news' spelling, 2,071 point at deleted articles; deleting the block
--       loses zero reproducible links. Sweep designed in
--       docs/plans/2026-08-16-news-tag-concentration-design.md (part: dead-writer
--       sweep), shipped here.
-- 0.3:  BEFORE trigger normalizes entity_type spellings at write so the
--       vocabulary cannot re-dirty ('news_article' -> 'news' etc.). Canonical
--       spellings are the CURRENT dominant ones so existing readers (which
--       filter on 'venues', 'news', ...) stay untouched.

select set_config('app.actor', 'migration:tag-dq-phase0', false);

-- ---------------------------------------------------------------------------
-- Backup everything this migration deletes or moves.
create table if not exists unified_tag_assignments_backup_20260916 as
  select uta.*, ut.slug as tag_slug, ut.status as tag_status,
         case when uta.entity_type = 'news_article' then 'news_article_dead_writer'
              else 'deprecated_tag' end as sweep_reason
  from unified_tag_assignments uta
  join unified_tags ut on ut.id = uta.tag_id
  where ut.status = 'deprecated' or uta.entity_type = 'news_article';

alter table unified_tag_assignments_backup_20260916 enable row level security;
revoke all on unified_tag_assignments_backup_20260916 from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 0.2b: drop the dead-writer block first (it also removes any deprecated-tag
-- rows inside it, shrinking the repoint set).
delete from unified_tag_assignments where entity_type = 'news_article';

-- ---------------------------------------------------------------------------
-- 0.2a: repoint deprecated-tag assignments where exactly ONE active tag shares
-- the name (post twin-merge, names among active tags are nearly unique).
-- min(uuid) has no aggregate; array_agg + [1] is the established workaround
create temp table _dep_map on commit drop as
  select d.id as dep_id, (array_agg(a.id order by a.id))[1] as act_id
  from unified_tags d
  join unified_tags a on lower(a.name) = lower(d.name)
       and a.status = 'active' and a.merged_into_id is null
  where d.status = 'deprecated'
  group by d.id
  having count(distinct a.id) = 1;

-- rows that would collide with an existing canonical assignment go away first
delete from unified_tag_assignments uta
using _dep_map m
where uta.tag_id = m.dep_id
  and exists (select 1 from unified_tag_assignments c
               where c.tag_id = m.act_id
                 and c.entity_id = uta.entity_id
                 and c.entity_type = uta.entity_type);

-- collisions WITHIN the repoint set (two deprecated same-name tags mapping to
-- the same active target on the same entity): keep the lowest-id row.
delete from unified_tag_assignments uta
using _dep_map m, unified_tag_assignments o, _dep_map m2
where uta.tag_id = m.dep_id
  and o.tag_id = m2.dep_id
  and m2.act_id = m.act_id
  and o.entity_id = uta.entity_id
  and o.entity_type = uta.entity_type
  and o.id < uta.id;

update unified_tag_assignments uta
   set tag_id = m.act_id
  from _dep_map m
 where uta.tag_id = m.dep_id;

-- Everything still pointing at a deprecated tag has no active home: delete.
delete from unified_tag_assignments uta
using unified_tags ut
where ut.id = uta.tag_id and ut.status = 'deprecated';

-- ---------------------------------------------------------------------------
-- Recount usage for every tag the sweep touched (targeted recount avoids the
-- human_reviewed audit trap and the search-sync storm; chunks of 200).
do $$
declare
  v_ids uuid[];
  v_chunk uuid[];
  i int := 1;
begin
  select array_agg(distinct tag_id) into v_ids from (
    select tag_id from unified_tag_assignments_backup_20260916
    union
    select act_id from _dep_map
  ) t;
  if v_ids is null then return; end if;
  while i <= array_length(v_ids, 1) loop
    v_chunk := v_ids[i : least(i + 199, array_length(v_ids, 1))];
    perform recount_unified_tag_usage_for(v_chunk);
    i := i + 200;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 0.3: keep the entity_type vocabulary canonical at write. Mapping targets are
-- the spellings production data already uses, so no reader changes.
create or replace function public.normalize_uta_entity_type()
returns trigger
language plpgsql
as $$
begin
  new.entity_type := case lower(coalesce(new.entity_type, ''))
    when 'news_article'  then 'news'
    when 'venue'         then 'venues'
    when 'hotels'        then 'hotel'
    when 'personalities' then 'personality'
    when 'marketplace'   then 'marketplace_listing'
    when 'events'        then 'event'
    when 'cities'        then 'city'
    when 'countries'     then 'country'
    when 'queer_village' then 'village'
    when 'group'         then 'community_group'
    else new.entity_type
  end;
  return new;
end;
$$;

drop trigger if exists trg_uta_normalize_entity_type on public.unified_tag_assignments;
create trigger trg_uta_normalize_entity_type
  before insert or update of entity_type on public.unified_tag_assignments
  for each row execute function public.normalize_uta_entity_type();
