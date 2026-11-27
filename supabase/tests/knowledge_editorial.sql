-- Run on an isolated fixture database; transaction rolls all fixtures back.
BEGIN;
INSERT INTO public.unified_tags(id,name,slug,description,long_description,category) VALUES('10000000-0000-0000-0000-000000000001','Test term','test-term','Old summary','Old body','Culture');
INSERT INTO public.unified_tags(id,name,slug,description,long_description,category) VALUES('10000000-0000-0000-0000-000000000002','Health term','health-term','Old summary','Old body','Health');
INSERT INTO public.knowledge_editorial_batches(id,name,manifest,frozen_at) VALUES('20000000-0000-0000-0000-000000000001','Test pilot','[]',NULL);
INSERT INTO public.knowledge_editorial_entries(id,batch_id,entity_type,entity_id,name,slug,pilot_group,reader_question,format)
 VALUES('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','unified_tags','10000000-0000-0000-0000-000000000001','Test term','test-term','culture','What does it mean?','explainer'),
 ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','unified_tags','10000000-0000-0000-0000-000000000002','Health term','health-term','health','What does it mean?','guide');
UPDATE public.knowledge_editorial_batches SET frozen_at=now() WHERE id='20000000-0000-0000-0000-000000000001';
SELECT set_config('request.jwt.claim.role','anon',true);
DO $$ BEGIN
 BEGIN PERFORM public.knowledge_editorial_action('create','30000000-0000-0000-0000-000000000001'); RAISE EXCEPTION 'anonymous mutation allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claim.admin','true',true),set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',true);
SELECT public.knowledge_editorial_action('create','30000000-0000-0000-0000-000000000001');
SELECT public.knowledge_editorial_action('create','30000000-0000-0000-0000-000000000001');
DO $$ DECLARE p public.knowledge_editorial_proposals; BEGIN
 IF (SELECT count(*) FROM public.knowledge_editorial_proposals)<>1 THEN RAISE EXCEPTION 'creation not idempotent'; END IF;
 SELECT * INTO p FROM public.knowledge_editorial_proposals LIMIT 1;
 BEGIN PERFORM public.knowledge_editorial_action('save',p.id,jsonb_build_object('expected_updated_at',p.updated_at,'patch','{"visibility":"public"}'::jsonb,'sources','[]'::jsonb)); RAISE EXCEPTION 'unsupported field accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'unsupported editorial field' THEN RAISE; END IF; END;
 PERFORM public.knowledge_editorial_action('save',p.id,jsonb_build_object('expected_updated_at',p.updated_at,'patch','{"description":"New summary","long_description":"New body"}'::jsonb,'sources','[{"id":"a","url":"https://glaad.org/reference/terms/","title":"Terms","publisher":"GLAAD","supports":"Definition"},{"id":"b","url":"https://www.nps.gov/","title":"History","publisher":"NPS","supports":"Context"}]'::jsonb));
 IF (SELECT description FROM public.unified_tags WHERE slug='test-term')<>'Old summary' THEN RAISE EXCEPTION 'draft leaked'; END IF;
 IF public.knowledge_public_editorial('unified_tags',ARRAY['10000000-0000-0000-0000-000000000001'::uuid])<>'[]'::jsonb THEN RAISE EXCEPTION 'draft evidence leaked'; END IF;
 SELECT * INTO p FROM public.knowledge_editorial_proposals WHERE id=p.id;
 BEGIN PERFORM public.knowledge_editorial_action('approve',p.id); RAISE EXCEPTION 'unchecked approval allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'evidence or editorial checks incomplete' THEN RAISE; END IF; END;
 BEGIN PERFORM public.knowledge_editorial_action('checks',p.id,'{}'); RAISE EXCEPTION 'browser forged validation'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
-- Background writers cannot bypass the managed prose guard, including service_role.
SELECT set_config('request.jwt.claim.role','service_role',true),set_config('request.jwt.claim.sub','',true);
DO $$ BEGIN
 BEGIN UPDATE public.unified_tags SET description='Legacy overwrite' WHERE slug='test-term'; RAISE EXCEPTION 'legacy overwrite allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
DO $$ DECLARE p public.knowledge_editorial_proposals; BEGIN
 SELECT * INTO p FROM public.knowledge_editorial_proposals LIMIT 1;
 PERFORM public.knowledge_editorial_action('checks',p.id,jsonb_build_object('content_hash',api_private.knowledge_hash(jsonb_build_object('patch',p.patch,'sources',p.sources)),'checks','{"sources_retrieved":true,"subject_match":true,"claims_supported":true,"no_unsupported_additions":true,"valid_markup":true,"no_internal_language":true,"independent_sources":true,"sensitive_claims":false}'::jsonb,'rubric','{"clarity":4,"specificity":4,"usefulness":4,"nuance":4,"structure":4}'::jsonb));
 BEGIN PERFORM public.knowledge_editorial_action('publish_auto',p.id); RAISE EXCEPTION 'pilot auto-published'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'automatic publication ineligible' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',true);
DO $$ DECLARE p public.knowledge_editorial_proposals; BEGIN
 SELECT * INTO p FROM public.knowledge_editorial_proposals LIMIT 1;
 PERFORM public.knowledge_editorial_action('approve',p.id);
 PERFORM public.knowledge_editorial_action('publish',p.id);
 IF (SELECT description FROM public.unified_tags WHERE slug='test-term')<>'New summary' THEN RAISE EXCEPTION 'publication not applied'; END IF;
 IF jsonb_array_length(public.knowledge_public_editorial('unified_tags',ARRAY['10000000-0000-0000-0000-000000000001'::uuid]))<>1 THEN RAISE EXCEPTION 'published evidence absent'; END IF;
 PERFORM public.knowledge_editorial_action('rollback',p.id);
 IF (SELECT description FROM public.unified_tags WHERE slug='test-term')<>'Old summary' THEN RAISE EXCEPTION 'rollback failed'; END IF;
 IF (SELECT automatic_enabled FROM public.knowledge_editorial_batches LIMIT 1) THEN RAISE EXCEPTION 'rollback did not pause'; END IF;
END $$;
-- Human changes invalidate pending proposals without blocking editing.
SELECT public.knowledge_editorial_action('create','30000000-0000-0000-0000-000000000002');
UPDATE public.unified_tags SET description='Human correction' WHERE slug='health-term';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.knowledge_editorial_proposals WHERE entry_id='30000000-0000-0000-0000-000000000002' AND status<>'superseded') THEN RAISE EXCEPTION 'human edit did not invalidate'; END IF; END $$;
-- Fixture role switch verifies row isolation as an actual application role.
SET LOCAL ROLE anon;
DO $$ BEGIN BEGIN PERFORM count(*) FROM public.knowledge_editorial_proposals; RAISE EXCEPTION 'anonymous draft access'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
RESET ROLE;

-- Specialist approval and stale evidence are independently enforced.
SELECT public.knowledge_editorial_action('create','30000000-0000-0000-0000-000000000002');
DO $$ DECLARE p public.knowledge_editorial_proposals; payload jsonb; BEGIN
 SELECT * INTO p FROM public.knowledge_editorial_proposals WHERE entry_id='30000000-0000-0000-0000-000000000002' AND status='research';
 payload:=jsonb_build_object('expected_updated_at',p.updated_at,'patch','{"description":"Reviewed health summary","long_description":"Reviewed health body"}'::jsonb,'sources','[{"id":"a","url":"https://transcare.ucsf.edu/","title":"Guidance","publisher":"UCSF","supports":"Context"},{"id":"b","url":"https://www.nhs.uk/","title":"Guidance","publisher":"NHS","supports":"Context"}]'::jsonb);
 PERFORM public.knowledge_editorial_action('save',p.id,payload);
 SELECT * INTO p FROM public.knowledge_editorial_proposals WHERE id=p.id;
 PERFORM set_config('request.jwt.claim.role','service_role',true); PERFORM set_config('request.jwt.claim.sub','',true);
 PERFORM public.knowledge_editorial_action('checks',p.id,jsonb_build_object('content_hash',api_private.knowledge_hash(jsonb_build_object('patch',p.patch,'sources',p.sources)),'checks','{"sources_retrieved":true,"subject_match":true,"claims_supported":true,"no_unsupported_additions":true,"valid_markup":true,"no_internal_language":true,"independent_sources":true,"sensitive_claims":true}'::jsonb,'rubric','{"clarity":4,"specificity":4,"usefulness":4,"nuance":4,"structure":4}'::jsonb));
 PERFORM set_config('request.jwt.claim.role','authenticated',true); PERFORM set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',true);
 BEGIN PERFORM public.knowledge_editorial_action('approve',p.id); RAISE EXCEPTION 'specialist gate bypassed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'named specialist and explicit review attestation required' THEN RAISE; END IF; END;
 UPDATE public.knowledge_editorial_proposals SET checked_at=now()-interval '8 days' WHERE id=p.id;
 BEGIN PERFORM public.knowledge_editorial_action('approve',p.id,'{"specialist_name":"Fixture reviewer","specialist_qualification":"Test-only clinician","specialist_attested":true}'); RAISE EXCEPTION 'expired evidence approved'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'evidence or editorial checks incomplete' THEN RAISE; END IF; END;
END $$;
-- Frozen identity and membership cannot drift, even through an accidental operator write.
DO $$ BEGIN
 BEGIN UPDATE public.knowledge_editorial_entries SET entity_id=gen_random_uuid() WHERE id='30000000-0000-0000-0000-000000000001'; RAISE EXCEPTION 'identity changed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'frozen entity identity is immutable' THEN RAISE; END IF; END;
 BEGIN DELETE FROM public.knowledge_editorial_entries WHERE id='30000000-0000-0000-0000-000000000001'; RAISE EXCEPTION 'membership removed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'cannot remove from a frozen manifest' THEN RAISE; END IF; END;
END $$;
-- Ordinary authenticated users cannot see draft rows under RLS.
SELECT set_config('request.jwt.claim.admin','false',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM public.knowledge_editorial_proposals)<>0 THEN RAISE EXCEPTION 'non-reviewer draft access'; END IF; END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.admin','true',true);

SELECT 'knowledge editorial integration tests passed' AS result;
ROLLBACK;
