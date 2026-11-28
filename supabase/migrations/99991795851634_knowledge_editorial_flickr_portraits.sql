-- Extend human portrait review to licensed Flickr originals. This migration
-- changes workflow code only; it does not approve images or publish drafts.
CREATE OR REPLACE FUNCTION api_private.knowledge_portrait_source(p_portrait jsonb) RETURNS text
 LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE photo_id text; licence_path text;
BEGIN
 -- Preserve existing Commons support, with complete HTTPS host/path matching.
 IF coalesce(p_portrait->>'source_url','') ~ '^https://commons[.]wikimedia[.]org/wiki/[^[:space:]?#]+$'
  AND coalesce(p_portrait->>'url','') ~ '^https://upload[.]wikimedia[.]org/[^[:space:]?#]+$'
  AND coalesce(p_portrait->>'license','') ~ '^(CC BY|Public domain)' THEN RETURN 'commons'; END IF;
 IF p_portrait->>'source' IS DISTINCT FROM 'flickr' THEN RETURN NULL; END IF;
 photo_id:=substring(p_portrait->>'source_url' FROM '^https://www[.]flickr[.]com/photos/[A-Za-z0-9_@-]+/([0-9]+)/?$');
 IF photo_id IS NULL OR coalesce(p_portrait->>'url','') !~
  ('^https://live[.]staticflickr[.]com/[0-9]+/'||photo_id||'_[0-9a-f]{10,32}(_[a-z0-9]+)?[.](jpg|jpeg|png)$') THEN RETURN NULL; END IF;
 -- Only licences permitting commercial reuse and adaptations. NC, ND,
 -- all-rights-reserved and unknown labels cannot pass a prefix match.
 licence_path:=CASE
  WHEN p_portrait->>'license' ~ '^CC BY (1[.]0|2[.]0|2[.]5|3[.]0|4[.]0)$'
   THEN 'licenses/by/'||split_part(p_portrait->>'license',' ',3)||'/'
  WHEN p_portrait->>'license' ~ '^CC BY-SA (1[.]0|2[.]0|2[.]5|3[.]0|4[.]0)$'
   THEN 'licenses/by-sa/'||split_part(p_portrait->>'license',' ',3)||'/'
  WHEN p_portrait->>'license'='CC0 1.0' THEN 'publicdomain/zero/1.0/'
  ELSE NULL END;
 IF licence_path IS NULL OR p_portrait->>'license_url' IS DISTINCT FROM 'https://creativecommons.org/'||licence_path
  OR length(trim(coalesce(p_portrait->'evidence'->>'original_title','')))<1
  OR length(trim(coalesce(p_portrait->'evidence'->>'modifications','')))<3
  OR length(trim(coalesce(p_portrait->'evidence'->>'licence_documentation','')))<20
  OR coalesce(p_portrait->'evidence'->>'sha256','') !~ '^[0-9a-f]{64}$'
  THEN RETURN NULL; END IF;
 RETURN 'flickr';
END $$;
REVOKE ALL ON FUNCTION api_private.knowledge_portrait_source(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION api_private.knowledge_editorial_action(p_action text,p_id uuid,p_payload jsonb DEFAULT '{}') RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.knowledge_editorial_proposals; e public.knowledge_editorial_entries; b public.knowledge_editorial_batches;
 snap jsonb; risk text; result jsonb; is_service boolean:=coalesce(auth.role(),'')='service_role'; count_today integer; applied jsonb; previous jsonb; asset uuid; old_portrait text;
BEGIN
 IF NOT is_service AND (auth.uid() IS NULL OR NOT public.has_any_role_jwt(ARRAY['admin'::public.app_role,'moderator'::public.app_role])) THEN
  RAISE EXCEPTION 'knowledge editorial requires moderator' USING ERRCODE='42501'; END IF;
 IF p_action IN ('accept_batch','automation','report_error','record_reader_test','audit_first_twenty','resolve_error') THEN
  IF is_service THEN RAISE EXCEPTION 'human decision required' USING ERRCODE='42501'; END IF;
  SELECT * INTO STRICT b FROM public.knowledge_editorial_batches WHERE id=p_id FOR UPDATE;
  IF p_action='record_reader_test' THEN
   IF jsonb_typeof(p_payload->'participants')<>'array' OR jsonb_array_length(p_payload->'participants')<5
    OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(p_payload->'participants'))<5 OR NOT coalesce((p_payload->>'accuracy')::numeric BETWEEN 0.8 AND 1,false) THEN RAISE EXCEPTION 'five readers and at least 80 percent comprehension required'; END IF;
   UPDATE public.knowledge_editorial_batches SET reader_test=p_payload||jsonb_build_object('recorded_by',auth.uid(),'recorded_at',now()) WHERE id=b.id;
  ELSIF p_action='accept_batch' THEN
   IF b.frozen_at IS NULL OR jsonb_array_length(b.manifest)<>30 OR NOT coalesce((b.reader_test->>'accuracy')::numeric>=0.8,false)
    OR coalesce(jsonb_array_length(b.reader_test->'participants'),0)<5 THEN RAISE EXCEPTION 'pilot manifest and reader testing incomplete'; END IF;
   IF (SELECT count(*) FROM public.knowledge_editorial_entries WHERE batch_id=b.id)<>30 OR EXISTS(
    SELECT 1 FROM public.knowledge_editorial_entries i WHERE batch_id=b.id AND NOT EXISTS(
     SELECT 1 FROM public.knowledge_editorial_proposals q WHERE q.entry_id=i.id AND q.status='published' AND q.reviewed_by IS NOT NULL AND q.rolled_back_at IS NULL
    )) THEN RAISE EXCEPTION 'all thirty pilot entries require reviewed publication'; END IF;
   IF NOT coalesce((p_payload->>'figures_reviewed')::boolean,false) OR NOT coalesce((p_payload->>'mobile_accessibility_passed')::boolean,false) THEN RAISE EXCEPTION 'figure and accessibility review required'; END IF;
   UPDATE public.knowledge_editorial_batches SET accepted_at=now(),accepted_by=auth.uid() WHERE id=b.id;
  ELSIF p_action='automation' THEN
   IF coalesce((p_payload->>'enabled')::boolean,false) AND (b.accepted_at IS NULL OR b.paused_reason IS NOT NULL) THEN RAISE EXCEPTION 'pilot not accepted or automation is paused'; END IF;
   IF coalesce((p_payload->>'enabled')::boolean,false) AND (SELECT count(*) FROM public.knowledge_editorial_events WHERE batch_id=b.id AND action='publish_auto')>=20
    AND NOT EXISTS(SELECT 1 FROM public.knowledge_editorial_events WHERE batch_id=b.id AND action='audit_first_twenty') THEN RAISE EXCEPTION 'review first twenty automatic publications before continuing'; END IF;
   UPDATE public.knowledge_editorial_batches SET automatic_enabled=coalesce((p_payload->>'enabled')::boolean,false) WHERE id=b.id;
   UPDATE public.admin_automations SET enabled=EXISTS(SELECT 1 FROM public.knowledge_editorial_batches WHERE automatic_enabled AND accepted_at IS NOT NULL AND paused_reason IS NULL) WHERE slug='knowledge_editorial_quality';
  ELSIF p_action='audit_first_twenty' THEN
   IF (SELECT count(*) FROM public.knowledge_editorial_events WHERE batch_id=b.id AND action='publish_auto')<20 OR NOT coalesce((p_payload->>'all_twenty_reviewed')::boolean,false) THEN RAISE EXCEPTION 'twenty publications must be reviewed'; END IF;
  ELSIF p_action='resolve_error' THEN
   IF length(trim(coalesce(p_payload->>'correction_reference','')))<10 OR length(trim(coalesce(p_payload->>'regression_reference','')))<10 THEN RAISE EXCEPTION 'correction and regression evidence required'; END IF;
   UPDATE public.knowledge_editorial_batches SET paused_reason=NULL WHERE id=b.id;
  ELSE
   IF length(trim(coalesce(p_payload->>'reason','')))<10 THEN RAISE EXCEPTION 'describe the material error'; END IF;
   UPDATE public.knowledge_editorial_batches SET automatic_enabled=false,paused_reason=p_payload->>'reason' WHERE id=b.id;
  END IF;
  UPDATE public.admin_automations SET enabled=EXISTS(SELECT 1 FROM public.knowledge_editorial_batches WHERE automatic_enabled AND accepted_at IS NOT NULL AND paused_reason IS NULL) WHERE slug='knowledge_editorial_quality';
  INSERT INTO public.knowledge_editorial_events(batch_id,action,actor_id,detail) VALUES(b.id,p_action,auth.uid(),p_payload);
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF p_action='approve_portrait' THEN
  IF is_service THEN RAISE EXCEPTION 'human image review required' USING ERRCODE='42501'; END IF;
  SELECT * INTO STRICT e FROM public.knowledge_editorial_entries WHERE id=p_id FOR UPDATE;
  IF e.entity_type<>'personalities' OR e.portrait->>'status' IS DISTINCT FROM 'candidate'
   OR NOT coalesce((e.portrait->>'width')::integer>=400,false) OR NOT coalesce((e.portrait->>'height')::integer>=600,false)
   OR length(trim(coalesce(e.portrait->>'creator','')))<2 OR length(trim(coalesce(e.portrait->>'attribution','')))<3
   OR length(trim(coalesce(e.portrait->>'alt','')))<3 OR length(trim(coalesce(e.portrait->>'caption','')))<3
   OR NOT coalesce((p_payload->>'subject_and_rights_checked')::boolean,false) THEN RAISE EXCEPTION 'portrait identity, rights, resolution or attribution incomplete'; END IF;
  -- Source/URL/licence validation is shared with read-only eligibility checks.
  risk:=api_private.knowledge_portrait_source(e.portrait);
  IF risk IS NULL THEN RAISE EXCEPTION 'portrait source or reuse licence incomplete'; END IF;
  applied:=e.portrait||jsonb_build_object('source',risk,'status','approved','reviewed_by',auth.uid(),'reviewed_at',now(),
   'evidence',coalesce(e.portrait->'evidence','{}'::jsonb)||jsonb_build_object('human_approval_pending',false));
  INSERT INTO public.image_assets(url_hash,url,source,source_ref,license,attribution,alt_text,width,height,access_level,metadata)
   VALUES(encode(sha256(convert_to(e.portrait->>'url','UTF8')),'hex'),e.portrait->>'url',risk,e.portrait->>'source_url',e.portrait->>'license',e.portrait->>'attribution',e.portrait->>'alt',(e.portrait->>'width')::integer,(e.portrait->>'height')::integer,'internal',jsonb_build_object('knowledge_editorial',true,'portrait',applied))
   ON CONFLICT(url_hash) DO UPDATE SET last_seen_at=now(),source=EXCLUDED.source,license=EXCLUDED.license,attribution=EXCLUDED.attribution,source_ref=EXCLUDED.source_ref,
    alt_text=coalesce(public.image_assets.alt_text,EXCLUDED.alt_text),metadata=coalesce(public.image_assets.metadata,'{}'::jsonb)||EXCLUDED.metadata RETURNING id INTO asset;
  UPDATE public.knowledge_editorial_entries SET portrait=applied||jsonb_build_object('asset_id',asset) WHERE id=e.id;
  INSERT INTO public.knowledge_editorial_events(batch_id,action,actor_id,detail) VALUES(e.batch_id,'approve_portrait',auth.uid(),jsonb_build_object('entry_id',e.id,'asset_id',asset,'source',risk,'source_url',e.portrait->>'source_url','license',e.portrait->>'license'));
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF p_action='create' THEN
  SELECT * INTO STRICT e FROM public.knowledge_editorial_entries WHERE id=p_id;
  SELECT * INTO STRICT b FROM public.knowledge_editorial_batches WHERE id=e.batch_id FOR UPDATE;
  IF b.frozen_at IS NULL THEN RAISE EXCEPTION 'freeze manifest first'; END IF;
  snap:=api_private.knowledge_snapshot(e.entity_type,e.entity_id);
  INSERT INTO public.knowledge_editorial_proposals(entry_id,base_hash,base_snapshot)
   VALUES(e.id,api_private.knowledge_hash(snap),snap) ON CONFLICT(entry_id,base_hash) WHERE status IN ('research','draft','review','approved') DO NOTHING;
  SELECT to_jsonb(q) INTO result FROM public.knowledge_editorial_proposals q WHERE entry_id=e.id AND base_hash=api_private.knowledge_hash(snap) AND status IN ('research','draft','review','approved');
  RETURN result;
 END IF;
 SELECT * INTO STRICT p FROM public.knowledge_editorial_proposals WHERE id=p_id FOR UPDATE;
 SELECT * INTO STRICT e FROM public.knowledge_editorial_entries WHERE id=p.entry_id;
 SELECT * INTO STRICT b FROM public.knowledge_editorial_batches WHERE id=e.batch_id FOR UPDATE;
 risk:=api_private.knowledge_risk(e.entity_type,e.entity_id);
 IF p_action='validation_context' THEN
  IF NOT is_service THEN RAISE EXCEPTION 'worker only' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('content_hash',api_private.knowledge_hash(jsonb_build_object('patch',p.patch,'sources',p.sources)));
 ELSIF p_action='save' THEN
  IF p_payload->>'expected_updated_at' IS DISTINCT FROM p.updated_at::text AND (p_payload->>'expected_updated_at')::timestamptz IS DISTINCT FROM p.updated_at THEN RAISE EXCEPTION 'draft changed; reload before saving'; END IF;
  IF p.status NOT IN ('research','draft','review','approved') THEN RAISE EXCEPTION 'proposal is closed'; END IF;
  applied:=p_payload->'patch';
  IF applied IS NULL OR jsonb_typeof(applied)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(applied) k WHERE k<>ALL(CASE WHEN e.entity_type='unified_tags' THEN ARRAY['description','long_description'] ELSE ARRAY['description','bio'] END))
   OR EXISTS(SELECT 1 FROM jsonb_each(applied) v WHERE jsonb_typeof(v.value)<>'string') THEN RAISE EXCEPTION 'unsupported editorial field'; END IF;
  IF jsonb_typeof(p_payload->'sources')<>'array' THEN RAISE EXCEPTION 'sources must be an array'; END IF;
  UPDATE public.knowledge_editorial_proposals SET patch=applied,sources=p_payload->'sources',provenance=coalesce(p_payload->'provenance','{}'),
   status='draft',checks='{}',checked_hash=NULL,checked_at=NULL,rubric='{}',specialist_review=NULL,reviewed_by=NULL,reviewed_at=NULL,updated_at=clock_timestamp() WHERE id=p.id;
 ELSIF p_action='checks' THEN
  IF NOT is_service THEN RAISE EXCEPTION 'checks require trusted worker' USING ERRCODE='42501'; END IF;
  IF p.status NOT IN ('draft','review') THEN RAISE EXCEPTION 'proposal cannot be checked'; END IF;
  IF p_payload->>'content_hash' IS DISTINCT FROM api_private.knowledge_hash(jsonb_build_object('patch',p.patch,'sources',p.sources)) THEN RAISE EXCEPTION 'validation is stale'; END IF;
  UPDATE public.knowledge_editorial_proposals SET checks=p_payload->'checks',rubric=p_payload->'rubric',provenance=provenance||jsonb_build_object('validation',p_payload->'evaluator'),checked_hash=p_payload->>'content_hash',checked_at=now(),status='review',updated_at=clock_timestamp() WHERE id=p.id;
 ELSIF p_action='approve' THEN
  IF is_service THEN RAISE EXCEPTION 'human approval required' USING ERRCODE='42501'; END IF;
  IF p.status<>'review' OR NOT coalesce(api_private.knowledge_checks_pass(p),false) THEN RAISE EXCEPTION 'evidence or editorial checks incomplete'; END IF;
  IF risk='specialist' AND (length(trim(coalesce(p_payload->>'specialist_name','')))<3 OR length(trim(coalesce(p_payload->>'specialist_qualification','')))<5
    OR NOT coalesce((p_payload->>'specialist_attested')::boolean,false)) THEN RAISE EXCEPTION 'named specialist and explicit review attestation required'; END IF;
  UPDATE public.knowledge_editorial_proposals SET status='approved',reviewed_by=auth.uid(),reviewed_at=now(),review_note=p_payload->>'note',
   specialist_review=CASE WHEN risk='specialist' THEN p_payload||jsonb_build_object('recorded_by',auth.uid(),'at',now()) ELSE NULL END WHERE id=p.id;
 ELSIF p_action IN ('publish','publish_auto') THEN
  IF NOT coalesce(api_private.knowledge_checks_pass(p),false) THEN RAISE EXCEPTION 'checks missing, stale or failed'; END IF;
  IF p_action='publish_auto' THEN
   IF NOT is_service OR NOT b.automatic_enabled OR b.accepted_at IS NULL OR b.paused_reason IS NOT NULL OR risk<>'routine' OR p.status<>'review'
    OR coalesce((p.checks->>'sensitive_claims')::boolean,true) THEN RAISE EXCEPTION 'automatic publication ineligible'; END IF;
   SELECT count(*) INTO count_today FROM public.knowledge_editorial_events WHERE batch_id=b.id AND action='publish_auto' AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
   IF count_today>=b.daily_limit THEN RAISE EXCEPTION 'automatic daily limit reached'; END IF;
   IF (SELECT count(*) FROM public.knowledge_editorial_events WHERE batch_id=b.id AND action='publish_auto')>=20
    AND NOT EXISTS(SELECT 1 FROM public.knowledge_editorial_events WHERE batch_id=b.id AND action='audit_first_twenty') THEN RAISE EXCEPTION 'first twenty need audit'; END IF;
  ELSE
   IF is_service OR p.status<>'approved' OR p.reviewed_by IS NULL THEN RAISE EXCEPTION 'human approved proposal required'; END IF;
   IF risk='specialist' AND p.specialist_review IS NULL THEN RAISE EXCEPTION 'specialist review required'; END IF;
  END IF;
  snap:=api_private.knowledge_snapshot(e.entity_type,e.entity_id);
  IF api_private.knowledge_hash(snap)<>p.base_hash THEN
   UPDATE public.knowledge_editorial_proposals SET status='superseded',review_note='Live content changed; regenerate.',updated_at=clock_timestamp() WHERE id=p.id;
   RETURN jsonb_build_object('ok',false,'error','stale_proposal');
  END IF;
  applied:=snap||p.patch;
  IF applied=snap THEN RAISE EXCEPTION 'proposal does not improve any live field'; END IF;
  IF e.entity_type='personalities' AND p_action='publish' AND e.portrait->>'status'='approved' THEN
   SELECT image_url INTO old_portrait FROM public.personalities WHERE id=e.entity_id;
   UPDATE public.image_assets SET access_level='public' WHERE id=(e.portrait->>'asset_id')::uuid AND NOT is_flagged AND status='active';
   IF NOT FOUND THEN RAISE EXCEPTION 'approved portrait asset is unavailable'; END IF;
   INSERT INTO public.image_asset_links(asset_id,entity_type,entity_id,role,sort_order) VALUES((e.portrait->>'asset_id')::uuid,'personality',e.entity_id,'gallery',0) ON CONFLICT DO NOTHING;
   UPDATE public.personalities SET image_url=e.portrait->>'url' WHERE id=e.entity_id;
   UPDATE public.knowledge_editorial_proposals SET portrait_before=old_portrait,published_portrait=e.portrait->>'url' WHERE id=p.id;
  END IF;
  PERFORM set_config('app.knowledge_proposal',p.id::text,true);
  PERFORM set_config('app.actor','knowledge:publish',true);
  IF e.entity_type='unified_tags' THEN UPDATE public.unified_tags SET description=applied->>'description',long_description=applied->>'long_description' WHERE id=e.entity_id;
  ELSE UPDATE public.personalities SET description=applied->>'description',bio=applied->>'bio' WHERE id=e.entity_id; END IF;
  UPDATE public.knowledge_editorial_proposals SET status='superseded',updated_at=clock_timestamp() WHERE entry_id=p.entry_id AND id<>p.id AND status IN ('research','draft','review','approved','published');
  UPDATE public.knowledge_editorial_proposals SET status='published',published_at=now(),publication_mode=p_action,publication_snapshot=applied,updated_at=clock_timestamp() WHERE id=p.id;
  PERFORM set_config('app.knowledge_proposal','',true);
 ELSIF p_action='rollback' THEN
  IF is_service OR p.status<>'published' OR p.rolled_back_at IS NOT NULL THEN RAISE EXCEPTION 'published revision required'; END IF;
  snap:=api_private.knowledge_snapshot(e.entity_type,e.entity_id);
  IF snap IS DISTINCT FROM p.publication_snapshot THEN RAISE EXCEPTION 'live copy changed; rollback would overwrite newer work'; END IF;
  PERFORM set_config('app.knowledge_proposal',p.id::text,true);
  PERFORM set_config('app.actor','knowledge:rollback',true);
  IF e.entity_type='unified_tags' THEN UPDATE public.unified_tags SET description=p.base_snapshot->>'description',long_description=p.base_snapshot->>'long_description' WHERE id=e.entity_id;
  ELSE UPDATE public.personalities SET description=p.base_snapshot->>'description',bio=p.base_snapshot->>'bio' WHERE id=e.entity_id; END IF;
  IF p.published_portrait IS NOT NULL THEN UPDATE public.personalities SET image_url=p.portrait_before WHERE id=e.entity_id AND image_url=p.published_portrait; END IF;
  UPDATE public.knowledge_editorial_proposals SET rolled_back_at=now(),status='superseded',updated_at=clock_timestamp() WHERE id=p.id;
  UPDATE public.knowledge_editorial_proposals SET status='superseded',review_note='Publication was rolled back; regenerate against current text.',updated_at=clock_timestamp() WHERE entry_id=p.entry_id AND id<>p.id AND status IN ('research','draft','review','approved');
  UPDATE public.knowledge_editorial_proposals SET status='published' WHERE id=(SELECT id FROM public.knowledge_editorial_proposals WHERE entry_id=p.entry_id AND status='superseded' AND rolled_back_at IS NULL AND publication_snapshot=p.base_snapshot ORDER BY published_at DESC LIMIT 1);
  PERFORM set_config('app.knowledge_proposal','',true);
  UPDATE public.knowledge_editorial_batches SET automatic_enabled=false,paused_reason='Publication rolled back; review before resuming.' WHERE id=b.id;
  UPDATE public.admin_automations SET enabled=EXISTS(SELECT 1 FROM public.knowledge_editorial_batches WHERE automatic_enabled AND accepted_at IS NOT NULL AND paused_reason IS NULL) WHERE slug='knowledge_editorial_quality';
 ELSIF p_action='reject' THEN
  IF p.status NOT IN ('research','draft','review','approved') THEN RAISE EXCEPTION 'proposal is closed'; END IF;
  UPDATE public.knowledge_editorial_proposals SET status='rejected',review_note=p_payload->>'note',updated_at=clock_timestamp() WHERE id=p.id;
 ELSE RAISE EXCEPTION 'unsupported action' USING ERRCODE='22023'; END IF;
 INSERT INTO public.knowledge_editorial_events(proposal_id,batch_id,action,actor_id,detail) VALUES(p.id,b.id,p_action,auth.uid(),jsonb_build_object('note',p_payload->>'note'));
 SELECT to_jsonb(q) INTO result FROM public.knowledge_editorial_proposals q WHERE id=p.id;
 RETURN result||jsonb_build_object('validation_hash',api_private.knowledge_hash(jsonb_build_object('patch',result->'patch','sources',result->'sources')));
END $$;
-- Preserve the existing private implementation and public invoker wrapper.
REVOKE ALL ON FUNCTION api_private.knowledge_editorial_action(text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION api_private.knowledge_editorial_action(text,uuid,jsonb) TO authenticated,service_role;
