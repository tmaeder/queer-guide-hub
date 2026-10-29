-- Record one validated classification and its event atomically, only against
-- the unchanged pending source version. Negative is distinct from uncertain.
create function public.record_marketplace_relevance(p_staging_id uuid,p_expected_updated_at timestamptz,p_classification jsonb,p_decision text)
returns boolean language plpgsql security definer set search_path='' as $$
declare changed uuid;score numeric;
begin
 if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role',current_user) not in ('service_role','postgres') then
  raise exception 'Service actor required' using errcode='42501';end if;
 if p_decision is null or p_decision not in ('approve','reject','review','trust') or p_classification is null
  or jsonb_typeof(p_classification) is distinct from 'object' or octet_length(p_classification::text)>16384
  or jsonb_typeof(p_classification->'lgbti_relevant') is distinct from 'boolean'
  or jsonb_typeof(p_classification->'lgbti_relevance_score') is distinct from 'number'
  then raise exception 'Invalid relevance result';end if;
 score:=(p_classification->>'lgbti_relevance_score')::numeric;
 if score<0 or score>1 then raise exception 'Invalid relevance probability';end if;
 if (p_decision in ('approve','trust') and p_classification->'lgbti_relevant'<>'true'::jsonb)
 or (p_decision='reject' and p_classification->'lgbti_relevant'<>'false'::jsonb) then raise exception 'Relevance direction conflicts with action';end if;
 update public.ingestion_staging set classification_result=p_classification,ai_confidence_score=score,
  disposition=case when p_decision='reject' then 'rejected' else disposition end,
  review_status=case when p_decision='review' then 'pending_review' else review_status end,
  error_message=case when p_decision='reject' then 'relevance_negative' when p_decision='review' then 'relevance_needs_review' else error_message end,
  updated_at=now()
 where id=p_staging_id and updated_at=p_expected_updated_at and target_table='marketplace_listings'
  and disposition='pending' and classification_result is null
 returning id into changed;
 if changed is null then return false;end if;
 insert into public.ingestion_events(staging_id,stage,new_status,actor,payload)
 values(changed,case when p_decision='trust' then 'relevance_trust' else 'relevance' end,
  case when p_decision in ('approve','trust') then 'approved' when p_decision='reject' then 'rejected' else 'pending_review' end,
  'marketplace-relevance',p_classification);
 return true;
end $$;
revoke all on function public.record_marketplace_relevance(uuid,timestamptz,jsonb,text) from public,anon,authenticated;
grant execute on function public.record_marketplace_relevance(uuid,timestamptz,jsonb,text) to service_role;

-- All callers, including SQL drains and aliases, need an explicit positive
-- typed classification at commit. A confidence score or nonempty object alone
-- is insufficient. Existing published records are not changed by this guard.
do $$
declare definition text;anchor text;
begin
 definition:=pg_get_functiondef('public.commit_marketplace_staging_batch(integer,uuid)'::regprocedure);
 anchor:='AND s.classification_result IS NOT NULL';
 if position($check$AND s.classification_result @> '{"lgbti_relevant":true}'::jsonb$check$ in definition)=0 then
  if position(anchor in definition)=0 then raise exception 'Marketplace commit classification anchor changed';end if;
  execute replace(definition,anchor,anchor||$new$
       AND s.classification_result @> '{"lgbti_relevant":true}'::jsonb$new$);
 end if;
 definition:=pg_get_functiondef('public.run_marketplace_commit_drain(integer)'::regprocedure);
 anchor:='and s.classification_result is not null';
 if position($check$and s.classification_result @> '{"lgbti_relevant":true}'::jsonb$check$ in definition)=0 then
  if position(anchor in definition)=0 then raise exception 'Marketplace drain classification anchor changed';end if;
  execute replace(definition,anchor,anchor||$new$ and s.classification_result @> '{"lgbti_relevant":true}'::jsonb$new$);
 end if;
end $$;
