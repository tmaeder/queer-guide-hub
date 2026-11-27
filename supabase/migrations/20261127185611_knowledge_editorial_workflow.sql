BEGIN;

CREATE TABLE public.knowledge_editorial_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE,
 policy_version text NOT NULL DEFAULT 'knowledge-v1', manifest jsonb NOT NULL DEFAULT '[]',
 frozen_at timestamptz, accepted_at timestamptz, accepted_by uuid,
 automatic_enabled boolean NOT NULL DEFAULT false, paused_reason text,
 daily_limit integer NOT NULL DEFAULT 5 CHECK (daily_limit BETWEEN 1 AND 5),
 reader_test jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.knowledge_editorial_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES public.knowledge_editorial_batches(id),
 entity_type text NOT NULL CHECK(entity_type IN ('unified_tags','personalities')), entity_id uuid NOT NULL,
 name text NOT NULL, slug text NOT NULL, pilot_group text NOT NULL,
 reader_question text NOT NULL, format text NOT NULL CHECK(format IN ('definition','explainer','guide','profile')),
 source_urls jsonb NOT NULL DEFAULT '[]', visual_ids jsonb NOT NULL DEFAULT '[]',
 portrait jsonb, exception text, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(batch_id,entity_type,entity_id), UNIQUE(entity_type,entity_id)
);
CREATE TABLE public.knowledge_editorial_proposals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entry_id uuid NOT NULL REFERENCES public.knowledge_editorial_entries(id),
 base_hash text NOT NULL, base_snapshot jsonb NOT NULL,
 patch jsonb NOT NULL DEFAULT '{}', sources jsonb NOT NULL DEFAULT '[]',
 status text NOT NULL DEFAULT 'research' CHECK(status IN ('research','draft','review','approved','published','rejected','superseded')),
 checks jsonb NOT NULL DEFAULT '{}', checked_hash text, checked_at timestamptz,
 rubric jsonb NOT NULL DEFAULT '{}', specialist_review jsonb,
 reviewed_by uuid, reviewed_at timestamptz, review_note text,
 provenance jsonb NOT NULL DEFAULT '{}', published_at timestamptz, publication_mode text,
 publication_snapshot jsonb, rolled_back_at timestamptz, portrait_before text, published_portrait text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.knowledge_editorial_events (
 seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 proposal_id uuid REFERENCES public.knowledge_editorial_proposals(id), batch_id uuid REFERENCES public.knowledge_editorial_batches(id),
 action text NOT NULL, actor_id uuid, detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX knowledge_proposals_open_base ON public.knowledge_editorial_proposals(entry_id,base_hash) WHERE status IN ('research','draft','review','approved');
CREATE INDEX knowledge_proposals_queue ON public.knowledge_editorial_proposals(status,created_at);
CREATE INDEX knowledge_entries_entity ON public.knowledge_editorial_entries(entity_type,entity_id);
CREATE INDEX knowledge_events_batch ON public.knowledge_editorial_events(batch_id,created_at);

ALTER TABLE public.knowledge_editorial_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_editorial_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_editorial_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_editorial_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.knowledge_editorial_batches,public.knowledge_editorial_entries,public.knowledge_editorial_proposals,public.knowledge_editorial_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.knowledge_editorial_batches,public.knowledge_editorial_entries,public.knowledge_editorial_proposals,public.knowledge_editorial_events TO authenticated;
GRANT ALL ON public.knowledge_editorial_batches,public.knowledge_editorial_entries,public.knowledge_editorial_proposals,public.knowledge_editorial_events TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.knowledge_editorial_events_seq_seq TO service_role;
CREATE POLICY knowledge_batches_review ON public.knowledge_editorial_batches FOR SELECT TO authenticated USING(public.has_any_role_jwt(ARRAY['admin'::public.app_role,'moderator'::public.app_role]));
CREATE POLICY knowledge_entries_review ON public.knowledge_editorial_entries FOR SELECT TO authenticated USING(public.has_any_role_jwt(ARRAY['admin'::public.app_role,'moderator'::public.app_role]));
CREATE POLICY knowledge_proposals_review ON public.knowledge_editorial_proposals FOR SELECT TO authenticated USING(public.has_any_role_jwt(ARRAY['admin'::public.app_role,'moderator'::public.app_role]));
CREATE POLICY knowledge_events_review ON public.knowledge_editorial_events FOR SELECT TO authenticated USING(public.has_any_role_jwt(ARRAY['admin'::public.app_role,'moderator'::public.app_role]));

CREATE OR REPLACE FUNCTION api_private.knowledge_hash(value jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT encode(sha256(convert_to(value::text,'UTF8')),'hex') $$;
CREATE OR REPLACE FUNCTION api_private.knowledge_snapshot(kind text,entity uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF kind='unified_tags' THEN
  SELECT jsonb_build_object('description',description,'long_description',long_description) INTO result
   FROM public.unified_tags WHERE id=entity AND status='active' AND publication_role='article' AND seo_indexable AND NOT coalesce(restoration_review_required,false) FOR UPDATE;
 ELSIF kind='personalities' THEN
  SELECT jsonb_build_object('description',description,'bio',bio) INTO result
   FROM public.personalities WHERE id=entity AND visibility='public' AND duplicate_of_id IS NULL FOR UPDATE;
 ELSE RAISE EXCEPTION 'unsupported entity' USING ERRCODE='22023'; END IF;
 IF result IS NULL THEN RAISE EXCEPTION 'entity is no longer publicly eligible' USING ERRCODE='22023'; END IF;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION api_private.knowledge_risk(kind text,entity uuid) RETURNS text
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row_data jsonb; category text;
BEGIN
 IF kind='unified_tags' THEN
  SELECT to_jsonb(t) INTO row_data FROM public.unified_tags t WHERE id=entity;
  category:=lower(coalesce(row_data->>'category',''));
  IF category ~ '(health|care|medical|consent|safety|substance|drug)' THEN RETURN 'specialist'; END IF;
  IF category ~ '(law|legal|rights)' OR coalesce((row_data->>'is_sensitive')::boolean,false) OR coalesce((row_data->>'is_adult')::boolean,false) THEN RETURN 'review'; END IF;
 ELSE
  SELECT to_jsonb(p) INTO row_data FROM public.personalities p WHERE id=entity;
  IF coalesce((row_data->>'is_living')::boolean,true) OR coalesce((row_data->>'is_adult')::boolean,false)
   OR coalesce(row_data->'sensitivity_flags','{}') NOT IN ('{}'::jsonb,'null'::jsonb) THEN RETURN 'review'; END IF;
 END IF;
 RETURN 'routine';
END $$;

-- Guard managed prose at the database boundary, including service-role legacy writers.
-- Human edits remain possible and invalidate proposals. Publication is checked against
-- a matching proposal, not a caller-controlled actor label.
CREATE OR REPLACE FUNCTION api_private.knowledge_prose_guard() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE entry public.knowledge_editorial_entries; proposal public.knowledge_editorial_proposals; proposed jsonb; next_copy jsonb; old_copy jsonb;
BEGIN
 next_copy:=jsonb_build_object('description',NEW.description);
 old_copy:=jsonb_build_object('description',OLD.description);
 IF TG_TABLE_NAME='unified_tags' THEN
  next_copy:=next_copy||jsonb_build_object('long_description',NEW.long_description);
  old_copy:=old_copy||jsonb_build_object('long_description',OLD.long_description);
 ELSE
  next_copy:=next_copy||jsonb_build_object('bio',NEW.bio);
  old_copy:=old_copy||jsonb_build_object('bio',OLD.bio);
 END IF;
 IF next_copy=old_copy THEN RETURN NEW; END IF;
 SELECT * INTO entry FROM public.knowledge_editorial_entries WHERE entity_type=TG_TABLE_NAME AND entity_id=NEW.id LIMIT 1;
 IF entry.id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO proposal FROM public.knowledge_editorial_proposals WHERE id::text=current_setting('app.knowledge_proposal',true) AND entry_id=entry.id;
 IF proposal.id IS NOT NULL AND (
   (proposal.status IN ('approved','review') AND proposal.base_snapshot||proposal.patch=next_copy AND proposal.base_hash=api_private.knowledge_hash(old_copy))
   OR (proposal.status='published' AND proposal.base_snapshot=next_copy AND proposal.publication_snapshot=old_copy)
 ) THEN RETURN NEW; END IF;
 IF auth.uid() IS NULL OR NOT public.has_any_role_jwt(ARRAY['admin'::public.app_role,'moderator'::public.app_role]) THEN
  RAISE EXCEPTION 'knowledge_managed_prose_requires_proposal' USING ERRCODE='42501';
 END IF;
 UPDATE public.knowledge_editorial_proposals SET status='superseded',updated_at=clock_timestamp(),review_note='Live copy was edited; regenerate against the current text.'
  WHERE entry_id IN(SELECT id FROM public.knowledge_editorial_entries WHERE entity_type=TG_TABLE_NAME AND entity_id=NEW.id)
  AND status IN ('research','draft','review','approved','published');
 RETURN NEW;
END $$;
CREATE TRIGGER knowledge_tag_prose_guard BEFORE UPDATE OF description,long_description ON public.unified_tags FOR EACH ROW EXECUTE FUNCTION api_private.knowledge_prose_guard();
CREATE TRIGGER knowledge_personality_prose_guard BEFORE UPDATE OF description,bio ON public.personalities FOR EACH ROW EXECUTE FUNCTION api_private.knowledge_prose_guard();

CREATE OR REPLACE FUNCTION api_private.knowledge_checks_pass(p public.knowledge_editorial_proposals) RETURNS boolean
 LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT p.checked_hash=api_private.knowledge_hash(jsonb_build_object('patch',p.patch,'sources',p.sources))
 AND p.checked_at>now()-interval '7 days'
 AND p.checks @> '{"sources_retrieved":true,"subject_match":true,"claims_supported":true,"no_unsupported_additions":true,"valid_markup":true,"no_internal_language":true,"independent_sources":true}'::jsonb
 AND NOT EXISTS(SELECT 1 FROM unnest(ARRAY['clarity','specificity','usefulness','nuance','structure']) k WHERE NOT(coalesce(p.rubric->>k,'') ~ '^[45]$'))
 AND jsonb_array_length(p.sources)>=2 AND p.patch ? 'description'
 AND length(trim(p.patch->>'description'))>0
 AND jsonb_typeof(p.patch)='object'
 $$;

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
  IF e.entity_type<>'personalities' OR e.portrait->>'status'<>'candidate' OR coalesce(e.portrait->>'source_url','') NOT LIKE 'https://commons.wikimedia.org/wiki/%'
   OR NOT coalesce((e.portrait->>'width')::integer>=400,false) OR NOT coalesce((e.portrait->>'height')::integer>=600,false)
   OR length(coalesce(e.portrait->>'creator',''))<2 OR length(coalesce(e.portrait->>'attribution',''))<3
   OR length(coalesce(e.portrait->>'alt',''))<3 OR length(coalesce(e.portrait->>'caption',''))<3
   OR coalesce(e.portrait->>'license','') !~ '^(CC BY|Public domain)' OR coalesce(e.portrait->>'url','') NOT LIKE 'https://upload.wikimedia.org/%'
   OR NOT coalesce((p_payload->>'subject_and_rights_checked')::boolean,false) THEN RAISE EXCEPTION 'portrait identity, rights, resolution or attribution incomplete'; END IF;
  INSERT INTO public.image_assets(url_hash,url,source,source_ref,license,attribution,alt_text,width,height,access_level,metadata)
   VALUES(encode(sha256(convert_to(e.portrait->>'url','UTF8')),'hex'),e.portrait->>'url','commons',e.portrait->>'source_url',e.portrait->>'license',e.portrait->>'attribution',e.portrait->>'alt',(e.portrait->>'width')::integer,(e.portrait->>'height')::integer,'internal',jsonb_build_object('knowledge_editorial',true))
   ON CONFLICT(url_hash) DO UPDATE SET last_seen_at=now(),license=EXCLUDED.license,attribution=EXCLUDED.attribution,source_ref=EXCLUDED.source_ref,alt_text=coalesce(public.image_assets.alt_text,EXCLUDED.alt_text) RETURNING id INTO asset;
  UPDATE public.knowledge_editorial_entries SET portrait=e.portrait||jsonb_build_object('status','approved','asset_id',asset,'reviewed_by',auth.uid(),'reviewed_at',now()) WHERE id=e.id;
  INSERT INTO public.knowledge_editorial_events(batch_id,action,actor_id,detail) VALUES(e.batch_id,'approve_portrait',auth.uid(),jsonb_build_object('entry_id',e.id,'asset_id',asset));
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
CREATE OR REPLACE FUNCTION public.knowledge_editorial_action(p_action text,p_id uuid,p_payload jsonb DEFAULT '{}') RETURNS jsonb
 LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT api_private.knowledge_editorial_action(p_action,p_id,p_payload) $$;

-- Only approved references are public; the entity visibility check is repeated
-- on every request so archived/restricted entities never leak evidence.
CREATE OR REPLACE FUNCTION api_private.knowledge_public_editorial(p_kind text,p_ids uuid[]) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('entity_id',e.entity_id,'proposal_id',q.id,'sources',(
  SELECT coalesce(jsonb_agg(jsonb_build_object('title',s->>'title','url',s->>'url','publisher',s->>'publisher')),'[]') FROM jsonb_array_elements(q.sources) s
 ),'visual_ids',e.visual_ids,'portrait',CASE WHEN e.portrait->>'status'='approved' AND e.portrait->>'url'=(SELECT image_url FROM public.personalities WHERE id=e.entity_id) THEN jsonb_build_object('url',e.portrait->>'url','source_url',e.portrait->>'source_url','creator',e.portrait->>'creator','license',e.portrait->>'license','license_url',e.portrait->>'license_url','attribution',e.portrait->>'attribution','alt',e.portrait->>'alt','caption',e.portrait->>'caption') ELSE NULL END,'published_at',q.published_at)),'[]')
 FROM public.knowledge_editorial_entries e JOIN public.knowledge_editorial_proposals q ON q.entry_id=e.id AND q.status='published' AND q.rolled_back_at IS NULL
 WHERE e.entity_type=p_kind AND e.entity_id=ANY(p_ids) AND cardinality(p_ids)<=100 AND (
  (p_kind='unified_tags' AND EXISTS(SELECT 1 FROM public.unified_tags t WHERE t.id=e.entity_id AND t.status='active' AND t.publication_role='article' AND t.seo_indexable AND NOT coalesce(t.is_sensitive,false) AND NOT coalesce(t.is_adult,false)))
  OR (p_kind='personalities' AND EXISTS(SELECT 1 FROM public.personalities p WHERE p.id=e.entity_id AND p.visibility='public' AND p.duplicate_of_id IS NULL AND NOT coalesce(p.is_adult,false)))
 ) $$;
CREATE OR REPLACE FUNCTION public.knowledge_public_editorial(p_kind text,p_ids uuid[]) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT api_private.knowledge_public_editorial(p_kind,p_ids) $$;

REVOKE ALL ON FUNCTION api_private.knowledge_hash(jsonb),api_private.knowledge_snapshot(text,uuid),api_private.knowledge_risk(text,uuid),api_private.knowledge_prose_guard(),api_private.knowledge_checks_pass(public.knowledge_editorial_proposals) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION api_private.knowledge_editorial_action(text,uuid,jsonb),public.knowledge_editorial_action(text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION api_private.knowledge_editorial_action(text,uuid,jsonb),public.knowledge_editorial_action(text,uuid,jsonb) TO authenticated,service_role;
REVOKE ALL ON FUNCTION api_private.knowledge_public_editorial(text,uuid[]),public.knowledge_public_editorial(text,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api_private.knowledge_public_editorial(text,uuid[]),public.knowledge_public_editorial(text,uuid[]) TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION api_private.knowledge_manifest_guard() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='knowledge_editorial_batches' THEN
  IF OLD.frozen_at IS NOT NULL AND (NEW.manifest IS DISTINCT FROM OLD.manifest OR NEW.frozen_at IS DISTINCT FROM OLD.frozen_at OR NEW.policy_version<>OLD.policy_version) THEN RAISE EXCEPTION 'frozen manifest is immutable'; END IF;
 ELSE
  IF TG_OP='INSERT' THEN
   IF EXISTS(SELECT 1 FROM public.knowledge_editorial_batches WHERE id=NEW.batch_id AND frozen_at IS NOT NULL) THEN RAISE EXCEPTION 'cannot add to a frozen manifest'; END IF;
   RETURN NEW;
  ELSIF TG_OP='DELETE' THEN
   IF EXISTS(SELECT 1 FROM public.knowledge_editorial_batches WHERE id=OLD.batch_id AND frozen_at IS NOT NULL) THEN RAISE EXCEPTION 'cannot remove from a frozen manifest'; END IF;
   RETURN OLD;
  END IF;
  IF EXISTS(SELECT 1 FROM public.knowledge_editorial_batches WHERE id=OLD.batch_id AND frozen_at IS NOT NULL)
   AND (NEW.batch_id<>OLD.batch_id OR NEW.entity_type<>OLD.entity_type OR NEW.entity_id<>OLD.entity_id OR NEW.name<>OLD.name OR NEW.slug<>OLD.slug OR NEW.pilot_group<>OLD.pilot_group) THEN RAISE EXCEPTION 'frozen entity identity is immutable'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER knowledge_manifest_guard BEFORE UPDATE ON public.knowledge_editorial_batches FOR EACH ROW EXECUTE FUNCTION api_private.knowledge_manifest_guard();
CREATE TRIGGER knowledge_entry_identity_guard BEFORE INSERT OR UPDATE OR DELETE ON public.knowledge_editorial_entries FOR EACH ROW EXECUTE FUNCTION api_private.knowledge_manifest_guard();
REVOKE ALL ON FUNCTION api_private.knowledge_manifest_guard() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION api_private.knowledge_editorial_import(p_manifest jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b uuid; row_data jsonb; entry_id uuid; proposal_id uuid; snap jsonb; snapshot_hash text;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'operator import requires service role' USING ERRCODE='42501'; END IF;
 IF jsonb_array_length(p_manifest->'entries')<>30 THEN RAISE EXCEPTION 'pilot needs exactly thirty entries'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(p_manifest->'entries') r WHERE r->>'entity_type'='unified_tags')<>20 OR
    (SELECT count(*) FROM jsonb_array_elements(p_manifest->'entries') r WHERE r->>'entity_type'='personalities')<>10 THEN RAISE EXCEPTION 'pilot needs twenty terms and ten people'; END IF;
 INSERT INTO public.knowledge_editorial_batches(name,manifest) VALUES(p_manifest->>'name',p_manifest->'entries') ON CONFLICT(name) DO NOTHING RETURNING id INTO b;
 IF b IS NULL THEN
  SELECT id INTO b FROM public.knowledge_editorial_batches WHERE name=p_manifest->>'name' AND manifest=p_manifest->'entries';
  IF b IS NULL THEN RAISE EXCEPTION 'batch name already exists with another manifest'; END IF;
  RETURN jsonb_build_object('batch_id',b,'already_imported',true);
 END IF;
 FOR row_data IN SELECT value FROM jsonb_array_elements(p_manifest->'entries') LOOP
  snap:=api_private.knowledge_snapshot(row_data->>'entity_type',(row_data->>'entity_id')::uuid);
  snapshot_hash:=api_private.knowledge_hash(snap);
  IF snapshot_hash<>row_data->>'base_hash' THEN RAISE EXCEPTION 'pilot baseline changed for %',row_data->>'slug'; END IF;
  INSERT INTO public.knowledge_editorial_entries(batch_id,entity_type,entity_id,name,slug,pilot_group,reader_question,format,source_urls,visual_ids,portrait,exception)
   VALUES(b,row_data->>'entity_type',(row_data->>'entity_id')::uuid,row_data->>'name',row_data->>'slug',row_data->>'pilot_group',row_data->>'reader_question',row_data->>'format',row_data->'source_urls',coalesce(row_data->'visual_ids','[]'),row_data->'portrait',row_data->>'exception') RETURNING id INTO entry_id;
  INSERT INTO public.knowledge_editorial_proposals(entry_id,base_hash,base_snapshot,patch,sources,status,provenance)
   VALUES(entry_id,snapshot_hash,snap,coalesce(row_data->'patch','{}'),coalesce(row_data->'sources','[]'),CASE WHEN row_data ? 'patch' THEN 'draft' ELSE 'research' END,
   jsonb_build_object('policy','knowledge-v1','origin','reviewable-pilot-import','baseline_captured',p_manifest->>'captured_at')) RETURNING id INTO proposal_id;
  INSERT INTO public.knowledge_editorial_events(proposal_id,batch_id,action,detail) VALUES(proposal_id,b,'import',jsonb_build_object('baseline_hash',snapshot_hash));
 END LOOP;
 UPDATE public.knowledge_editorial_batches SET frozen_at=clock_timestamp() WHERE id=b;
 RETURN jsonb_build_object('batch_id',b,'entries',30);
END $$;
CREATE OR REPLACE FUNCTION public.knowledge_editorial_import(p_manifest jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT api_private.knowledge_editorial_import(p_manifest) $$;
REVOKE ALL ON FUNCTION api_private.knowledge_editorial_import(jsonb),public.knowledge_editorial_import(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api_private.knowledge_editorial_import(jsonb),public.knowledge_editorial_import(jsonb) TO service_role;


INSERT INTO public.admin_automations(slug,name,description,managed_by,enabled,trigger,conditions,action,schedule)
VALUES('knowledge_editorial_quality','Knowledge editorial quality','Review-gated knowledge revisions; existing AI allocations only. Pilot acceptance remains mandatory.','system',false,'{"type":"schedule"}','[]',
 jsonb_build_object('type','cron','jobname','knowledge-editorial-quality','command',$job$
 SELECT net.http_post(
  url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/knowledge-editorial',
  headers := jsonb_build_object('Authorization','Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='legacy_anon_key'),'Content-Type','application/json','X-Internal-Secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')),
  body := '{"action":"sweep","id":"all"}'::jsonb, timeout_milliseconds := 120000
 );
 $job$),'7 * * * *') ON CONFLICT(slug) DO NOTHING;

COMMIT;
