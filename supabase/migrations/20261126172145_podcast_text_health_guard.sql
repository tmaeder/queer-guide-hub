-- Detect a stalled cleanup worker even when source fetching remains healthy.
ALTER TABLE public.news_articles ADD COLUMN podcast_text_pending_since timestamptz DEFAULT now();

CREATE OR REPLACE FUNCTION api_private.news_podcast_text_invalidate()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.content IS DISTINCT FROM OLD.content
    OR NEW.title IS DISTINCT FROM OLD.title OR NEW.media_type IS DISTINCT FROM OLD.media_type THEN
    NEW.podcast_show_notes := NULL;
    NEW.podcast_summary := NULL;
    NEW.podcast_summary_method := NULL;
    NEW.podcast_text_version := 0;
    NEW.podcast_text_pending_since := CASE WHEN NEW.media_type='podcast' THEN now() END;
  ELSIF NEW.media_type = 'podcast' AND NEW.podcast_text_version > 0 THEN
    NEW.excerpt := nullif(NEW.podcast_summary, '');
    NEW.podcast_text_pending_since := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION api_private.news_podcast_text_invalidate() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION api_private.check_podcast_text_health()
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_stale bigint; v_enabled boolean; v_oldest timestamptz;
BEGIN
  SELECT count(*), min(podcast_text_pending_since) INTO v_stale,v_oldest
    FROM public.news_articles WHERE media_type='podcast' AND podcast_text_version=0
    AND podcast_text_pending_since < now() - interval '30 minutes';
  SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname='news_podcast_text' AND active) INTO v_enabled;
  IF v_stale > 0 OR NOT v_enabled THEN
    INSERT INTO public.pipeline_health_alerts(kind,subject,detail)
    VALUES ('stuck_run','podcast_text_cleanup',jsonb_build_object('stale_episodes',v_stale,
      'oldest_pending_since',v_oldest,'worker_enabled',v_enabled,'threshold_minutes',30))
    ON CONFLICT (kind,subject) WHERE resolved_at IS NULL DO UPDATE
      SET detail=EXCLUDED.detail,last_seen_at=now();
  ELSE
    UPDATE public.pipeline_health_alerts SET resolved_at=now()
      WHERE kind='stuck_run' AND subject='podcast_text_cleanup' AND resolved_at IS NULL;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION api_private.check_podcast_text_health() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('news_podcast_text_health','3-59/15 * * * *',
  'SELECT api_private.check_podcast_text_health();');
SELECT api_private.check_podcast_text_health();
