-- Internal integration regression; synthetic events, claims and audits roll back.
begin;
do $test$
declare old_id uuid:=gen_random_uuid(); next_id uuid:=gen_random_uuid();
 human_id uuid:=gen_random_uuid(); foreign_id uuid:=gen_random_uuid(); token uuid:=gen_random_uuid();
 ids uuid[]; claimed uuid[]; result jsonb; old_row jsonb; v public.venues;
begin
 ids:=array[old_id,next_id,human_id,foreign_id];
 select * into strict v from public.venues where duplicate_of_id is null
  and city_id is not null and country_id is not null order by id limit 1;
 insert into public.events(id,title,event_type,start_date,slug,is_public,city_id,country_id,status,data_source,images,field_provenance)
 select id,'Artwork scope regression '||id,'social',
  case when id=next_id then now()+interval '2 days' else '2020-01-01'::timestamptz end,
  'artwork-scope-'||id,false,v.city_id,v.country_id,
  case when id=next_id then 'active' else 'completed' end,
  case when id=foreign_id then 'agendaq' else 'gay-ch' end,
  array['https://gay.ch/parties/review-regression-'||id||'/@@images/thumbnail.jpeg'],
  case when id=human_id then '{"images":{"source":"human"}}'::jsonb else '{}'::jsonb end
 from unnest(ids) id;
 insert into public.event_sources(event_id,source_slug,source_entity_id,source_url)
 select id,'gay-ch','review-regression-'||id,'https://gay.ch/parties/review-regression-'||id from unnest(ids) id;
 insert into public.event_quality_issues(event_id,dimension,issue_code,detector,severity,evidence,evidence_hash)
 select id,'media','IMAGE_LOW_RESOLUTION','scope-regression','high','{}',id::text from unnest(ids) id;
 select array_agg(event_id) into claimed from public.claim_event_gaps('image',token,40,ids,true);
 if cardinality(claimed)<>2 or not(claimed @> array[old_id,next_id]) then
  raise exception 'Wrong historical image eligibility: %',claimed;end if;
 if exists(select from public.event_gap_queue where event_id=any(ids)) then raise exception 'Dry run created queue rows';end if;
 if (select event_id from public.claim_event_gaps('image',token,1,ids,true)) is distinct from next_id then
  raise exception 'Historical artwork displaced upcoming work';end if;
 if exists(select from public.claim_event_gaps('content',token,40,array[old_id,human_id,foreign_id],true)) then
  raise exception 'Historical content lane expanded';end if;
 perform public.claim_event_gaps('image',token,1,array[old_id],false);
 select to_jsonb(e) into old_row from public.events e where id=old_id;
 result:=public.finish_event_gap(old_id,'image',token,
  jsonb_build_object('images',jsonb_build_array('https://gay.ch/parties/review-regression-'||old_id||'/@@download/image/original.jpg')),
  jsonb_build_object('source_url','https://gay.ch/parties/review-regression-'||old_id,
   'confidence',1,'previous_images',old_row->'images'),'updated','{"method":"synthetic_regression"}');
 if result->>'outcome'<>'updated' then raise exception 'Historical image finish failed: %',result;end if;
 if (old_row-array['images','field_provenance','updated_at']) is distinct from
  (select to_jsonb(e)-array['images','field_provenance','updated_at'] from public.events e where id=old_id) then
  raise exception 'Image finish changed unrelated event fields';end if;
 -- Revalidate protection after the lease was taken.
 update public.events set field_provenance='{}',images=array['https://gay.ch/parties/review-regression-'||old_id||'/@@images/thumbnail.jpeg'] where id=old_id;
 update public.event_gap_queue set next_attempt_at=now() where event_id=old_id and lane='image';
 perform public.claim_event_gaps('image',token,1,array[old_id],false);
 update public.events set field_provenance='{"images":{"source":"human"}}' where id=old_id;
 result:=public.finish_event_gap(old_id,'image',token,'{}','{}','no_change','{}');
 if result->>'outcome'<>'ineligible' then raise exception 'Finish did not recheck human provenance';end if;
 update public.events set field_provenance='{}' where id=old_id;
 update public.event_gap_queue set next_attempt_at=now() where event_id=old_id and lane='image';
 perform public.claim_event_gaps('image',token,1,array[old_id],false);
 update public.events set data_source=null where id=old_id;
 result:=public.finish_event_gap(old_id,'image',token,'{}','{}','no_change','{}');
 if result->>'outcome'<>'ineligible' then raise exception 'NULL source passed finish eligibility';end if;
end $test$;
select 'Historical image eligibility, upcoming priority, content/human/source exclusions, dry run, finish and preservation passed' result;
rollback;
