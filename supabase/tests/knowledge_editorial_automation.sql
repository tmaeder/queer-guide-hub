-- Exercise accepted-pilot automation, approved-copy replacement and daily cap.
-- Reviewer identities below are synthetic fixtures, never production attestations.
BEGIN;
INSERT INTO public.knowledge_editorial_batches(id,name) VALUES('50000000-0000-0000-0000-000000000001','Automatic publication fixture');
DO $$ DECLARE n integer; entity uuid; BEGIN
 FOR n IN 1..6 LOOP
  entity:=('60000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
  INSERT INTO public.unified_tags(id,name,slug,description,long_description,category) VALUES(entity,'Routine fixture '||n,'routine-'||n,'Old summary','Old body','Culture');
  INSERT INTO public.knowledge_editorial_entries(id,batch_id,entity_type,entity_id,name,slug,pilot_group,reader_question,format)
   VALUES(entity,'50000000-0000-0000-0000-000000000001','unified_tags',entity,'Routine fixture '||n,'routine-'||n,'culture','What does it mean?','explainer');
 END LOOP;
END $$;
-- The fixture represents an already accepted pilot; acceptance itself is tested separately.
UPDATE public.knowledge_editorial_batches SET frozen_at=now(),accepted_at=now(),automatic_enabled=true WHERE id='50000000-0000-0000-0000-000000000001';
SELECT set_config('request.jwt.claim.admin','true',true);
DO $$ DECLARE n integer; entity uuid; p public.knowledge_editorial_proposals; q jsonb; old_human uuid;
 checks jsonb:='{"sources_retrieved":true,"subject_match":true,"claims_supported":true,"no_unsupported_additions":true,"valid_markup":true,"no_internal_language":true,"independent_sources":true,"sensitive_claims":false}';
 rubric jsonb:='{"clarity":4,"specificity":4,"usefulness":4,"nuance":4,"structure":4}';
 sources jsonb:='[{"id":"a","url":"https://glaad.org/reference/terms/","title":"Terms","publisher":"GLAAD","supports":"Definition"},{"id":"b","url":"https://www.nps.gov/","title":"History","publisher":"NPS","supports":"Context"}]';
BEGIN
 FOR n IN 1..6 LOOP
  entity:=('60000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
  PERFORM set_config('request.jwt.claim.role','authenticated',true);PERFORM set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',true);
  q:=public.knowledge_editorial_action('create',entity);
  SELECT * INTO p FROM public.knowledge_editorial_proposals WHERE id=(q->>'id')::uuid;
  PERFORM public.knowledge_editorial_action('save',p.id,jsonb_build_object('expected_updated_at',p.updated_at,'patch',jsonb_build_object('description','Improved summary '||n,'long_description','Improved body '||n),'sources',sources));
  SELECT * INTO p FROM public.knowledge_editorial_proposals WHERE id=p.id;
  PERFORM set_config('request.jwt.claim.role','service_role',true);PERFORM set_config('request.jwt.claim.sub','',true);
  PERFORM public.knowledge_editorial_action('checks',p.id,jsonb_build_object('content_hash',api_private.knowledge_hash(jsonb_build_object('patch',p.patch,'sources',p.sources)),'checks',checks,'rubric',rubric));
  IF n=1 THEN
   PERFORM set_config('request.jwt.claim.role','authenticated',true);PERFORM set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',true);
   PERFORM public.knowledge_editorial_action('approve',p.id); PERFORM public.knowledge_editorial_action('publish',p.id);old_human:=p.id;
   q:=public.knowledge_editorial_action('create',entity);
   SELECT * INTO p FROM public.knowledge_editorial_proposals WHERE id=(q->>'id')::uuid;
   PERFORM public.knowledge_editorial_action('save',p.id,jsonb_build_object('expected_updated_at',p.updated_at,'patch','{"description":"Checked replacement of approved prose","long_description":"Checked replacement body"}'::jsonb,'sources',sources));
   SELECT * INTO p FROM public.knowledge_editorial_proposals WHERE id=p.id;
   PERFORM set_config('request.jwt.claim.role','service_role',true);PERFORM set_config('request.jwt.claim.sub','',true);
   PERFORM public.knowledge_editorial_action('checks',p.id,jsonb_build_object('content_hash',api_private.knowledge_hash(jsonb_build_object('patch',p.patch,'sources',p.sources)),'checks',checks,'rubric',rubric));
  END IF;
  IF n<=5 THEN PERFORM public.knowledge_editorial_action('publish_auto',p.id);
  ELSE
   BEGIN PERFORM public.knowledge_editorial_action('publish_auto',p.id);RAISE EXCEPTION 'sixth automatic publication allowed';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'automatic daily limit reached' THEN RAISE;END IF;END;
  END IF;
 END LOOP;
 IF (SELECT count(*) FROM public.knowledge_editorial_events WHERE batch_id='50000000-0000-0000-0000-000000000001' AND action='publish_auto')<>5 THEN RAISE EXCEPTION 'daily count incorrect';END IF;
 IF (SELECT status FROM public.knowledge_editorial_proposals WHERE id=old_human)<>'superseded' THEN RAISE EXCEPTION 'approved revision not retained as superseded';END IF;
 SELECT * INTO p FROM public.knowledge_editorial_proposals WHERE entry_id='60000000-0000-0000-0000-000000000001' AND status='published';
 PERFORM set_config('request.jwt.claim.role','authenticated',true);PERFORM set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',true);
 PERFORM public.knowledge_editorial_action('rollback',p.id);
 IF (SELECT description FROM public.unified_tags WHERE id='60000000-0000-0000-0000-000000000001')<>'Improved summary 1' THEN RAISE EXCEPTION 'approved copy not restored';END IF;
 IF (SELECT status FROM public.knowledge_editorial_proposals WHERE id=old_human)<>'published' THEN RAISE EXCEPTION 'approved references not restored';END IF;
END $$;
SELECT 'approved replacement, daily cap and rollback passed' AS result;
ROLLBACK;
