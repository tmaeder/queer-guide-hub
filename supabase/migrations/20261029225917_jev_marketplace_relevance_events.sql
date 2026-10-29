-- Unsettled admission is explicit null, not a negative factual classification.
-- Its native positive-Boolean commit prerequisite remains unsatisfied even if a
-- later generic confidence gate changes review_status. Jev usage has its own
-- event stage and durable dollar cap; never charge it to the legacy CF unit cap.
do $$
declare definition text;anchor text;replacement text;
begin
 definition:=pg_get_functiondef('public.record_marketplace_relevance(uuid,timestamp with time zone,jsonb,text)'::regprocedure);
 anchor:=$old$jsonb_typeof(p_classification->'lgbti_relevant') is distinct from 'boolean'$old$;
 replacement:=$new$coalesce(jsonb_typeof(p_classification->'lgbti_relevant'),'missing') not in ('boolean',case when p_decision='review' then 'null' else 'boolean' end)$new$;
 if position(replacement in definition)=0 then
  if position(anchor in definition)=0 then raise exception 'Relevance null-validation anchor changed';end if;
  definition:=replace(definition,anchor,replacement);
 end if;
 anchor:=$old$case when p_decision='trust' then 'relevance_trust' else 'relevance' end$old$;
 replacement:=$new$case when p_decision='trust' then 'relevance_trust' when p_classification->>'classifier'='jev-product-relevance-v1' then 'relevance_jev' else 'relevance' end$new$;
 if position(replacement in definition)=0 then
  if position(anchor in definition)=0 then raise exception 'Jev relevance event-stage anchor changed';end if;
  definition:=replace(definition,anchor,replacement);
 end if;
 execute definition;
end $$;
