-- The tags DAG was the only enabled ingestion DAG without a review gate.
-- Preserve existing node configuration and edge metadata; only split its direct
-- dedupe -> commit edge. This does not authorize private tag data for Jev.
do $$
declare p record;rewired jsonb;
begin
 select id,nodes,edges into p from public.pipeline_definitions where name='tags-ingestion' for update;
 if not found then return;end if;
 if exists(select 1 from jsonb_array_elements(p.nodes) n where n->>'type'='pipeline-review-gate') then return;end if;
 if exists(select 1 from jsonb_array_elements(p.nodes) n where n->>'id'='jev-review-gate')
 or not exists(select 1 from jsonb_array_elements(p.edges) e where e->>'source'='dedupe' and e->>'target'='commit') then
  raise exception 'Unexpected tags DAG topology; inspect before adding review gate';end if;
 select jsonb_agg(case when e->>'source'='dedupe' and e->>'target'='commit'
  then jsonb_set(e,'{target}','"jev-review-gate"'::jsonb) else e end order by ordinal)
 into rewired from jsonb_array_elements(p.edges) with ordinality as edge(e,ordinal);
 update public.pipeline_definitions set
  nodes=p.nodes||jsonb_build_array(jsonb_build_object('id','jev-review-gate','type','pipeline-review-gate',
   'position',jsonb_build_object('x',1000,'y',240),
   'data',jsonb_build_object('label','Review gate','config',jsonb_build_object('entityType','tag','batch_size',500)))),
  edges=rewired||jsonb_build_array(jsonb_build_object('id','e-jev-review-commit','source','jev-review-gate','target','commit')),
  updated_at=now()
 where id=p.id;
end $$;
