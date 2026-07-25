-- Perf fix: the previous _cand build re-parsed each (large) Wikidata JSON body
-- once per (map row × fetch row) and rebuilt a jsonpath per row → cartesian
-- blowup, statement timeout. Pre-expand every fetched body's entities ONCE via
-- jsonb_each into (qid, entity), then extract parents with STATIC jsonpaths.

create or replace function public.run_tag_wikidata_hierarchy(p_chunk int default 45)
returns table (edges_inserted int, candidates int, skipped_cycle int, ambiguous_parents int, api_errors int)
language plpgsql security definer set search_path = public as $$
declare
  v_inserted int := 0; v_cyc int := 0; v_ambig int := 0; v_apierr int := 0; v_cand int := 0;
  r record;
begin
  perform public.assert_admin_or_internal();
  set local statement_timeout = '240s';
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '10');
  perform extensions.http_set_curlopt('CURLOPT_USERAGENT', 'QueerGuide/1.0 (https://queer.guide; contact@queer.guide)');

  create temp table _map on commit drop as
    select wikidata_id as qid, (array_agg(id order by id))[1] as tag_id, count(*) as c
    from public.unified_tags
    where status = 'active' and wikidata_id ~ '^Q[0-9]+$'
    group by wikidata_id;
  select count(*) into v_ambig from _map where c > 1;
  delete from _map where c > 1;

  create temp table _fetch on commit drop as
    with ids as (select qid, (row_number() over (order by qid) - 1) as rn from _map),
    grp as (
      select rn / greatest(p_chunk,1) as g, string_agg(qid, '|' order by qid) as ids
      from ids group by rn / greatest(p_chunk,1)
    )
    select g.g,
      (extensions.http_get(
        'https://www.wikidata.org/w/api.php?action=wbgetentities&ids=' || g.ids
        || '&props=claims&format=json')).content as raw
    from grp g;
  select count(*) into v_apierr from _fetch where raw is null or left(raw,1) <> '{';

  -- parse each body exactly once → (qid, entity jsonb)
  create temp table _ent on commit drop as
    select e.key as qid, e.value as entity
    from _fetch f
    cross join lateral jsonb_each((f.raw::jsonb) -> 'entities') e
    where f.raw is not null and left(f.raw,1) = '{';
  create index on _ent (qid);

  create temp table _cand on commit drop as
    select child_tag, parent_tag, max(conf) as conf
    from (
      select cm.tag_id as child_tag, pm.tag_id as parent_tag,
             case when x.prop = 'P279' then 0.95 else 0.85 end as conf
      from _ent e
      join _map cm on cm.qid = e.qid
      cross join lateral (
        select 'P279' as prop, jsonb_path_query(e.entity, '$.claims.P279[*].mainsnak.datavalue.value') as v
        union all
        select 'P361',          jsonb_path_query(e.entity, '$.claims.P361[*].mainsnak.datavalue.value')
      ) x
      join _map pm on pm.qid = (x.v ->> 'id')
      where pm.tag_id <> cm.tag_id
    ) s
    group by child_tag, parent_tag;
  select count(*) into v_cand from _cand;

  for r in select child_tag, parent_tag, conf from _cand loop
    begin
      insert into public.tag_relations (source_tag_id, target_tag_id, relation_type, confidence, review_status)
      values (r.child_tag, r.parent_tag, 'broader', r.conf, 'auto')
      on conflict (source_tag_id, target_tag_id, relation_type) do nothing;
      if found then v_inserted := v_inserted + 1; end if;
    exception when others then
      v_cyc := v_cyc + 1;
    end;
  end loop;

  return query select v_inserted, v_cand, v_cyc, v_ambig, v_apierr;
end $$;
