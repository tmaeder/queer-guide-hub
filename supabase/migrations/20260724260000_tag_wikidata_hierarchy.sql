-- P2 Task 2 — Wikidata P279/P361 broader-hierarchy proposer, PURE SQL.
-- Uses the synchronous `http` extension (edge-function deploy was unavailable;
-- this is simpler, matches the Truth-Engine pure-SQL pattern, and needs no
-- Docker/CLI). For every active tag anchored by a bare-QID wikidata_id, fetch
-- its Wikidata claims (batched wbgetentities, 45 QIDs/call) and walk P279
-- (subclass of, conf 0.95) + P361 (part of, conf 0.85); when a parent QID ALSO
-- resolves to one of our tags, insert a `broader` child->parent edge.
--
-- Safety: `broader` is one of only two insertable relation_type values and is
-- protected by trg_tag_relations_no_cycle, so a bad edge is rejected per-row
-- (counted skipped_cycle), never corrupting the DAG. Ambiguity guard: a QID
-- mapping to >1 of our tags (our own dup tags sharing a QID) is NEVER used as a
-- parent. Idempotent: re-run only inserts missing edges (unique key).

create extension if not exists http with schema extensions;

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

  -- unambiguous QID -> tag_id map (drop QIDs shared by >1 of our tags)
  create temp table _map on commit drop as
    select wikidata_id as qid, min(id) as tag_id, count(*) as c
    from public.unified_tags
    where status = 'active' and wikidata_id ~ '^Q[0-9]+$'
    group by wikidata_id;
  select count(*) into v_ambig from _map where c > 1;
  delete from _map where c > 1;

  -- fetch claims in chunks of p_chunk QIDs, one http_get per chunk
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

  -- extract candidate broader edges (parent must resolve to another of our tags)
  create temp table _cand on commit drop as
    select child_tag, parent_tag, max(conf) as conf
    from (
      select m.tag_id as child_tag, pm.tag_id as parent_tag,
             case when x.prop = 'P279' then 0.95 else 0.85 end as conf
      from _map m
      join _fetch f on f.raw is not null and left(f.raw,1) = '{'
        and (f.raw::jsonb -> 'entities') ? m.qid
      cross join lateral (
        select 'P279' as prop,
               jsonb_path_query(f.raw::jsonb,
                 ('$.entities.' || m.qid || '.claims.P279[*].mainsnak.datavalue.value')::jsonpath) as v
        union all
        select 'P361',
               jsonb_path_query(f.raw::jsonb,
                 ('$.entities.' || m.qid || '.claims.P361[*].mainsnak.datavalue.value')::jsonpath)
      ) x
      join _map pm on pm.qid = (x.v ->> 'id')
      where pm.tag_id <> m.tag_id
    ) s
    group by child_tag, parent_tag;
  select count(*) into v_cand from _cand;

  -- insert with per-row exception handling (cycle guard raises -> skip that edge)
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

revoke all on function public.run_tag_wikidata_hierarchy(int) from public;
grant execute on function public.run_tag_wikidata_hierarchy(int) to service_role;

-- weekly rebuild (pure SQL). Register in admin_automations + pg_cron.
insert into public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
values ('tag_wikidata_hierarchy','Tag Wikidata hierarchy',
        'Weekly: pulls Wikidata P279/P361 chains for anchored tags -> auto `broader` edges in tag_relations (pure SQL, http ext).',
        'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
        '{"type":"rpc","fn":"run_tag_wikidata_hierarchy"}'::jsonb, '0 5 * * 1')
on conflict (slug) do update set schedule=excluded.schedule, enabled=excluded.enabled,
  description=excluded.description, name=excluded.name, action=excluded.action, trigger=excluded.trigger;

select cron.schedule('tag_wikidata_hierarchy', '0 5 * * 1',
  $cron$ select public.run_tag_wikidata_hierarchy(); $cron$);
