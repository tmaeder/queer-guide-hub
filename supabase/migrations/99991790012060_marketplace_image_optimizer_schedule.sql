-- Complete the canonical image state machine with atomic claims and a
-- scheduled optimizer. The gallery worker already produces pending assets;
-- this worker drains them and records factual dimensions/failure classes.

CREATE OR REPLACE FUNCTION public.marketplace_claim_image_assets(p_limit integer DEFAULT 15)
RETURNS TABLE(id uuid,url text,format text,metadata jsonb)
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  WITH due AS MATERIALIZED (
    SELECT ia.id FROM public.image_assets ia
    WHERE ia.status='active' AND ia.optimization_status='pending'
      AND EXISTS(SELECT 1 FROM public.image_asset_links ial
        WHERE ial.asset_id=ia.id AND ial.entity_type='marketplace_listing')
    ORDER BY ia.created_at,ia.id LIMIT greatest(1,least(p_limit,50))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.image_assets ia SET optimization_status='processing',
    metadata=jsonb_set(coalesce(ia.metadata,'{}'::jsonb),'{processing_started_at}',to_jsonb(now()),true)
  FROM due WHERE ia.id=due.id
  RETURNING ia.id,ia.url,ia.format,ia.metadata;
$$;
REVOKE ALL ON FUNCTION public.marketplace_claim_image_assets(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_claim_image_assets(integer) TO service_role;

UPDATE public.admin_automations SET schedule='0 */6 * * *',
  action=jsonb_build_object('type','cron','jobname','marketplace-image-retry',
    'command','SELECT public.run_marketplace_quality_worker(''marketplace_image_retry'',1000);')
WHERE slug='marketplace_image_retry';

INSERT INTO public.admin_automations
  (slug,name,description,managed_by,enabled,"trigger",conditions,action,schedule,auto_pause_threshold)
VALUES('marketplace_image_optimize','Marketplace image optimizer',
  'Claims and optimizes marketplace image assets without duplicate concurrent work.',
  'system',true,'{"type":"schedule"}'::jsonb,'[]'::jsonb,
  jsonb_build_object('type','cron','jobname','marketplace-image-optimize','command',$cmd$
    SELECT net.http_post(url:='https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/optimize-images-batch',
      headers:=jsonb_build_object('Content-Type','application/json','X-Internal-Secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')),
      body:='{"batch_size":15,"entity_type":"marketplace_listing"}'::jsonb,timeout_milliseconds:=120000);
  $cmd$),'*/2 * * * *',3)
ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description,
  enabled=excluded.enabled,action=excluded.action,schedule=excluded.schedule,
  auto_pause_threshold=excluded.auto_pause_threshold;

SELECT public.sync_automations_to_cron(true);
