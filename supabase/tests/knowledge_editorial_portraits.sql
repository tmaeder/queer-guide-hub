-- Isolated fixtures only: no hosted draft is approved by these tests.
BEGIN;
INSERT INTO public.personalities(id,name,slug,description,bio,image_url)
 VALUES('11000000-0000-0000-0000-000000000001','Portrait fixture','portrait-fixture','Original summary','Original body','https://example.test/original.jpg');
INSERT INTO public.knowledge_editorial_batches(id,name,manifest)
 VALUES('21000000-0000-0000-0000-000000000001','Portrait tests','[]');
INSERT INTO public.knowledge_editorial_entries(id,batch_id,entity_type,entity_id,name,slug,pilot_group,reader_question,format,portrait)
 VALUES('31000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','personalities','11000000-0000-0000-0000-000000000001','Portrait fixture','portrait-fixture','people','Who is this?','profile',
 '{"status":"candidate","source":"flickr","source_url":"https://www.flickr.com/photos/fixture_owner/1234567890/","url":"https://live.staticflickr.com/4044/1234567890_0123456789_o.jpg","width":450,"height":800,"creator":"Fixture photographer","license":"CC BY 2.0","license_url":"https://creativecommons.org/licenses/by/2.0/","attribution":"Fixture title — Fixture photographer, courtesy of fixture museum. Copyright fixture photographer. CC BY 2.0.","alt":"Fixture subject holding a camera.","caption":"Fixture portrait.","evidence":{"original_title":"Fixture title","modifications":"None; original image.","copyright_notice":"Copyright fixture photographer.","licence_documentation":"Primary photo page supplies CC BY 2.0.","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","human_approval_pending":true}}');
UPDATE public.knowledge_editorial_batches SET frozen_at=now() WHERE id='21000000-0000-0000-0000-000000000001';

-- Canonical hosts and photo IDs must match; every unsupported licence fails closed.
DO $$ DECLARE portrait jsonb; bad jsonb; label text; BEGIN
 SELECT e.portrait INTO portrait FROM public.knowledge_editorial_entries e WHERE slug='portrait-fixture';
 IF api_private.knowledge_portrait_source(portrait) IS DISTINCT FROM 'flickr' THEN RAISE EXCEPTION 'valid Flickr rejected'; END IF;
 IF api_private.knowledge_portrait_source(portrait||'{"license":"CC BY-SA 4.0","license_url":"https://creativecommons.org/licenses/by-sa/4.0/"}') IS DISTINCT FROM 'flickr' THEN RAISE EXCEPTION 'sharealike rejected'; END IF;
 IF api_private.knowledge_portrait_source(portrait||'{"license":"CC0 1.0","license_url":"https://creativecommons.org/publicdomain/zero/1.0/"}') IS DISTINCT FROM 'flickr' THEN RAISE EXCEPTION 'CC0 rejected'; END IF;
 FOREACH label IN ARRAY ARRAY['CC BY-NC 2.0','CC BY-ND 2.0','CC BY-NC-SA 4.0','CC BY 2.0 (unverified)','All rights reserved','Public domain',''] LOOP
  IF api_private.knowledge_portrait_source(portrait||jsonb_build_object('license',label)) IS NOT NULL THEN RAISE EXCEPTION 'restricted/unknown licence accepted: %',label; END IF;
 END LOOP;
 FOR bad IN SELECT value FROM jsonb_array_elements('[
  {"source":"commons"},
  {"source_url":"https://www.flickr.com.evil.test/photos/fixture_owner/1234567890/"},
  {"source_url":"https://www.flickr.com@evil.test/photos/fixture_owner/1234567890/"},
  {"source_url":"http://www.flickr.com/photos/fixture_owner/1234567890/"},
  {"url":"https://live.staticflickr.com.evil.test/4044/1234567890_0123456789_o.jpg"},
  {"url":"https://live.staticflickr.com/4044/9999999999_0123456789_o.jpg"},
  {"url":"https://live.staticflickr.com/4044/1234567890_0123456789_o.jpg?redirect=elsewhere"},
  {"license_url":"https://creativecommons.org/licenses/by-nc/2.0/"},
  {"license_url":null},
  {"evidence":{}},
  {"evidence":null}
 ]'::jsonb) LOOP
  IF api_private.knowledge_portrait_source(portrait||bad) IS NOT NULL THEN RAISE EXCEPTION 'invalid candidate accepted: %',bad; END IF;
 END LOOP;
END $$;

SELECT set_config('request.jwt.claim.role','anon',true);
DO $$ BEGIN
 BEGIN PERFORM public.knowledge_editorial_action('approve_portrait','31000000-0000-0000-0000-000000000001','{"subject_and_rights_checked":true}'); RAISE EXCEPTION 'anonymous approved image'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claim.admin','false',true),set_config('request.jwt.claim.sub','41000000-0000-0000-0000-000000000001',true);
DO $$ BEGIN
 BEGIN PERFORM public.knowledge_editorial_action('approve_portrait','31000000-0000-0000-0000-000000000001','{"subject_and_rights_checked":true}'); RAISE EXCEPTION 'non-reviewer approved image'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.role','service_role',true),set_config('request.jwt.claim.sub','',true);
DO $$ BEGIN
 BEGIN PERFORM public.knowledge_editorial_action('approve_portrait','31000000-0000-0000-0000-000000000001','{"subject_and_rights_checked":true}'); RAISE EXCEPTION 'service approved image'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claim.admin','true',true),set_config('request.jwt.claim.sub','41000000-0000-0000-0000-000000000001',true);
SELECT public.knowledge_editorial_action('create','31000000-0000-0000-0000-000000000001');
DO $$ DECLARE p public.knowledge_editorial_proposals; BEGIN
 SELECT * INTO STRICT p FROM public.knowledge_editorial_proposals;
 PERFORM public.knowledge_editorial_action('save',p.id,jsonb_build_object('expected_updated_at',p.updated_at,'patch','{"description":"Private draft summary","bio":"Private draft body"}'::jsonb,'sources','[]'::jsonb));
END $$;
DO $$ DECLARE original jsonb; bad jsonb; BEGIN
 SELECT portrait INTO original FROM public.knowledge_editorial_entries WHERE slug='portrait-fixture';
 BEGIN PERFORM public.knowledge_editorial_action('approve_portrait','31000000-0000-0000-0000-000000000001'); RAISE EXCEPTION 'missing human attestation accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'portrait identity, rights, resolution or attribution incomplete' THEN RAISE; END IF; END;
 FOR bad IN SELECT value FROM jsonb_array_elements('[{"width":399},{"height":599},{"creator":" "},{"alt":" "},{"caption":" "},{"attribution":" "},{"status":null}]'::jsonb) LOOP
  UPDATE public.knowledge_editorial_entries SET portrait=original||bad WHERE slug='portrait-fixture';
  BEGIN PERFORM public.knowledge_editorial_action('approve_portrait','31000000-0000-0000-0000-000000000001','{"subject_and_rights_checked":true}'); RAISE EXCEPTION 'incomplete image approved'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'portrait identity, rights, resolution or attribution incomplete' THEN RAISE; END IF; END;
 END LOOP;
 UPDATE public.knowledge_editorial_entries SET portrait=original||'{"license":"CC BY-NC 2.0"}' WHERE slug='portrait-fixture';
 BEGIN PERFORM public.knowledge_editorial_action('approve_portrait','31000000-0000-0000-0000-000000000001','{"subject_and_rights_checked":true}'); RAISE EXCEPTION 'restricted image approved'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'portrait source or reuse licence incomplete' THEN RAISE; END IF; END;
 UPDATE public.knowledge_editorial_entries SET portrait=original WHERE slug='portrait-fixture';
 IF EXISTS(SELECT 1 FROM public.image_assets) THEN RAISE EXCEPTION 'rejected review created an asset'; END IF;
END $$;
SELECT public.knowledge_editorial_action('approve_portrait','31000000-0000-0000-0000-000000000001','{"subject_and_rights_checked":true}');
DO $$ DECLARE a public.image_assets; portrait jsonb; BEGIN
 SELECT * INTO STRICT a FROM public.image_assets;
 SELECT e.portrait INTO portrait FROM public.knowledge_editorial_entries e WHERE slug='portrait-fixture';
 IF a.source<>'flickr' OR a.access_level<>'internal' OR a.source_ref<>portrait->>'source_url'
  OR a.metadata->'portrait'->>'license_url'<>'https://creativecommons.org/licenses/by/2.0/'
  OR a.metadata->'portrait'->'evidence'->>'copyright_notice'<>'Copyright fixture photographer.'
  OR a.metadata->'portrait'->'evidence'->>'human_approval_pending'<>'false'
  OR portrait->>'status'<>'approved' OR portrait->>'reviewed_by' IS NULL THEN RAISE EXCEPTION 'approved provenance incomplete'; END IF;
 IF (SELECT image_url FROM public.personalities WHERE slug='portrait-fixture')<>'https://example.test/original.jpg'
  OR (SELECT bio FROM public.personalities WHERE slug='portrait-fixture')<>'Original body'
  OR (SELECT status FROM public.knowledge_editorial_proposals)<>'draft'
  OR EXISTS(SELECT 1 FROM public.knowledge_editorial_proposals WHERE published_at IS NOT NULL OR reviewed_by IS NOT NULL)
  OR EXISTS(SELECT 1 FROM public.knowledge_editorial_batches WHERE automatic_enabled OR accepted_at IS NOT NULL)
  OR public.knowledge_public_editorial('personalities',ARRAY['11000000-0000-0000-0000-000000000001'::uuid])<>'[]'::jsonb THEN RAISE EXCEPTION 'image approval published content or altered publication controls'; END IF;
END $$;
-- Upserting the same image corrects its source and keeps unrelated asset metadata.
UPDATE public.image_assets SET source='commons',metadata=metadata||'{"unrelated":"retained"}';
UPDATE public.knowledge_editorial_entries SET portrait=portrait||'{"status":"candidate"}' WHERE slug='portrait-fixture';
SELECT public.knowledge_editorial_action('approve_portrait','31000000-0000-0000-0000-000000000001','{"subject_and_rights_checked":true}');
DO $$ BEGIN
 IF (SELECT count(*) FROM public.image_assets)<>1 OR NOT EXISTS(SELECT 1 FROM public.image_assets WHERE source='flickr' AND metadata->>'unrelated'='retained' AND access_level='internal') THEN RAISE EXCEPTION 'existing asset provenance not corrected safely'; END IF;
 IF has_function_privilege('anon','api_private.knowledge_portrait_source(jsonb)','EXECUTE')
  OR has_function_privilege('authenticated','api_private.knowledge_portrait_source(jsonb)','EXECUTE')
  OR has_function_privilege('anon','api_private.knowledge_editorial_action(text,uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'private function grants broadened'; END IF;
END $$;
-- Retain Commons compatibility, including candidates with no explicit source field.
UPDATE public.knowledge_editorial_entries SET portrait=(portrait-'source')||'{"status":"candidate","source_url":"https://commons.wikimedia.org/wiki/File:Fixture.jpg","url":"https://upload.wikimedia.org/wikipedia/commons/a/ab/Fixture.jpg","license":"Public domain"}' WHERE slug='portrait-fixture';
SELECT public.knowledge_editorial_action('approve_portrait','31000000-0000-0000-0000-000000000001','{"subject_and_rights_checked":true}');
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.image_assets WHERE source='commons' AND access_level='internal') THEN RAISE EXCEPTION 'Commons review regressed'; END IF;
END $$;
SELECT 'licensed Flickr and Commons portrait review tests passed' AS result;
ROLLBACK;
