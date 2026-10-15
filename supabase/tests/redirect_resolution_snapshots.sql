BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE link_id uuid:=gen_random_uuid(); snapshot jsonb; fresh jsonb; click uuid; changed record; original public.redirects; version text;
BEGIN
 INSERT INTO public.redirects(id,type,slug,target,click_limit) VALUES(link_id,'SHORT','snapshot-test','https://example.org/original',4);
 snapshot:=public.redirect_resolution_snapshot('queer.guide','snapshot-test');
 IF snapshot->'link'->>'id'<>link_id::text OR snapshot->'settings'->'policy'<>'{}' OR snapshot->>'fingerprint' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Incomplete snapshot';END IF;
 IF public.redirect_resolution_snapshot('www.queer.guide','snapshot-test')<>snapshot OR public.redirect_resolution_snapshot('queer.guide','missing-test') IS NOT NULL OR public.redirect_resolution_snapshot('unavailable.example','snapshot-test') IS NOT NULL THEN RAISE EXCEPTION 'Snapshot namespace mismatch';END IF;
 version:=snapshot->>'fingerprint';
 click:=public.record_redirect_snapshot_visit(version,link_id,'/go/snapshot-test','utm_source=test',NULL,NULL,'CH',NULL,302,NULL,'https://example.org/original','{"domain":"queer.guide"}');
 IF click IS NULL OR (SELECT click_count FROM public.redirects WHERE redirects.id=link_id)<>1 OR (SELECT count(*) FROM public.redirect_events WHERE redirect_id=link_id)<>1 THEN RAISE EXCEPTION 'Visit not reserved exactly once';END IF;
 UPDATE public.redirects SET notes='Admin annotation',updated_at=clock_timestamp() WHERE redirects.id=link_id;
 fresh:=public.redirect_resolution_snapshot('queer.guide','snapshot-test');
 IF fresh->>'fingerprint'<>version THEN RAISE EXCEPTION 'Counter or unrelated metadata invalidated routing';END IF;
 IF public.record_redirect_snapshot_visit(version,link_id,'/go/wrong-slug',NULL,NULL,NULL,NULL,NULL,302,NULL,'https://example.org/original','{"domain":"queer.guide"}') IS NOT NULL THEN RAISE EXCEPTION 'Different source path counted';END IF;
 IF public.record_redirect_snapshot_visit(version,link_id,'/go/snapshot-test',NULL,NULL,NULL,NULL,NULL,302,NULL,'https://example.org/original','{"domain":"wrong.example"}') IS NOT NULL THEN RAISE EXCEPTION 'Different source host counted';END IF;
 SELECT * INTO original FROM public.redirects WHERE redirects.id=link_id;
 FOR changed IN SELECT * FROM (VALUES
  ('target','"https://example.org/changed"'::jsonb),('status_code','307'),('is_enabled','false'),
  ('start_at','"2099-01-01T00:00:00Z"'),('end_at','"2099-02-01T00:00:00Z"'),
  ('query_mode','"DROP"'),('query_override','{"campaign":"other"}'),('utm_defaults','{"utm_source":"other"}'),
  ('click_limit','9'),('slug','"changed-test"')
 ) fields(name,value) LOOP
  EXECUTE format('UPDATE public.redirects SET %I=(jsonb_populate_record(NULL::public.redirects,$1)).%I WHERE id=$2',changed.name,changed.name) USING jsonb_build_object(changed.name,changed.value),link_id;
  IF public.record_redirect_snapshot_visit(version,link_id,'/go/snapshot-test',NULL,NULL,NULL,NULL,NULL,302,NULL,'https://example.org/original','{"domain":"queer.guide"}') IS NOT NULL THEN RAISE EXCEPTION 'Stale % accepted',changed.name;END IF;
  EXECUTE format('UPDATE public.redirects SET %I=($1).%I WHERE id=$2',changed.name,changed.name) USING original,link_id;
 END LOOP;
 -- Adding a policy after a previously unprotected snapshot must also fail.
 INSERT INTO public.redirect_link_policies(redirect_id,policy,password_hash) VALUES(link_id,'{"track_conversions":true}',NULL);
 IF public.record_redirect_snapshot_visit(version,link_id,'/go/snapshot-test',NULL,NULL,NULL,NULL,NULL,302,NULL,'https://example.org/original','{"domain":"queer.guide"}') IS NOT NULL THEN RAISE EXCEPTION 'New policy did not invalidate snapshot';END IF;
 fresh:=public.redirect_resolution_snapshot('queer.guide','snapshot-test');version:=fresh->>'fingerprint';
 UPDATE public.redirect_link_policies SET password_hash='{"test":"new password"}' WHERE redirect_id=link_id;
 IF public.record_redirect_snapshot_visit(version,link_id,'/go/snapshot-test',NULL,NULL,NULL,NULL,NULL,302,NULL,'https://example.org/original','{"domain":"queer.guide"}') IS NOT NULL THEN RAISE EXCEPTION 'New password accepted old authorization';END IF;
 fresh:=public.redirect_resolution_snapshot('queer.guide','snapshot-test');
 IF fresh->'settings'->'password_hash'<>'{"test":"new password"}' THEN RAISE EXCEPTION 'Snapshot omitted password';END IF;
 version:=fresh->>'fingerprint';
 -- Fingerprints remain stable across per-session time zones, including dates.
 UPDATE public.redirects SET start_at='2020-01-01T00:00:00Z',end_at='2099-02-01T00:00:00Z' WHERE redirects.id=link_id;
 fresh:=public.redirect_resolution_snapshot('queer.guide','snapshot-test');version:=fresh->>'fingerprint';
 PERFORM set_config('TimeZone','Pacific/Auckland',true);
 IF public.redirect_resolution_snapshot('queer.guide','snapshot-test')->>'fingerprint'<>version THEN RAISE EXCEPTION 'Time zone changed fingerprint';END IF;
 UPDATE public.redirect_link_policies SET password_hash='{"test":"different password"}' WHERE redirect_id=link_id;
 IF public.record_redirect_snapshot_visit(version,link_id,'/go/snapshot-test',NULL,NULL,NULL,NULL,NULL,302,NULL,'https://example.org/original','{"domain":"queer.guide"}') IS NOT NULL THEN RAISE EXCEPTION 'Rotated password accepted stale authorization';END IF;
 fresh:=public.redirect_resolution_snapshot('queer.guide','snapshot-test');version:=fresh->>'fingerprint';
 DELETE FROM public.redirect_link_policies WHERE redirect_id=link_id;
 IF public.record_redirect_snapshot_visit(version,link_id,'/go/snapshot-test',NULL,NULL,NULL,NULL,NULL,302,NULL,'https://example.org/original','{"domain":"queer.guide"}') IS NOT NULL THEN RAISE EXCEPTION 'Deleted policy accepted stale authorization';END IF;
 fresh:=public.redirect_resolution_snapshot('queer.guide','snapshot-test');version:=fresh->>'fingerprint';
 FOR i IN 1..3 LOOP
  IF public.record_redirect_snapshot_visit(version,link_id,'/go/snapshot-test',NULL,NULL,NULL,NULL,NULL,302,NULL,'https://example.org/original','{"domain":"queer.guide"}') IS NULL THEN RAISE EXCEPTION 'Same policy incorrectly rejected next visit';END IF;
 END LOOP;
 IF public.record_redirect_snapshot_visit(version,link_id,'/go/snapshot-test',NULL,NULL,NULL,NULL,NULL,302,NULL,'https://example.org/original','{"domain":"queer.guide"}') IS NOT NULL THEN RAISE EXCEPTION 'Snapshot bypassed quota';END IF;
 IF (SELECT click_count FROM public.redirects WHERE redirects.id=link_id)<>4 OR (SELECT count(*) FROM public.redirect_events WHERE redirect_id=link_id)<>4 THEN RAISE EXCEPTION 'Rejected visits changed counter/events';END IF;
 IF has_function_privilege('anon','public.redirect_resolution_snapshot(text,text,boolean)','EXECUTE') OR has_function_privilege('authenticated','public.redirect_resolution_fingerprint(public.redirects,jsonb,jsonb)','EXECUTE') OR has_function_privilege('anon','public.record_redirect_snapshot_visit(text,uuid,text,text,text,text,text,text,integer,text,text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Private resolution state exposed';END IF;
 BEGIN
  PERFORM public.record_redirect_snapshot_visit(NULL,link_id,'/go/snapshot-test',NULL,NULL,NULL,NULL,NULL,302,NULL,'https://example.org/original','{}');RAISE EXCEPTION 'Missing fingerprint accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 DELETE FROM public.redirects WHERE redirects.id=link_id;
 IF public.record_redirect_snapshot_visit(version,link_id,'/go/snapshot-test',NULL,NULL,NULL,NULL,NULL,302,NULL,'https://example.org/original','{"domain":"queer.guide"}') IS NOT NULL THEN RAISE EXCEPTION 'Deleted link counted';END IF;
END $$;
ROLLBACK;
