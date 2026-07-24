-- Co-occurrence `related` edges: tags that co-tag the same entities well above chance.
-- Jaccard as confidence; support floor + top-K per tag denoise the hub tags.
-- Idempotent over auto rows only (human decisions preserved). related is symmetric →
-- one canonical row per unordered pair. Not on unified_tags → no search-sync storm.
create or replace function public.run_tag_cooccurrence_relations(
  p_min_support int default 6,
  p_min_jaccard numeric default 0.18,
  p_top_k int default 12
) returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  perform public.assert_admin_or_internal();

  -- per-tag entity counts (active tags only)
  create temp table _n on commit drop as
    select a.tag_id, count(distinct (a.entity_id, a.entity_type)) as n
    from public.unified_tag_assignments a
    join public.unified_tags t on t.id = a.tag_id and t.status = 'active'
    group by a.tag_id;

  -- co-occurrence counts for candidate pairs (canonical order id-asc), with Jaccard
  create temp table _pairs on commit drop as
    with co as (
      select a.tag_id as t1, b.tag_id as t2, count(distinct (a.entity_id, a.entity_type)) as c
      from public.unified_tag_assignments a
      join public.unified_tag_assignments b
        on a.entity_id = b.entity_id and a.entity_type = b.entity_type and a.tag_id < b.tag_id
      join public.unified_tags ta on ta.id = a.tag_id and ta.status='active'
      join public.unified_tags tb on tb.id = b.tag_id and tb.status='active'
      group by a.tag_id, b.tag_id
      having count(distinct (a.entity_id, a.entity_type)) >= p_min_support
    )
    select co.t1, co.t2, co.c,
           round((co.c::numeric) / (n1.n + n2.n - co.c), 4) as jaccard
    from co
    join _n n1 on n1.tag_id = co.t1
    join _n n2 on n2.tag_id = co.t2
    where (co.c::numeric) / (n1.n + n2.n - co.c) >= p_min_jaccard
      -- not already a hierarchy edge or a do-not-relate exclusion
      and not exists (
        select 1 from public.tag_relations r
        where r.relation_type = 'broader'
          and ((r.source_tag_id=co.t1 and r.target_tag_id=co.t2)
            or (r.source_tag_id=co.t2 and r.target_tag_id=co.t1)))
      and not exists (
        select 1 from public.tag_relationship_exclusions e
        where e.tag1_id = least(co.t1,co.t2) and e.tag2_id = greatest(co.t1,co.t2));

  -- top-K per tag (each pair counts toward BOTH endpoints' budgets)
  create temp table _kept on commit drop as
    with ranked as (
      select p.*, row_number() over (partition by t1 order by jaccard desc) rk1,
                  row_number() over (partition by t2 order by jaccard desc) rk2
      from _pairs p
    )
    select distinct t1, t2, c, jaccard from ranked
    where rk1 <= p_top_k or rk2 <= p_top_k;

  -- rewrite auto related edges only
  delete from public.tag_relations where relation_type='related' and review_status='auto';
  insert into public.tag_relations (source_tag_id, target_tag_id, relation_type, confidence, review_status)
  select t1, t2, 'related', jaccard, 'auto' from _kept
  on conflict (source_tag_id, target_tag_id, relation_type) do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.run_tag_cooccurrence_relations(int,numeric,int) from public;
grant execute on function public.run_tag_cooccurrence_relations(int,numeric,int) to service_role;

-- nightly recompute (pure SQL, cheap). Register in admin_automations + pg_cron.
-- admin_automations real shape: slug/name, NOT-NULL jsonb trigger+action, managed_by='system'.
insert into public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
values ('tag_cooccurrence_relations','Tag co-occurrence relations',
        'Rebuilds auto `related` edges in tag_relations from tag co-occurrence (Jaccard).',
        'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
        '{"type":"rpc","fn":"run_tag_cooccurrence_relations"}'::jsonb, '40 4 * * *')
on conflict (slug) do update set schedule=excluded.schedule, enabled=excluded.enabled,
  description=excluded.description, name=excluded.name, action=excluded.action, trigger=excluded.trigger;

select cron.schedule('tag_cooccurrence_relations','40 4 * * *',
  $cron$ select public.run_tag_cooccurrence_relations(); $cron$);
