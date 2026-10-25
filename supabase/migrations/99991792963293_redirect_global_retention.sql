-- Retention is an internal service task, independent of account workspace headers
-- and workspace activation. Bounded candidates carry their immutable source
-- workspace; QR deletion completion still requires the exact current lease and
-- rechecks every live reference. No account or browser grants are added.
CREATE OR REPLACE FUNCTION public.cleanup_redirect_native_handoffs(p_limit integer DEFAULT 500)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE removed integer;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid cleanup bound' USING ERRCODE='22023';END IF;
 DELETE FROM public.redirect_native_handoff_receipts WHERE token_hash IN(SELECT token_hash FROM public.redirect_native_handoff_receipts WHERE expires_at<=clock_timestamp() ORDER BY expires_at LIMIT p_limit FOR UPDATE SKIP LOCKED);
 GET DIAGNOSTICS removed=ROW_COUNT;RETURN removed;
END $function$;

CREATE OR REPLACE FUNCTION public.claim_redirect_qr_asset_cleanup(p_limit integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE asset public.redirect_qr_assets;result jsonb:='[]';
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(471983093);
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Invalid cleanup batch' USING ERRCODE='22023';END IF;
 FOR asset IN SELECT * FROM public.redirect_qr_assets a WHERE next_cleanup_at<=clock_timestamp() AND NOT EXISTS(SELECT FROM public.redirect_qr_styles WHERE workspace_id=a.workspace_id AND logo_asset_id=a.id)
 AND NOT EXISTS(SELECT FROM public.redirect_qr_image_links WHERE workspace_id=a.workspace_id AND logo_asset_id=a.id)
 AND NOT EXISTS(SELECT FROM public.redirect_password_branding WHERE workspace_id=a.workspace_id AND logo_asset_id=a.id)
 AND (state IN('active','deleted') OR state='pending' AND expires_at<=clock_timestamp() OR state='deleting' AND lease_until<=clock_timestamp()) ORDER BY next_cleanup_at,id LIMIT p_limit FOR UPDATE SKIP LOCKED LOOP
  UPDATE public.redirect_qr_assets SET state='deleting',lease=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes',attempts=least(attempts+1,1000000) WHERE workspace_id=asset.workspace_id AND id=asset.id RETURNING * INTO asset;
  result:=result||jsonb_build_array(jsonb_build_object('id',asset.id,'lease',asset.lease,'key',asset.id::text||CASE WHEN asset.mime='image/png' THEN '.png' ELSE '.jpg' END));
 END LOOP;
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.finish_redirect_qr_asset_cleanup(p_id uuid, p_lease uuid, p_success boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE asset public.redirect_qr_assets;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(471983093);
 SELECT * INTO asset FROM public.redirect_qr_assets WHERE id=p_id FOR UPDATE;
 IF asset.id IS NULL OR asset.state<>'deleting' OR p_lease IS DISTINCT FROM asset.lease OR asset.lease_until<=clock_timestamp() OR EXISTS(SELECT FROM public.redirect_qr_styles WHERE workspace_id=asset.workspace_id AND logo_asset_id=p_id) OR EXISTS(SELECT FROM public.redirect_qr_image_links WHERE workspace_id=asset.workspace_id AND logo_asset_id=p_id) OR EXISTS(SELECT FROM public.redirect_password_branding WHERE workspace_id=asset.workspace_id AND logo_asset_id=p_id) THEN RETURN false;END IF;
 UPDATE public.redirect_qr_assets SET state=CASE WHEN p_success IS TRUE THEN 'deleted' ELSE 'deleting' END,
  last_deleted_at=CASE WHEN p_success IS TRUE THEN clock_timestamp() ELSE last_deleted_at END,
  next_cleanup_at=clock_timestamp()+CASE WHEN p_success IS TRUE THEN CASE WHEN asset.last_deleted_at IS NULL THEN interval '1 day' ELSE interval '30 days' END ELSE make_interval(secs=>least(3600,30*power(2,least(asset.attempts,6))::integer)) END,
  lease=NULL,lease_until=CASE WHEN p_success IS TRUE THEN NULL ELSE clock_timestamp() END,
  attempts=CASE WHEN p_success IS TRUE THEN 0 ELSE attempts END,last_error=CASE WHEN p_success IS TRUE THEN NULL ELSE 'Storage cleanup failed; retry scheduled' END WHERE workspace_id=asset.workspace_id AND id=p_id;
 RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.prune_redirect_qr_image_history(p_limit integer DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE budget_before timestamptz:=clock_timestamp()-interval '2 days';draft_before timestamptz:=clock_timestamp()-interval '1 day';image_before timestamptz:=clock_timestamp()-interval '90 days';events integer;images integer;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid retention batch' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(471983093);
 DELETE FROM public.redirect_qr_image_creation_log q USING(SELECT workspace_id,id FROM public.redirect_qr_image_creation_log WHERE created_at<budget_before ORDER BY created_at,id LIMIT p_limit FOR UPDATE SKIP LOCKED) old WHERE q.workspace_id=old.workspace_id AND q.id=old.id;
 GET DIAGNOSTICS events=ROW_COUNT;
 DELETE FROM public.redirect_qr_image_links q USING(SELECT workspace_id,id FROM public.redirect_qr_image_links WHERE (least(revoked_at,expires_at)<image_before OR publication_state='pending' AND draft_expires_at<draft_before) ORDER BY least(revoked_at,expires_at),id LIMIT p_limit FOR UPDATE SKIP LOCKED) old WHERE q.workspace_id=old.workspace_id AND q.id=old.id;
 GET DIAGNOSTICS images=ROW_COUNT;
 RETURN jsonb_build_object('events',events,'images',images);
END $function$;
