\set ON_ERROR_STOP on
begin;
do $test$
declare stage uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); legacy uuid:=gen_random_uuid(); r jsonb;
begin
 insert into ingestion_staging(id,review_status,disposition) values(stage,'pending_review','pending'),(other,'pending_review','pending'),(legacy,'approved','pending');
 insert into review_queue(entity_type,entity_id,review_type,details,status) values
 ('ingestion_staging',stage,'awaiting_llm_verdict','{"source":"pipeline-review-gate"}','pending'),
 ('ingestion_staging',stage,'merge_candidate','{"source":"pipeline-review-gate"}','pending'),
 ('ingestion_staging',stage,'force_review','{"source":"pipeline-review-gate"}','pending'),
 ('ingestion_staging',stage,'llm_needs_review','{"source":"pipeline-review-gate","hard_blocker":true}','pending'),
 ('ingestion_staging',stage,'low_confidence','{"source":"manual"}','pending'),
 ('ingestion_staging',stage,'low_confidence','{"source":"pipeline-review-gate","requires_confirm":true}','pending'),
 ('ingestion_staging',stage,'low_confidence','{"source":"pipeline-review-gate","force_review":true}','pending'),
 ('ingestion_staging',other,'awaiting_llm_verdict','{"source":"pipeline-review-gate"}','pending'),
 ('ingestion_staging',legacy,'awaiting_llm_verdict','{"source":"pipeline-review-gate"}','pending');
 r:=reconcile_staging_gate_reviews(null,500,true);
 if (r->>'reviews_reconciled')::int<>1 or exists(select 1 from review_queue where status<>'pending') then raise exception 'dry run %',r; end if;
 update ingestion_staging set review_status='approved' where id=stage;
 if (select count(*) from review_queue where entity_id=stage and status='resolved')<>1 then raise exception 'approval hook'; end if;
 if (select count(*) from review_queue where entity_id=stage and status='pending')<>6 then raise exception 'manual/merge/safety changed'; end if;
 if not exists(select 1 from review_queue where entity_id=stage and status='resolved' and resolved_at is not null and details#>>'{native_gate_resolution,previous_status}'='pending') then raise exception 'outcome audit'; end if;
 update ingestion_staging set review_status='rejected',disposition='rejected' where id=other;
 if not exists(select 1 from review_queue where entity_id=other and status='rejected') then raise exception 'rejection hook'; end if;
 r:=reconcile_staging_gate_reviews(null,500,false);
 if (r->>'reviews_reconciled')::int<>1 then raise exception 'legacy reconciliation %',r; end if;
 r:=reconcile_staging_gate_reviews(null,500,false);
 if (r->>'reviews_reconciled')::int<>0 then raise exception 'idempotency %',r; end if;
 if not exists(select 1 from ingestion_staging where id=stage and review_status='approved' and disposition='pending') then raise exception 'native state changed'; end if;
 raise notice 'staging gate outcome fixtures passed';
end $test$;
rollback;
