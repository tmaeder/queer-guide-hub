BEGIN;
SET LOCAL ROLE service_role;
CREATE FUNCTION pg_temp.mint_handoff(p_link uuid,p_app uuid,p_hash text,p_consent boolean DEFAULT true) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.create_redirect_native_handoff(p_hash,p_app,p_consent,s->>'fingerprint',p_link,'/go/handoff-test','utm_source=poster',NULL,NULL,'CH',NULL,302,'a','https://example.org/a','{"domain":"queer.guide"}')
 FROM (SELECT public.redirect_resolution_snapshot('queer.guide','handoff-test') s) snapshot;
$$;
CREATE FUNCTION pg_temp.consume_handoff(p_link uuid,p_app uuid,p_hash text,p_destination text DEFAULT 'https://example.org/a',p_variant text DEFAULT 'a') RETURNS uuid LANGUAGE sql AS $$
 SELECT public.consume_redirect_native_handoff(p_hash,p_app,'queer.guide','/go/handoff-test',true,s->>'fingerprint',p_destination,p_variant)
 FROM (SELECT public.redirect_resolution_snapshot('queer.guide','handoff-test') s) snapshot;
$$;
DO $$
DECLARE actor uuid:=gen_random_uuid();link_id uuid:=gen_random_uuid();app jsonb;fixture_app_id uuid;receipt jsonb;context jsonb;fingerprint text;click uuid;total integer;events integer;deadline timestamptz;
BEGIN
 INSERT INTO auth.users(id) VALUES(actor);INSERT INTO public.user_roles VALUES(actor,'admin');
 INSERT INTO public.redirects(id,type,slug,target,click_limit) VALUES(link_id,'SHORT','handoff-test','https://example.org/original',1);
 INSERT INTO public.redirect_link_policies(redirect_id,policy) VALUES(link_id,'{"track_conversions":true}');
 app:=public.redirect_native_app_admin(actor,'create',p_values=>'{"label":"Private internal app label","platform":"ios","appId":"ABCDE12345.org.example.handoff","enabled":true}');fixture_app_id:=(app->>'id')::uuid;
 IF pg_temp.mint_handoff(link_id,fixture_app_id,repeat('a',64)) IS NOT NULL THEN RAISE EXCEPTION 'Existing app opted into handoff automatically';END IF;
 UPDATE public.redirect_native_apps SET handoff_enabled=true WHERE id=fixture_app_id;
 IF pg_temp.mint_handoff(link_id,fixture_app_id,repeat('a',64),false) IS NOT NULL THEN RAISE EXCEPTION 'Denied consent minted receipt';END IF;
 IF (SELECT click_count FROM public.redirects WHERE id=link_id)<>0 THEN RAISE EXCEPTION 'Denied creation consumed quota';END IF;
 receipt:=pg_temp.mint_handoff(link_id,fixture_app_id,repeat('a',64));click:=(receipt->>'clickId')::uuid;
 IF click IS NULL OR (receipt->>'expiresAt')::timestamptz>clock_timestamp()+interval '24 hours' THEN RAISE EXCEPTION 'Missing or unbounded receipt';END IF;
 context:=public.redirect_native_handoff_context(repeat('a',64),fixture_app_id,'queer.guide','/go/handoff-test',true);
 IF context->>'clickId'<>click::text OR context->>'query'<>'utm_source=poster' OR context->>'variantId'<>'a' OR context->>'destination'<>'https://example.org/a' THEN RAISE EXCEPTION 'Original context lost';END IF;
 IF public.redirect_native_handoff_context(repeat('a',64),fixture_app_id,'queer.guide','/go/handoff-test',false) IS NOT NULL OR public.redirect_native_handoff_context(repeat('a',64),fixture_app_id,'www.queer.guide','/go/handoff-test',true) IS NOT NULL OR public.redirect_native_handoff_context(repeat('a',64),fixture_app_id,'queer.guide','/go/other-test',true) IS NOT NULL THEN RAISE EXCEPTION 'Consent/source scope bypass';END IF;
 IF pg_temp.mint_handoff(link_id,fixture_app_id,repeat('b',64)) IS NOT NULL THEN RAISE EXCEPTION 'Receipt creation bypassed ordinary quota';END IF;
 IF pg_temp.consume_handoff(link_id,fixture_app_id,repeat('a',64),'https://example.org/wrong') IS NOT NULL OR pg_temp.consume_handoff(link_id,fixture_app_id,repeat('a',64),'https://example.org/a','wrong') IS NOT NULL THEN RAISE EXCEPTION 'Changed target/cohort consumed receipt';END IF;
 -- A failed selection does not consume; resumption at the original quota cap
 -- succeeds without another event/counter update.
 IF pg_temp.consume_handoff(link_id,fixture_app_id,repeat('a',64)) IS DISTINCT FROM click OR pg_temp.consume_handoff(link_id,fixture_app_id,repeat('a',64)) IS NOT NULL THEN RAISE EXCEPTION 'Consumption/replay not single use';END IF;
 IF public.redirect_native_handoff_context(repeat('a',64),fixture_app_id,'queer.guide','/go/handoff-test',true) IS NOT NULL THEN RAISE EXCEPTION 'Consumed receipt still available';END IF;
 IF (SELECT click_count FROM public.redirects WHERE id=link_id)<>1 OR (SELECT count(*) FROM public.redirect_events WHERE redirect_id=link_id)<>1 THEN RAISE EXCEPTION 'Redemption recounted visit';END IF;
 UPDATE public.redirects SET click_limit=NULL WHERE id=link_id;
 -- A collision must roll the complete event+counter reservation back.
 BEGIN
  PERFORM pg_temp.mint_handoff(link_id,fixture_app_id,repeat('a',64));RAISE EXCEPTION 'Digest collision accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 IF (SELECT click_count FROM public.redirects WHERE id=link_id)<>1 OR (SELECT count(*) FROM public.redirect_events WHERE redirect_id=link_id)<>1 THEN RAISE EXCEPTION 'Collision leaked reservation';END IF;
 receipt:=pg_temp.mint_handoff(link_id,fixture_app_id,repeat('b',64));
 UPDATE public.redirect_native_apps SET label='Another private label' WHERE id=fixture_app_id;
 IF pg_temp.consume_handoff(link_id,fixture_app_id,repeat('b',64)) IS NOT NULL THEN RAISE EXCEPTION 'Binding revision change accepted';END IF;
 receipt:=pg_temp.mint_handoff(link_id,fixture_app_id,repeat('c',64));
 UPDATE public.redirects SET target='https://example.org/changed' WHERE id=link_id;
 IF pg_temp.consume_handoff(link_id,fixture_app_id,repeat('c',64)) IS NOT NULL OR public.redirect_native_handoff_context(repeat('c',64),fixture_app_id,'queer.guide','/go/handoff-test',true) IS NOT NULL THEN RAISE EXCEPTION 'Changed routing accepted';END IF;
 receipt:=pg_temp.mint_handoff(link_id,fixture_app_id,repeat('d',64));
 UPDATE public.redirect_link_policies SET password_hash='{"rotated":"hash"}' WHERE redirect_id=link_id;
 IF pg_temp.consume_handoff(link_id,fixture_app_id,repeat('d',64)) IS NOT NULL THEN RAISE EXCEPTION 'New password bypassed';END IF;
 receipt:=pg_temp.mint_handoff(link_id,fixture_app_id,repeat('e',64));
 DELETE FROM public.user_roles WHERE user_id=actor;
 IF pg_temp.consume_handoff(link_id,fixture_app_id,repeat('e',64)) IS NOT NULL THEN RAISE EXCEPTION 'Revoked publisher accepted';END IF;
 INSERT INTO public.user_roles VALUES(actor,'admin');
 UPDATE public.redirect_link_policies SET policy='{"track_conversions":true,"cloaked":true}' WHERE redirect_id=link_id;
 IF pg_temp.mint_handoff(link_id,fixture_app_id,repeat('f',64)) IS NOT NULL THEN RAISE EXCEPTION 'Cloaked receipt minted';END IF;
 UPDATE public.redirect_link_policies SET policy='{}' WHERE redirect_id=link_id;
 IF pg_temp.mint_handoff(link_id,fixture_app_id,repeat('f',64)) IS NOT NULL THEN RAISE EXCEPTION 'Tracking-disabled receipt minted';END IF;
 UPDATE public.redirect_link_policies SET policy='{"track_conversions":true}' WHERE redirect_id=link_id;
 UPDATE public.redirects SET end_at=clock_timestamp()+interval '1 hour' WHERE id=link_id RETURNING end_at INTO deadline;
 receipt:=pg_temp.mint_handoff(link_id,fixture_app_id,repeat('f',64));
 IF (receipt->>'expiresAt')::timestamptz IS DISTINCT FROM deadline THEN RAISE EXCEPTION 'Receipt outlived link expiration';END IF;
 UPDATE public.redirect_link_policies SET policy=jsonb_build_object('track_conversions',true,'experiment',jsonb_build_object('ends_at',clock_timestamp()+interval '10 minutes')) WHERE redirect_id=link_id RETURNING (policy->'experiment'->>'ends_at')::timestamptz INTO deadline;
 receipt:=pg_temp.mint_handoff(link_id,fixture_app_id,repeat('1',64));
 IF (receipt->>'expiresAt')::timestamptz IS DISTINCT FROM deadline THEN RAISE EXCEPTION 'Receipt outlived experiment';END IF;
 UPDATE public.redirect_native_handoff_receipts SET created_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour' WHERE token_hash IN(repeat('f',64),repeat('1',64));
 IF pg_temp.consume_handoff(link_id,fixture_app_id,repeat('1',64)) IS NOT NULL THEN RAISE EXCEPTION 'Expired receipt consumed';END IF;
 IF public.cleanup_redirect_native_handoffs(1)<>1 OR public.cleanup_redirect_native_handoffs(1)<>1 OR public.cleanup_redirect_native_handoffs(1)<>0 THEN RAISE EXCEPTION 'Cleanup bound ignored';END IF;
 SELECT click_count INTO total FROM public.redirects WHERE id=link_id;SELECT count(*) INTO events FROM public.redirect_events WHERE redirect_id=link_id;
 IF total<>events THEN RAISE EXCEPTION 'Receipt lifecycle altered aggregate/event consistency';END IF;
 DELETE FROM public.redirect_events WHERE click_id=(SELECT click_id FROM public.redirect_native_handoff_receipts WHERE token_hash=repeat('b',64));
 IF EXISTS(SELECT FROM public.redirect_native_handoff_receipts WHERE token_hash=repeat('b',64)) THEN RAISE EXCEPTION 'Event delete retained receipt';END IF;
 DELETE FROM public.redirects WHERE id=link_id;
 IF EXISTS(SELECT FROM public.redirect_native_handoff_receipts WHERE redirect_id=link_id) THEN RAISE EXCEPTION 'Link delete retained receipt';END IF;
 IF has_table_privilege('anon','public.redirect_native_handoff_receipts','SELECT') OR has_table_privilege('authenticated','public.redirect_native_handoff_receipts','INSERT') OR has_function_privilege('anon','public.redirect_native_handoff_context(text,uuid,text,text,boolean)','EXECUTE') OR has_function_privilege('authenticated','public.consume_redirect_native_handoff(text,uuid,text,text,boolean,text,text,text)','EXECUTE') THEN RAISE EXCEPTION 'Receipts exposed through Data API';END IF;
END $$;
ROLLBACK;
