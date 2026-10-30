BEGIN;
DO $test$
DECLARE gid uuid:=gen_random_uuid(); pid uuid:=gen_random_uuid();
BEGIN
 INSERT INTO public.guides(id,title,slug,format,status,intro_md,selection_method)
 VALUES(gid,'Guide quality regression','guide-quality-regression-'||gid,'guide','draft',repeat('Useful factual introduction. ',5),repeat('Primary-source research with stated limits. ',3));
 BEGIN
  UPDATE public.guides SET status='published' WHERE id=gid;
  RAISE EXCEPTION 'EMPTY GUIDE WAS PUBLISHED';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 INSERT INTO public.guide_picks(id,guide_id,entity_type,entity_id,tier,rationale_md,source_urls,verified_at)
 VALUES(pid,gid,'venue','804ca587-74eb-4533-9e85-4190ff4362e4','top',repeat('Documented suitability and limitations. ',3),ARRAY['https://de.boiler-berlin.com/'],now());
 UPDATE public.guides SET last_verified_at=now(),status='published' WHERE id=gid;
 IF (SELECT workflow_state::text FROM public.cms_content_metadata WHERE source_table='guides' AND source_id=gid) <> 'published' THEN RAISE EXCEPTION 'STATUS SYNC FAILED'; END IF;
 UPDATE public.guide_picks SET rationale_md=rationale_md||' Editorial correction.' WHERE id=pid;
 IF (SELECT status FROM public.guides WHERE id=gid) <> 'review' THEN RAISE EXCEPTION 'PICK INVALIDATION FAILED'; END IF;
 BEGIN
  UPDATE public.guides SET status='published' WHERE id=gid;
  RAISE EXCEPTION 'UNVERIFIED CHANGE WAS PUBLISHED';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 UPDATE public.guides SET last_verified_at=now(),status='published' WHERE id=gid;
 UPDATE public.cms_content_metadata SET workflow_state='draft' WHERE source_table='guides' AND source_id=gid;
 IF (SELECT status FROM public.guides WHERE id=gid) <> 'draft' THEN RAISE EXCEPTION 'WORKFLOW UNPUBLISH FAILED'; END IF;
 UPDATE public.guide_picks SET source_urls=ARRAY['javascript:alert(1)'] WHERE id=pid;
 BEGIN
  UPDATE public.guides SET last_verified_at=now(),status='published' WHERE id=gid;
  RAISE EXCEPTION 'UNSAFE SOURCE WAS PUBLISHED';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 UPDATE public.guide_picks SET source_urls=ARRAY['https://de.boiler-berlin.com/'] WHERE id=pid;
 UPDATE public.guides SET last_verified_at=now(),status='published' WHERE id=gid;
 UPDATE public.cms_content_metadata SET visibility_level='private' WHERE source_table='guides' AND source_id=gid;
 IF (SELECT status FROM public.guides WHERE id=gid) <> 'draft' THEN RAISE EXCEPTION 'PRIVATE GUIDE REMAINED PUBLIC'; END IF;
 BEGIN
  UPDATE public.guides SET status='published' WHERE id=gid;
  RAISE EXCEPTION 'PRIVATE GUIDE WAS PUBLISHED';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 UPDATE public.cms_content_metadata SET visibility_level='public',workflow_state='published' WHERE source_table='guides' AND source_id=gid;
 IF (SELECT status FROM public.guides WHERE id=gid) <> 'published' THEN RAISE EXCEPTION 'PUBLIC GUIDE COULD NOT REPUBLISH'; END IF;
 IF has_function_privilege('anon','api_private.guide_publication_guard()','EXECUTE') THEN RAISE EXCEPTION 'PRIVATE FUNCTION EXPOSED'; END IF;
END $test$;
ROLLBACK;
