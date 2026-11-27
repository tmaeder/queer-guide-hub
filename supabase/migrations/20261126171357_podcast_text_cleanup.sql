-- Keep publisher content intact; these are disposable presentation derivatives.
ALTER TABLE public.news_articles
  ADD COLUMN podcast_show_notes text,
  ADD COLUMN podcast_summary text,
  ADD COLUMN podcast_summary_method text CHECK (podcast_summary_method IN ('ai_show_notes', 'show_notes_extract', 'unavailable')),
  ADD COLUMN podcast_text_version integer NOT NULL DEFAULT 0;

CREATE INDEX news_podcast_text_pending_idx ON public.news_articles (published_at DESC NULLS LAST, id)
  WHERE media_type = 'podcast' AND podcast_text_version = 0;

CREATE OR REPLACE FUNCTION api_private.news_podcast_text_invalidate()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.content IS DISTINCT FROM OLD.content
    OR NEW.title IS DISTINCT FROM OLD.title OR NEW.media_type IS DISTINCT FROM OLD.media_type THEN
    NEW.podcast_show_notes := NULL;
    NEW.podcast_summary := NULL;
    NEW.podcast_summary_method := NULL;
    NEW.podcast_text_version := 0;
  ELSIF NEW.media_type = 'podcast' AND NEW.podcast_text_version > 0 THEN
    -- A repeated RSS commit must not put the promotional excerpt back on cards.
    NEW.excerpt := nullif(NEW.podcast_summary, '');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION api_private.news_podcast_text_invalidate() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER news_articles_podcast_text_invalidate
  BEFORE INSERT OR UPDATE OF content, title, media_type, excerpt ON public.news_articles
  FOR EACH ROW EXECUTE FUNCTION api_private.news_podcast_text_invalidate();

CREATE OR REPLACE FUNCTION public.news_podcast_text_pending(p_limit integer DEFAULT 100)
RETURNS TABLE(id uuid, title text, content text, raw_notes text, source_hash text, ai_summary text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT n.id, n.title, left(n.content,100000), left(s.raw_data->>'content',100000),
    md5(coalesce(n.title,'') || chr(31) || coalesce(n.content,'')),
    -- Only new podcast-aware summaries carry explicit provenance. Older news
    -- prompts could summarize sponsorship copy or treat show notes as reporting.
    CASE WHEN s.enriched_data->>'podcast_summary_basis' = 'show_notes'
      THEN s.enriched_data->>'ai_summary' END
  FROM public.news_articles n
  LEFT JOIN public.ingestion_staging s ON s.id = n.ingestion_staging_id
  WHERE n.media_type = 'podcast' AND n.podcast_text_version = 0
  ORDER BY n.published_at DESC NULLS LAST, n.id
  LIMIT greatest(1, least(coalesce(p_limit,100),200));
$$;
REVOKE ALL ON FUNCTION public.news_podcast_text_pending(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.news_podcast_text_pending(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.news_podcast_text_apply(p_items jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_count integer;
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) > 200 THEN
    RAISE EXCEPTION 'Expected at most 200 podcast text items';
  END IF;
  UPDATE public.news_articles n SET
    podcast_show_notes = p.notes,
    podcast_summary = nullif(p.summary,''),
    podcast_summary_method = p.method,
    podcast_text_version = 1,
    excerpt = nullif(p.summary,'')
  FROM jsonb_to_recordset(p_items) AS p(id uuid, source_hash text, notes text, summary text, method text)
  WHERE n.id = p.id AND n.media_type = 'podcast' AND n.podcast_text_version = 0
    AND md5(coalesce(n.title,'') || chr(31) || coalesce(n.content,'')) = p.source_hash
    AND p.notes IS NOT NULL AND length(p.notes) <= 100000
    AND p.summary IS NOT NULL AND length(p.summary) <= 420
    AND p.method IN ('ai_show_notes','show_notes_extract','unavailable');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.news_podcast_text_apply(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.news_podcast_text_apply(jsonb) TO service_role;

COMMENT ON COLUMN public.news_articles.podcast_summary IS 'Short overview based on publisher show notes, never an audio transcript.';
COMMENT ON COLUMN public.news_articles.podcast_show_notes IS 'Cleaned presentation text; original publisher text is retained in content.';

SELECT cron.schedule('news_podcast_text', '*/5 * * * *', $cron$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-podcast-text',
    headers := jsonb_build_object('Content-Type','application/json','x-internal-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret')),
    body := '{"batch_size":100}'::jsonb, timeout_milliseconds := 60000
  );
$cron$);
