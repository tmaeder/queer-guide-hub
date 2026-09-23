-- Production follow-up for the milestone data-quality programme: guarantee a
-- controlled fallback topic and bound duplicate detection to precomputed rows.
begin;

create or replace function public.backfill_milestone_topic_tags(
  p_limit integer default 1000,p_force boolean default false,p_milestone_id uuid default null
)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_changed integer;
begin
  with proposed as (
    select m.id, array_remove(array[
      case when m.category='uprising-movement' then 'activism' end,
      case when m.category in ('law-equality','law-decriminalization','law-criminalization') then
        case when m.category='law-decriminalization' then 'decriminalization' else 'human-rights' end end,
      case when m.category='health-aids' or lower(m.title||' '||coalesce(m.description,'')) ~ '(hiv|aids)' then 'aids' end,
      case when m.category='culture-media' then 'arts-culture' end,
      case when m.category='politics-representation' then 'politics' end,
      case when m.category='community-institution' then 'community' end,
      case when m.category in ('depathologization','persecution-destruction') then 'human-rights' end,
      'queer-history'
    ],null) tags
    from public.milestones m
    where (p_milestone_id is null or m.id=p_milestone_id)
      and (p_force or coalesce(cardinality(m.tags),0)=0)
    order by m.quality_tier,m.significance desc
    limit greatest(1,least(p_limit,4000))
  ), valid as (
    select p.id,array_agg(t.slug order by t.slug) tags from proposed p
    cross join unnest(p.tags) s(slug)
    join public.unified_tags t on t.slug=s.slug and t.status='active'
    group by p.id
  )
  update public.milestones m set tags=v.tags,updated_at=now() from valid v
  where m.id=v.id and m.tags is distinct from v.tags;
  get diagnostics v_changed=row_count;
  return jsonb_build_object('tagged',v_changed);
end;
$$;

create or replace function public.run_milestone_duplicate_detection(p_limit integer default 500)
returns jsonb language plpgsql security definer set search_path to 'public','extensions','pg_temp'
as $$
declare v_count integer;
begin
  with base as materialized (
    select m.id,m.title,m.date,coalesce(m.date_end,m.date) date_end,m.country_id,
      coalesce(array_agg(distinct l.entity_type||':'||l.entity_id::text)
        filter(where l.entity_id is not null),'{}'::text[]) entities
    from public.milestones m
    left join public.milestone_links l on l.milestone_id=m.id
    where m.duplicate_of_id is null and m.status<>'archived'
    group by m.id
  ), pairs as (
    select a.id id1,b.id id2,similarity(lower(a.title),lower(b.title)) title_similarity,
      true date_near,
      (a.country_id is not null and a.country_id=b.country_id) same_country,
      (a.entities && b.entities) shared_entity
    from base a join base b on a.id<b.id
      and a.date<=b.date_end+interval '366 days'
      and b.date<=a.date_end+interval '366 days'
      and ((a.country_id is not null and a.country_id=b.country_id) or a.entities && b.entities)
    where similarity(lower(a.title),lower(b.title))>=.55
  ), ranked as (
    select *,least(.99,title_similarity + case when same_country then .08 else 0 end
      + case when shared_entity then .12 else 0 end)::numeric(4,3) confidence
    from pairs order by confidence desc limit greatest(1,least(p_limit,2000))
  ), ins as (
    insert into public.milestone_duplicate_candidates(milestone_id_1,milestone_id_2,confidence,signals)
    select id1,id2,confidence,jsonb_build_object('title_similarity',title_similarity,
      'date_near',date_near,'same_country',same_country,'shared_entity',shared_entity)
    from ranked where confidence>=.70
    on conflict(milestone_id_1,milestone_id_2) do update
      set confidence=excluded.confidence,signals=excluded.signals
      where public.milestone_duplicate_candidates.status='pending'
    returning 1
  ) select count(*) into v_count from ins;
  return jsonb_build_object('candidates_upserted',v_count);
end;
$$;

revoke all on function public.backfill_milestone_topic_tags(integer,boolean,uuid) from public;
revoke all on function public.run_milestone_duplicate_detection(integer) from public;
grant execute on function public.backfill_milestone_topic_tags(integer,boolean,uuid) to service_role;
grant execute on function public.run_milestone_duplicate_detection(integer) to service_role;

commit;
