-- Marketplace tag engine: LLM cron batch fix.
-- 40-item LLM batches exceed the pg_net timeout (request killed mid-batch; the
-- driver hit this on the first backfill run). 20 items finish comfortably; give
-- pg_net headroom to 240s.
CREATE OR REPLACE FUNCTION public.run_marketplace_tag_llm(p_force boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_enabled boolean; v_req bigint; v_secret text;
BEGIN
  SELECT enabled INTO v_enabled FROM public.admin_automations WHERE slug='marketplace_tag_llm';
  IF (v_enabled IS DISTINCT FROM true) AND NOT p_force THEN RETURN jsonb_build_object('skipped',true,'reason','paused'); END IF;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='marketplace_tag_webhook_secret';
  v_req := net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/marketplace-tag-backfill',
    headers := jsonb_build_object('Content-Type','application/json','X-Webhook-Secret', v_secret),
    body := '{"sources":["extract","llm"],"batch_limit":20}'::jsonb, timeout_milliseconds := 240000);
  UPDATE public.admin_automations SET last_run_at=now(), last_run_status='success' WHERE slug='marketplace_tag_llm';
  RETURN jsonb_build_object('dispatched',true,'request_id',v_req,'sources',ARRAY['extract','llm']);
END; $$;
GRANT EXECUTE ON FUNCTION public.run_marketplace_tag_llm(boolean) TO service_role, authenticated;
