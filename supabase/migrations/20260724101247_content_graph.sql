-- Content Graph Explorer — admin ontology visualization
-- A nightly-recomputed snapshot of how content types are linked, plus a
-- structural instance-neighbours RPC for drill-in. Read via admin-gated RPCs.
--
-- Design notes:
--  * Snapshot pattern (not live scans): the DB is disk-constrained and full
--    COUNTs across 30k-112k row tables are costly. run_content_graph_recompute()
--    runs nightly (statement_timeout=0) into a singleton stats table; the read
--    RPC returns the jsonb instantly.
--  * Entity-type strings in polymorphic junction tables are dirty
--    (venues/venue, news/news_article, person/personality) — content_graph_norm_type
--    normalizes them to the canonical node ids used by the frontend.

-- ── Type normalizer ────────────────────────────────────────────────────────
create or replace function public.content_graph_norm_type(p_type text)
returns text language sql immutable as $$
  select case lower(coalesce(p_type,''))
    when 'venue' then 'venue' when 'venues' then 'venue'
    when 'event' then 'event' when 'events' then 'event'
    when 'city' then 'city' when 'cities' then 'city'
    when 'country' then 'country' when 'countries' then 'country'
    when 'personality' then 'personality' when 'person' then 'personality'
      when 'personalities' then 'personality' when 'people' then 'personality'
    when 'news' then 'news' when 'news_article' then 'news' when 'news_articles' then 'news'
    when 'marketplace' then 'marketplace' when 'marketplace_listing' then 'marketplace'
      when 'marketplace_listings' then 'marketplace' when 'product' then 'marketplace'
    when 'hotel' then 'hotel' when 'hotels' then 'hotel'
    when 'organization' then 'organization' when 'organizations' then 'organization' when 'org' then 'organization'
    when 'milestone' then 'milestone' when 'milestones' then 'milestone'
    when 'village' then 'village' when 'queer_village' then 'village'
      when 'queer_villages' then 'village' when 'villages' then 'village'
    when 'festival' then 'festival' when 'festivals' then 'festival'
    when 'group' then 'group' when 'community_group' then 'group' when 'community_groups' then 'group'
    else null end
$$;

-- ── Singleton stats table ──────────────────────────────────────────────────
create table if not exists public.content_graph_stats (
  id boolean primary key default true,
  snapshot jsonb not null,
  generated_at timestamptz not null default now(),
  constraint content_graph_stats_singleton check (id)
);
alter table public.content_graph_stats enable row level security;
-- No policies: reachable only through SECURITY DEFINER RPCs below.

-- ── Recompute: build the whole ontology snapshot ───────────────────────────
create or replace function public.run_content_graph_recompute()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_nodes jsonb;
  v_edges jsonb;
  v_snapshot jsonb;
begin
  -- NODES: one per content type/attribute layer, with quality counts.
  select jsonb_agg(n) into v_nodes from (
    select jsonb_build_object('type','venue','label','Venues','category','content',
      'count',(select count(*) from venues where duplicate_of_id is null),
      'orphan_count',(select count(*) from venues where duplicate_of_id is null and city_id is null),
      'dup_count',(select count(*) from venues where duplicate_of_id is not null)) n
    union all select jsonb_build_object('type','event','label','Events','category','content',
      'count',(select count(*) from events where duplicate_of_id is null),
      'orphan_count',(select count(*) from events where duplicate_of_id is null and city_id is null and country_id is null and venue_id is null),
      'dup_count',(select count(*) from events where duplicate_of_id is not null))
    union all select jsonb_build_object('type','personality','label','Personalities','category','content',
      'count',(select count(*) from personalities where duplicate_of_id is null),
      'orphan_count',(select count(*) from personalities where duplicate_of_id is null and city_id is null and country_id is null),
      'dup_count',(select count(*) from personalities where duplicate_of_id is not null))
    union all select jsonb_build_object('type','news','label','News','category','content',
      'count',(select count(*) from news_articles where duplicate_of_id is null),
      'orphan_count',null,
      'dup_count',(select count(*) from news_articles where duplicate_of_id is not null))
    union all select jsonb_build_object('type','marketplace','label','Marketplace','category','content',
      'count',(select count(*) from marketplace_listings where duplicate_of_id is null),
      'orphan_count',(select count(*) from marketplace_listings where duplicate_of_id is null and category_id is null),
      'dup_count',(select count(*) from marketplace_listings where duplicate_of_id is not null))
    union all select jsonb_build_object('type','hotel','label','Hotels','category','content',
      'count',(select count(*) from hotels),
      'orphan_count',(select count(*) from hotels where city_id is null),
      'dup_count',0)
    union all select jsonb_build_object('type','organization','label','Organizations','category','content',
      'count',(select count(*) from organizations),
      'orphan_count',(select count(*) from organizations where city_id is null and country_id is null),
      'dup_count',0)
    union all select jsonb_build_object('type','milestone','label','Milestones','category','content',
      'count',(select count(*) from milestones where duplicate_of_id is null),
      'orphan_count',(select count(*) from milestones where duplicate_of_id is null and city_id is null and country_id is null),
      'dup_count',(select count(*) from milestones where duplicate_of_id is not null))
    union all select jsonb_build_object('type','city','label','Cities','category','geo',
      'count',(select count(*) from cities where duplicate_of_id is null),
      'orphan_count',(select count(*) from cities where duplicate_of_id is null and country_id is null),
      'dup_count',(select count(*) from cities where duplicate_of_id is not null))
    union all select jsonb_build_object('type','country','label','Countries','category','geo',
      'count',(select count(*) from countries where duplicate_of_id is null),
      'orphan_count',(select count(*) from countries where duplicate_of_id is null and continent_id is null),
      'dup_count',(select count(*) from countries where duplicate_of_id is not null))
    union all select jsonb_build_object('type','continent','label','Continents','category','geo',
      'count',(select count(*) from continents),'orphan_count',null,'dup_count',0)
    union all select jsonb_build_object('type','region','label','Regions','category','geo',
      'count',(select count(*) from regions),'orphan_count',null,'dup_count',0)
    union all select jsonb_build_object('type','village','label','Queer Villages','category','geo',
      'count',(select count(*) from queer_villages),
      'orphan_count',(select count(*) from queer_villages where city_id is null),'dup_count',0)
    union all select jsonb_build_object('type','festival','label','Festivals','category','community',
      'count',(select count(*) from festivals),
      'orphan_count',(select count(*) from festivals where city_id is null),'dup_count',0)
    union all select jsonb_build_object('type','group','label','Community Groups','category','community',
      'count',(select count(*) from community_groups),'orphan_count',null,'dup_count',0)
    union all select jsonb_build_object('type','tag','label','Tags','category','taxonomy',
      'count',(select count(*) from unified_tags where merged_into_id is null),
      'orphan_count',(select count(*) from unified_tags ut where ut.merged_into_id is null
        and not exists (select 1 from unified_tag_assignments a where a.tag_id = ut.id)),
      'dup_count',(select count(*) from unified_tags where merged_into_id is not null))
    union all select jsonb_build_object('type','image','label','Images','category','media',
      'count',(select count(*) from image_assets),'orphan_count',null,'dup_count',0)
  ) s;

  -- EDGES: relationship classes with real link counts.
  with e(src,tgt,rel,kind,cnt) as (
    -- structural + geo (foreign keys)
    select 'venue','city','in city','geo',(select count(*) from venues where duplicate_of_id is null and city_id is not null)
    union all select 'venue','country','in country','geo',(select count(*) from venues where duplicate_of_id is null and country_id is not null)
    union all select 'venue','organization','run by','structural',(select count(*) from venues where duplicate_of_id is null and organization_id is not null)
    union all select 'venue','village','in village','structural',(select count(*) from venues where duplicate_of_id is null and queer_village_id is not null)
    union all select 'event','venue','at venue','structural',(select count(*) from events where duplicate_of_id is null and venue_id is not null)
    union all select 'event','city','in city','geo',(select count(*) from events where duplicate_of_id is null and city_id is not null)
    union all select 'event','festival','part of','structural',(select count(*) from events where duplicate_of_id is null and festival_id is not null)
    union all select 'event','group','hosted by','structural',(select count(*) from events where duplicate_of_id is null and group_id is not null)
    union all select 'hotel','city','in city','geo',(select count(*) from hotels where city_id is not null)
    union all select 'hotel','village','in village','structural',(select count(*) from hotels where queer_village_id is not null)
    union all select 'organization','city','in city','geo',(select count(*) from organizations where city_id is not null)
    union all select 'organization','venue','primary venue','structural',(select count(*) from organizations where primary_venue_id is not null)
    union all select 'personality','city','born in','geo',(select count(*) from personalities where duplicate_of_id is null and city_id is not null)
    union all select 'personality','country','born in','geo',(select count(*) from personalities where duplicate_of_id is null and country_id is not null)
    union all select 'milestone','city','in city','geo',(select count(*) from milestones where duplicate_of_id is null and city_id is not null)
    union all select 'milestone','country','in country','geo',(select count(*) from milestones where duplicate_of_id is null and country_id is not null)
    union all select 'festival','city','in city','geo',(select count(*) from festivals where city_id is not null)
    union all select 'festival','venue','at venue','structural',(select count(*) from festivals where venue_id is not null)
    union all select 'village','city','in city','geo',(select count(*) from queer_villages where city_id is not null)
    union all select 'marketplace','venue','sold at','structural',(select count(*) from marketplace_listings where duplicate_of_id is null and venue_id is not null)
    union all select 'city','country','in country','geo',(select count(*) from cities where duplicate_of_id is null and country_id is not null)
    union all select 'country','continent','on continent','geo',(select count(*) from countries where duplicate_of_id is null and continent_id is not null)
    union all select 'country','region','in region','geo',(select count(*) from countries where duplicate_of_id is null and region_id is not null)
    -- tag layer (polymorphic assignments, per facet)
    union all select 'tag',
      case tag_facet_of(entity_type) when 'person' then 'personality' else tag_facet_of(entity_type) end,
      'tagged','tag',count(*)
      from unified_tag_assignments
      where tag_facet_of(entity_type) is not null and tag_facet_of(entity_type) <> 'tag'
      group by 2
    -- ontology (curated tag↔tag relations)
    union all select 'tag','tag',relation_type,'ontology',count(*) from tag_relations group by relation_type
    -- cross-entity junctions
    union all select 'news',content_graph_norm_type(entity_type),'mentions','cross',count(*)
      from news_article_entities where content_graph_norm_type(entity_type) is not null group by 2
    union all select 'milestone',content_graph_norm_type(entity_type),'commemorates','cross',count(*)
      from milestone_links where content_graph_norm_type(entity_type) is not null group by 2
    union all select 'personality','personality','related to','cross',(select count(*) from personality_relationships)
    -- media
    union all select content_graph_norm_type(entity_type),'image','has media','media',count(*)
      from image_asset_links where content_graph_norm_type(entity_type) is not null group by 1
  )
  select jsonb_agg(jsonb_build_object(
    'source',src,'target',tgt,'relation',rel,'relation_kind',kind,'count',cnt
  ) order by cnt desc) into v_edges
  from e where cnt > 0;

  v_snapshot := jsonb_build_object(
    'nodes', coalesce(v_nodes,'[]'::jsonb),
    'edges', coalesce(v_edges,'[]'::jsonb),
    'generated_at', now()
  );

  insert into public.content_graph_stats(id,snapshot,generated_at)
  values (true, v_snapshot, now())
  on conflict (id) do update set snapshot = excluded.snapshot, generated_at = excluded.generated_at;

  return v_snapshot;
end;
$$;

-- ── Read RPC (admin-gated) ─────────────────────────────────────────────────
create or replace function public.admin_content_graph()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform assert_admin_or_internal();
  select snapshot into v from public.content_graph_stats where id;
  if v is null then
    v := public.run_content_graph_recompute();
  end if;
  return v;
end;
$$;

-- ── Instance-level structural neighbours (admin-gated) ─────────────────────
-- Returns {nodes,edges} for the ego graph around one record: its geo parents,
-- top tags, dedup siblings, and type-specific structural links. Bounded per
-- relation. Distinct from related_entities (which is semantic similarity).
create or replace function public.admin_entity_neighbors(p_type text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t text := content_graph_norm_type(p_type);
  center_key text := t || ':' || p_id;
  center_title text;
  nodes jsonb := '[]'::jsonb;
  edges jsonb := '[]'::jsonb;
  r record;
begin
  perform assert_admin_or_internal();
  if t is null then return jsonb_build_object('nodes','[]'::jsonb,'edges','[]'::jsonb); end if;

  -- resolve center title
  center_title := case t
    when 'venue' then (select name from venues where id=p_id)
    when 'event' then (select title from events where id=p_id)
    when 'city' then (select name from cities where id=p_id)
    when 'country' then (select name from countries where id=p_id)
    when 'personality' then (select name from personalities where id=p_id)
    when 'marketplace' then (select title from marketplace_listings where id=p_id)
    when 'hotel' then (select name from hotels where id=p_id)
    when 'organization' then (select name from organizations where id=p_id)
    when 'milestone' then (select title from milestones where id=p_id)
    when 'news' then (select title from news_articles where id=p_id)
    when 'village' then (select name from queer_villages where id=p_id)
    else null end;

  nodes := jsonb_build_array(jsonb_build_object(
    'key',center_key,'type',t,'id',p_id,'title',coalesce(center_title,t),'center',true));

  -- geo parents (city / country) for types that carry them
  for r in
    select 'city' nt, c.id nid, c.name ntitle
      from cities c where c.id = (
        case t
          when 'venue' then (select city_id from venues where id=p_id)
          when 'event' then (select city_id from events where id=p_id)
          when 'personality' then (select city_id from personalities where id=p_id)
          when 'hotel' then (select city_id from hotels where id=p_id)
          when 'organization' then (select city_id from organizations where id=p_id)
          when 'milestone' then (select city_id from milestones where id=p_id)
          when 'village' then (select city_id from queer_villages where id=p_id)
          else null end)
    union all
    select 'country' nt, c.id nid, c.name ntitle
      from countries c where c.id = (
        case t
          when 'venue' then (select country_id from venues where id=p_id)
          when 'event' then (select country_id from events where id=p_id)
          when 'personality' then (select country_id from personalities where id=p_id)
          when 'city' then (select country_id from cities where id=p_id)
          when 'milestone' then (select country_id from milestones where id=p_id)
          else null end)
  loop
    nodes := nodes || jsonb_build_object('key',r.nt||':'||r.nid,'type',r.nt,'id',r.nid,'title',r.ntitle);
    edges := edges || jsonb_build_object('source',center_key,'target',r.nt||':'||r.nid,'relation','geo');
  end loop;

  -- top tags on this entity
  for r in
    select ut.id nid, ut.name ntitle
    from unified_tag_assignments a
    join unified_tags ut on ut.id = a.tag_id
    where a.entity_id = p_id and content_graph_norm_type(a.entity_type) = t
      and ut.merged_into_id is null
    order by ut.usage_count desc nulls last
    limit 12
  loop
    nodes := nodes || jsonb_build_object('key','tag:'||r.nid,'type','tag','id',r.nid,'title',r.ntitle);
    edges := edges || jsonb_build_object('source',center_key,'target','tag:'||r.nid,'relation','tagged');
  end loop;

  -- type-specific structural children
  if t = 'venue' then
    for r in select id, title from events where venue_id=p_id and duplicate_of_id is null order by start_date desc nulls last limit 8 loop
      nodes := nodes || jsonb_build_object('key','event:'||r.id,'type','event','id',r.id,'title',r.title);
      edges := edges || jsonb_build_object('source','event:'||r.id,'target',center_key,'relation','at venue');
    end loop;
  elsif t = 'city' then
    for r in select id, name from venues where city_id=p_id and duplicate_of_id is null order by quality_score desc nulls last limit 10 loop
      nodes := nodes || jsonb_build_object('key','venue:'||r.id,'type','venue','id',r.id,'title',r.name);
      edges := edges || jsonb_build_object('source','venue:'||r.id,'target',center_key,'relation','in city');
    end loop;
    for r in select id, title from events where city_id=p_id and duplicate_of_id is null order by start_date desc nulls last limit 6 loop
      nodes := nodes || jsonb_build_object('key','event:'||r.id,'type','event','id',r.id,'title',r.title);
      edges := edges || jsonb_build_object('source','event:'||r.id,'target',center_key,'relation','in city');
    end loop;
  elsif t = 'country' then
    for r in select id, name from cities where country_id=p_id and duplicate_of_id is null order by name limit 12 loop
      nodes := nodes || jsonb_build_object('key','city:'||r.id,'type','city','id',r.id,'title',r.name);
      edges := edges || jsonb_build_object('source','city:'||r.id,'target',center_key,'relation','in country');
    end loop;
  elsif t = 'personality' then
    for r in
      select pr.target_personality_id tid, p.name ntitle, pr.relationship_type rt
      from personality_relationships pr join personalities p on p.id = pr.target_personality_id
      where pr.source_personality_id = p_id and pr.target_personality_id is not null
      order by pr.weight desc nulls last limit 10
    loop
      nodes := nodes || jsonb_build_object('key','personality:'||r.tid,'type','personality','id',r.tid,'title',r.ntitle);
      edges := edges || jsonb_build_object('source',center_key,'target','personality:'||r.tid,'relation',coalesce(r.rt,'related'));
    end loop;
  elsif t = 'organization' then
    for r in select id, name from venues where organization_id=p_id and duplicate_of_id is null limit 10 loop
      nodes := nodes || jsonb_build_object('key','venue:'||r.id,'type','venue','id',r.id,'title',r.name);
      edges := edges || jsonb_build_object('source','venue:'||r.id,'target',center_key,'relation','run by');
    end loop;
  elsif t = 'news' then
    for r in
      select content_graph_norm_type(entity_type) nt, entity_id nid
      from news_article_entities where article_id=p_id and content_graph_norm_type(entity_type) is not null limit 12
    loop
      nodes := nodes || jsonb_build_object('key',r.nt||':'||r.nid,'type',r.nt,'id',r.nid,'title',r.nt);
      edges := edges || jsonb_build_object('source',center_key,'target',r.nt||':'||r.nid,'relation','mentions');
    end loop;
  elsif t = 'milestone' then
    for r in
      select content_graph_norm_type(entity_type) nt, entity_id nid
      from milestone_links where milestone_id=p_id and content_graph_norm_type(entity_type) is not null limit 12
    loop
      nodes := nodes || jsonb_build_object('key',r.nt||':'||r.nid,'type',r.nt,'id',r.nid,'title',r.nt);
      edges := edges || jsonb_build_object('source',center_key,'target',r.nt||':'||r.nid,'relation','commemorates');
    end loop;
  end if;

  -- dedup siblings (entities merged into this one) for types with duplicate_of_id
  if t in ('venue','personality') then
    if t = 'venue' then
      for r in select id, name ntitle from venues where duplicate_of_id = p_id limit 8 loop
        nodes := nodes || jsonb_build_object('key','venue:'||r.id,'type','venue','id',r.id,'title',r.ntitle);
        edges := edges || jsonb_build_object('source','venue:'||r.id,'target',center_key,'relation','duplicate of');
      end loop;
    elsif t = 'personality' then
      for r in select id, name ntitle from personalities where duplicate_of_id = p_id limit 8 loop
        nodes := nodes || jsonb_build_object('key','personality:'||r.id,'type','personality','id',r.id,'title',r.ntitle);
        edges := edges || jsonb_build_object('source','personality:'||r.id,'target',center_key,'relation','duplicate of');
      end loop;
    end if;
  end if;

  return jsonb_build_object('nodes',nodes,'edges',edges);
end;
$$;

-- ── Grants (self-gating: functions enforce admin internally) ──────────────
revoke all on function public.admin_content_graph() from public;
revoke all on function public.admin_entity_neighbors(text, uuid) from public;
grant execute on function public.admin_content_graph() to authenticated, service_role;
grant execute on function public.admin_entity_neighbors(text, uuid) to authenticated, service_role;
grant execute on function public.run_content_graph_recompute() to service_role;

-- ── Automation registry + cron (nightly refresh) ──────────────────────────
insert into public.admin_automations(slug, name, description, managed_by, enabled, trigger, action, schedule)
values (
  'content_graph_recompute',
  'Recompute content graph snapshot',
  'Nightly rebuild of the admin Content Graph ontology snapshot (node/edge counts).',
  'system', true, '{"type":"cron"}'::jsonb,
  '{"type":"rpc","fn":"run_content_graph_recompute"}'::jsonb,
  '20 4 * * *'
) on conflict (slug) do nothing;

select cron.schedule(
  'content_graph_recompute', '20 4 * * *',
  'SET statement_timeout = 0; SELECT public.run_content_graph_recompute();'
);

-- Seed the first snapshot so the page is populated immediately.
select public.run_content_graph_recompute();
