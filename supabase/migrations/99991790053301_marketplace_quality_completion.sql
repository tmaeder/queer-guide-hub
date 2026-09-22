-- Complete the production marketplace remediation with bounded acceleration,
-- truthful accounting, and automatic return to steady-state schedules.

SET lock_timeout = '15s';

SET statement_timeout = '120s';

-- Missing descriptions were never claimable: the old refill predicate
-- required a description longer than 20 characters, making its source-payload
-- recovery branch unreachable. Priority zero visits each missing row once.
CREATE OR REPLACE FUNCTION public.marketplace_enhance_refill(p_max integer DEFAULT 5000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_n integer;
BEGIN
  WITH boiler AS (
    SELECT md5(lower(btrim(description))) AS h
    FROM public.marketplace_listings
    WHERE status='active' AND coalesce(btrim(description),'')<>''
    GROUP BY 1 HAVING count(*)>5
  ), cand AS (
    SELECT ml.id,
      CASE
        WHEN length(coalesce(btrim(ml.description),''))<=20 THEN 0
        WHEN md5(lower(btrim(ml.description))) IN(SELECT h FROM boiler) THEN 1
        WHEN length(btrim(ml.description))<80 THEN 2
        ELSE 3
      END::smallint priority
    FROM public.marketplace_listings ml
    WHERE ml.status='active' AND (
      (length(coalesce(btrim(ml.description),''))<=20
        AND NOT (coalesce(ml.description_i18n,'{}'::jsonb) ? '_recovery_checked_at'))
      OR
      (length(coalesce(btrim(ml.description),''))>20
        AND NOT (coalesce(ml.description_i18n,'{}'::jsonb) ? '_enhanced_at'))
    )
    ORDER BY 2,ml.updated_at,ml.id LIMIT greatest(1,p_max)
  )
  INSERT INTO public.marketplace_enhance_queue(listing_id,priority)
  SELECT id,priority FROM cand ON CONFLICT(listing_id) DO NOTHING;
  GET DIAGNOSTICS v_n=ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.marketplace_enhance_refill(integer) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.marketplace_enhance_refill(integer) TO service_role;

-- Count every actual semantic taxonomy event, not just the 1% canary.
CREATE OR REPLACE FUNCTION public.marketplace_rollout_count_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.dimension='taxonomy' AND NEW.classifier_version='marketplace-taxonomy-v4'
     AND NEW.rollback_of IS NULL THEN
    UPDATE public.marketplace_classifier_rollouts
    SET changed_count=changed_count+1
    WHERE classifier_version='marketplace-taxonomy-v4';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marketplace_rollout_count_event_trg ON public.marketplace_quality_events;

CREATE TRIGGER marketplace_rollout_count_event_trg
AFTER INSERT ON public.marketplace_quality_events FOR EACH ROW
EXECUTE FUNCTION public.marketplace_rollout_count_event();

UPDATE public.marketplace_classifier_rollouts r SET
  processed_count=(SELECT count(*) FROM public.marketplace_listings WHERE status='active' AND taxonomy_version>=4),
  changed_count=(SELECT count(*) FROM public.marketplace_quality_events e
    WHERE e.dimension='taxonomy' AND e.classifier_version='marketplace-taxonomy-v4'
      AND e.rollback_of IS NULL AND e.rolled_back_at IS NULL)
WHERE r.classifier_version='marketplace-taxonomy-v4';

-- Teach the existing generated-column function every canonical adult group.
-- The source category remains in marketplace_listing_sources.raw; the small
-- contradiction corpus below also records its previous value in attributes.
CREATE OR REPLACE FUNCTION public.marketplace_content_rating(
  p_subcategory text,p_title text,p_description text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public,extensions AS $$
  WITH s AS (
    SELECT lower(regexp_replace(coalesce(p_subcategory,''),'[\s\-]+','_','g')) slug,
      lower(coalesce(p_title,'')||' '||coalesce(p_description,'')) txt
  ), ranked AS (
    SELECT greatest(
      CASE
        WHEN slug IN('sex_toys','anal_toys','cock_rings','cock_rings_and_stretchers',
          'dildos','vibrators','masturbators','pumps_and_enlargement','chastity',
          'cage','bdsm_and_bondage','bondage','bdsm','butt_plugs','penis_rings',
          'penis_pumps','pup_and_pet_play') THEN 4
        WHEN slug IN('fetish_wear','fetish_gear','lubricants','condoms','adult_magazines',
          'adult_digital_magazines','adult_photo_books','adult_art_prints',
          'adult_zines','adult_photography','adult_polaroids','adult_subscriptions') THEN 3
        WHEN slug IN('underwear_and_swimwear','underwear','swimwear') THEN 2
        ELSE 1 END,
      CASE
        WHEN txt ~ '(dildo|butt ?plug|silicone plug|vibrat|cock ?ring|ball ?stretch|chastity|bondage|\mbdsm\M|fisting|prostate|masturbat|fleshlight|\mstrap[- ]?ons?\M|anal (plug|bead|douche|hook|fastener|speculum)|nipple clamp|urethral|\me[- ]?stim|\mestim\M|stroker|onanism|analplug|analkette|analkugel|analdusche|penisring|hodenring|keuschheit|peniskäfig|handschellen|peitsche|\mfessel|\mknebel\M|nippelklemme|liebeskugel|penispumpe|prostata|umschnall|spreizstange|flogger|elastrator|\mwhips?\M|spreader ?bar|\mball ?gag|\mgimp\M|humbler|hogtie|\mcock\M|penis[- ]?extender|penisvergr|klitoris|clitoris|clitoral|stimulator|love ?egg|liebesei|sexspielzeug|lovetoys?|\mg[- ]?spot|\mg[- ]?punkt)' THEN 4
        WHEN txt ~ '(fetish|leather harness|pup hood|puppy hood|\mlube\M|lubricant|\menema|latex (gear|suit)|rubber (gear|suit)|erotic|\mkink\M|fetisch|gleitgel|gleitmittel|catsuit|wetlook|erotik|\manal\M|(silicone|wooden|leather|boot|spanking) paddle|nose hook)' THEN 3
        WHEN txt ~ '(jockstrap|jock strap|\mthong\M|lingerie|harness|\msexy\M|dessous|\mtanga\M|reizwäsche|orgasm)' THEN 2
        ELSE 1 END) rank FROM s
  )
  SELECT CASE rank WHEN 4 THEN 'explicit' WHEN 3 THEN 'adult'
    WHEN 2 THEN 'suggestive' ELSE 'sfw' END FROM ranked;
$$;

INSERT INTO public.marketplace_quality_events
  (listing_id,dimension,previous_value,new_value,classifier_version,confidence)
SELECT id,'safety',to_jsonb(content_rating),
  to_jsonb(public.marketplace_content_rating(ml.subcategory_group,ml.title,ml.description)),
  'marketplace-content-rating-v4',coalesce(taxonomy_confidence,0.95)
FROM public.marketplace_listings ml
WHERE ml.status='active' AND ml.content_rating='sfw'
  AND ml.subcategory_group IN
    ('dildos','vibrators','anal_toys','cock_rings','chastity','masturbators','sex_toys',
     'bondage','bdsm','butt_plugs','penis_rings','penis_pumps','fetish_wear','lubricants','condoms')
  AND NOT EXISTS (
    SELECT 1 FROM public.marketplace_quality_events e
    WHERE e.listing_id=ml.id AND e.dimension='safety'
      AND e.classifier_version='marketplace-content-rating-v4'
      AND e.rollback_of IS NULL
  );

UPDATE public.marketplace_listings ml SET
  attributes=coalesce(ml.attributes,'{}'::jsonb)||jsonb_build_object(
    '_quality_original_subcategory',ml.subcategory,
    '_quality_safety_normalized_at',now(),
    '_quality_safety_version','marketplace-content-rating-v4'),
  subcategory=ml.subcategory_group
WHERE ml.status='active' AND ml.content_rating='sfw'
  AND ml.subcategory_group IN
    ('dildos','vibrators','anal_toys','cock_rings','chastity','masturbators','sex_toys',
     'bondage','bdsm','butt_plugs','penis_rings','penis_pumps','fetish_wear','lubricants','condoms');

DELETE FROM public.search_documents sd USING public.marketplace_listings ml
WHERE sd.entity_type='marketplace' AND sd.entity_id=ml.id
  AND ml.content_rating NOT IN('sfw','suggestive');

INSERT INTO public.search_reindex_queue(entity_type,entity_id)
SELECT 'marketplace',ml.id FROM public.marketplace_listings ml
WHERE ml.status='active' AND ml.content_rating IN('sfw','suggestive')
ON CONFLICT DO NOTHING;

-- Snapshot rows are the admin panel source of truth. Derive ETA from the
-- actual observation window (not an assumed full 24 hours) and include every
-- marketplace worker in the stalled count.
CREATE OR REPLACE FUNCTION public.marketplace_normalize_quality_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_examined numeric; v_first timestamptz; v_hours numeric; v_rate numeric; v_stalled integer;
BEGIN
  SELECT coalesce(sum(items_examined),0),min(started_at) INTO v_examined,v_first
  FROM public.admin_automation_runs
  WHERE automation_slug='marketplace_variant_backfill'
    AND started_at>now()-interval '24 hours' AND finished_at IS NOT NULL;
  v_hours:=greatest(1,least(24,extract(epoch FROM(now()-coalesce(v_first,now())))/3600));
  v_rate:=greatest(1,v_examined/v_hours);
  SELECT count(*) INTO v_stalled FROM public.admin_automations a
  WHERE a.slug IN('marketplace_variant_backfill','marketplace_link_checker',
    'marketplace_description_enhance','marketplace_image_retry','marketplace_image_optimize',
    'marketplace_taxonomy_classify','marketplace_taxonomy_v3_backfill')
    AND a.consecutive_failures>=a.auto_pause_threshold;
  NEW.stats:=jsonb_set(NEW.stats,'{variant_estimated_drain_hours}',
    to_jsonb(ceil(coalesce((NEW.stats->>'attributes_pending')::numeric,0)/v_rate)),true);
  NEW.stats:=jsonb_set(NEW.stats,'{workers_no_progress_3}',to_jsonb(v_stalled),true);
  NEW.stats:=NEW.stats||jsonb_build_object(
    'variant_observed_hourly_rate',round(v_rate),
    'taxonomy_model_enabled',coalesce((SELECT enabled::int FROM public.admin_automations WHERE slug='marketplace_taxonomy_classify'),0),
    'taxonomy_model_failures',coalesce((SELECT consecutive_failures FROM public.admin_automations WHERE slug='marketplace_taxonomy_classify'),0),
    'image_optimizer_enabled',coalesce((SELECT enabled::int FROM public.admin_automations WHERE slug='marketplace_image_optimize'),0),
    'image_optimizer_failures',coalesce((SELECT consecutive_failures FROM public.admin_automations WHERE slug='marketplace_image_optimize'),0));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marketplace_normalize_quality_snapshot_trg ON public.marketplace_quality_snapshots;

CREATE TRIGGER marketplace_normalize_quality_snapshot_trg
BEFORE INSERT ON public.marketplace_quality_snapshots FOR EACH ROW
EXECUTE FUNCTION public.marketplace_normalize_quality_snapshot();

-- Alert directly from registry state so a gateway/auth failure is visible even
-- when the worker examined zero domain rows.
CREATE OR REPLACE FUNCTION public.marketplace_worker_registry_alert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.slug NOT LIKE 'marketplace_%' THEN RETURN NEW; END IF;
  IF NEW.consecutive_failures>=NEW.auto_pause_threshold THEN
    INSERT INTO public.marketplace_quality_alerts
      (alert_type,dedupe_key,severity,message,details)
    VALUES('worker_stalled','worker:'||NEW.slug,'critical',
      NEW.slug||' reached its failure threshold',
      jsonb_build_object('failures',NEW.consecutive_failures,'status',NEW.last_run_status))
    ON CONFLICT(dedupe_key) WHERE resolved_at IS NULL DO UPDATE
      SET last_seen_at=now(),message=excluded.message,details=excluded.details;
  ELSIF NEW.consecutive_failures=0 AND NEW.last_run_status IN('success','partial') THEN
    UPDATE public.marketplace_quality_alerts SET resolved_at=now()
    WHERE dedupe_key='worker:'||NEW.slug AND resolved_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marketplace_worker_registry_alert_trg ON public.admin_automations;

CREATE TRIGGER marketplace_worker_registry_alert_trg
AFTER UPDATE OF enabled,consecutive_failures,last_run_status ON public.admin_automations
FOR EACH ROW EXECUTE FUNCTION public.marketplace_worker_registry_alert();

-- Budget-compatible inference limits. Taxonomy is a finite completion drain;
-- descriptions continue across UTC windows without treating budget deferral as
-- a failure.
INSERT INTO public.llm_budget(caller_key,daily_cap,spent_today,window_start)
VALUES('marketplace-taxonomy-classify',5000,0,current_date)
ON CONFLICT(caller_key) DO UPDATE SET daily_cap=excluded.daily_cap,
  spent_today=CASE WHEN public.llm_budget.window_start<current_date THEN 0 ELSE public.llm_budget.spent_today END,
  window_start=current_date,updated_at=now();

UPDATE public.admin_automations SET
  enabled=true,consecutive_failures=0,last_run_status=NULL,schedule='*/2 * * * *',
  action=jsonb_build_object('type','cron','jobname','marketplace-taxonomy-classify','command',$cmd$
    SELECT net.http_post(
      url:='https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/marketplace-taxonomy-classify',
      headers:=jsonb_build_object('Content-Type','application/json','X-Internal-Secret',
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')),
      body:='{"batch_size":25}'::jsonb,timeout_milliseconds:=120000);
  $cmd$),updated_at=now()
WHERE slug='marketplace_taxonomy_classify';

UPDATE public.admin_automations SET
  enabled=true,consecutive_failures=0,last_run_status=NULL,schedule='0 * * * *',
  action=jsonb_build_object('type','cron','jobname','marketplace_description_enhance','command',$cmd$
    SELECT net.http_post(
      url:='https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/marketplace-description-enhance',
      headers:=jsonb_build_object('Content-Type','application/json','X-Internal-Secret',
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')),
      body:='{"batch_size":30}'::jsonb,timeout_milliseconds:=120000);
  $cmd$),updated_at=now()
WHERE slug='marketplace_description_enhance';

UPDATE public.admin_automations SET schedule='*/5 * * * *',updated_at=now()
WHERE slug='marketplace_link_checker';

UPDATE public.admin_automations SET schedule='* * * * *',updated_at=now()
WHERE slug='marketplace_image_optimize';

UPDATE public.admin_automations SET schedule='0 */2 * * *',updated_at=now()
WHERE slug='marketplace_image_retry';

UPDATE public.admin_automations SET
  action=jsonb_set(action,'{command}',to_jsonb(replace(action->>'command',
    '{"batch_limit":50,"auto_scale":false}','{"batch_limit":50,"auto_scale":true}'))),
  updated_at=now()
WHERE slug='marketplace_variant_backfill';

-- Automatic return to steady state once each completion gate is met.
CREATE OR REPLACE FUNCTION public.marketplace_quality_completion_supervisor()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_active integer; v_attr integer; v_stale integer; v_healthy integer;
  v_tax_pending integer; v_other integer; v_changed boolean:=false;
BEGIN
  SELECT count(*),count(*) FILTER(WHERE attributes_extracted_at IS NULL),
    count(*) FILTER(WHERE (link_checked_at IS NULL OR link_checked_at<now()-interval '30 days')
      AND (last_seen_at IS NULL OR last_seen_at<now()-interval '30 days')),
    count(*) FILTER(WHERE department='other'),
    count(*) FILTER(WHERE taxonomy_version<4)
  INTO v_active,v_attr,v_stale,v_other,v_tax_pending
  FROM public.marketplace_listings WHERE status='active';
  SELECT count(*) INTO v_healthy FROM public.marketplace_listings ml
  WHERE ml.status='active' AND EXISTS(SELECT 1 FROM public.image_asset_links ial
    JOIN public.image_assets ia ON ia.id=ial.asset_id
    WHERE ial.entity_type='marketplace_listing' AND ial.entity_id=ml.id
      AND ia.optimization_status IN('optimized','cdn_optimized'));

  IF v_attr=0 THEN
    UPDATE public.admin_automations SET schedule='*/10 * * * *',updated_at=now()
    WHERE slug='marketplace_variant_backfill' AND schedule<>'*/10 * * * *';
    v_changed:=v_changed OR FOUND;
  END IF;
  IF v_stale<=ceil(v_active*0.05) THEN
    UPDATE public.admin_automations SET schedule='0 * * * *',updated_at=now()
    WHERE slug='marketplace_link_checker' AND schedule<>'0 * * * *';
    v_changed:=v_changed OR FOUND;
  END IF;
  IF v_healthy>=ceil(v_active*0.95) THEN
    UPDATE public.admin_automations SET schedule='*/2 * * * *',updated_at=now()
    WHERE slug='marketplace_image_optimize' AND schedule<>'*/2 * * * *';
    v_changed:=v_changed OR FOUND;
  END IF;
  IF v_tax_pending=0 THEN
    UPDATE public.admin_automations SET enabled=false,updated_at=now()
    WHERE slug='marketplace_taxonomy_v3_backfill' AND enabled;
    v_changed:=v_changed OR FOUND;
  END IF;
  IF v_changed THEN PERFORM public.sync_automations_to_cron(true); END IF;
  RETURN jsonb_build_object('active',v_active,'attributes_pending',v_attr,
    'link_stale_30d',v_stale,'healthy_image_listings',v_healthy,
    'taxonomy_pending',v_tax_pending,'department_other',v_other,'schedule_changed',v_changed);
END;
$$;

REVOKE ALL ON FUNCTION public.marketplace_quality_completion_supervisor() FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.marketplace_quality_completion_supervisor() TO service_role;

INSERT INTO public.admin_automations
  (slug,name,description,managed_by,enabled,"trigger",conditions,action,schedule,auto_pause_threshold)
VALUES('marketplace_quality_completion_supervisor','Marketplace quality completion supervisor',
  'Restores steady-state schedules when marketplace remediation acceptance thresholds are reached.',
  'system',true,'{"type":"schedule"}'::jsonb,'[]'::jsonb,
  jsonb_build_object('type','cron','jobname','marketplace-quality-completion-supervisor',
    'command','SELECT public.marketplace_quality_completion_supervisor();'),
  '*/10 * * * *',3)
ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description,
  enabled=true,action=excluded.action,schedule=excluded.schedule,auto_pause_threshold=3;

SELECT public.sync_automations_to_cron(true);

SELECT public.marketplace_enhance_refill(5000);

SELECT public.run_marketplace_quality_snapshot();

RESET statement_timeout;

RESET lock_timeout;
