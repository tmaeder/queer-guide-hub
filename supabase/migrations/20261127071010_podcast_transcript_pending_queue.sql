-- A source-hash full scan over 19,500 toasted bodies exceeded the service-role
-- statement timeout even for one pending item. Select indexed work first.
ALTER TABLE public.news_articles ADD COLUMN podcast_transcript_pending boolean NOT NULL DEFAULT false;
ALTER TABLE public.news_articles ALTER COLUMN podcast_transcript_pending SET DEFAULT true;
UPDATE public.news_articles SET podcast_transcript_pending=true
  WHERE media_type='podcast' AND (podcast_transcript_source_hash IS NULL OR podcast_transcript_checked_at IS NULL);
CREATE INDEX news_podcast_transcript_queue_idx ON public.news_articles(published_at DESC NULLS LAST,id)
  WHERE media_type='podcast' AND podcast_transcript_pending;
CREATE INDEX news_podcast_transcript_staging_idx ON public.news_articles(ingestion_staging_id)
  WHERE media_type='podcast';

CREATE FUNCTION api_private.news_podcast_transcripts_invalidate()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.media_type IS DISTINCT FROM 'podcast' THEN
    NEW.podcast_transcript_pending:=false;
    NEW.podcast_transcript_links:='[]'::jsonb;
    NEW.podcast_transcript_source_hash:=NULL;
    NEW.podcast_transcript_checked_at:=NULL;
  ELSIF TG_OP='INSERT' OR NEW.content IS DISTINCT FROM OLD.content
    OR NEW.url IS DISTINCT FROM OLD.url OR NEW.audio_url IS DISTINCT FROM OLD.audio_url
    OR NEW.media_type IS DISTINCT FROM OLD.media_type
    OR NEW.ingestion_staging_id IS DISTINCT FROM OLD.ingestion_staging_id
    OR NEW.podcast_transcript_feed_links IS DISTINCT FROM OLD.podcast_transcript_feed_links THEN
    NEW.podcast_transcript_pending:=true;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION api_private.news_podcast_transcripts_invalidate() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER news_articles_transcript_invalidate BEFORE INSERT OR UPDATE OF content,url,audio_url,media_type,ingestion_staging_id,podcast_transcript_feed_links
  ON public.news_articles FOR EACH ROW EXECUTE FUNCTION api_private.news_podcast_transcripts_invalidate();

CREATE FUNCTION api_private.news_podcast_staged_transcripts_invalidate()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.raw_data->>'content' IS DISTINCT FROM OLD.raw_data->>'content'
    OR NEW.raw_data->'podcast_transcript_links' IS DISTINCT FROM OLD.raw_data->'podcast_transcript_links'
    OR NEW.normalized_data#>'{metadata,podcast_transcript_links}' IS DISTINCT FROM OLD.normalized_data#>'{metadata,podcast_transcript_links}' THEN
    UPDATE public.news_articles SET podcast_transcript_pending=true
      WHERE media_type='podcast' AND ingestion_staging_id=NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION api_private.news_podcast_staged_transcripts_invalidate() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER ingestion_staging_podcast_transcripts_invalidate AFTER UPDATE OF raw_data,normalized_data
  ON public.ingestion_staging FOR EACH ROW EXECUTE FUNCTION api_private.news_podcast_staged_transcripts_invalidate();

CREATE OR REPLACE FUNCTION public.news_podcast_transcripts_pending(p_limit integer DEFAULT 100)
RETURNS TABLE(id uuid, url text, content text, raw_notes text, declared jsonb, source_hash text, audio_url text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH todo AS MATERIALIZED (
    SELECT n.id,n.url,n.audio_url,n.content,n.ingestion_staging_id,n.podcast_transcript_feed_links
    FROM public.news_articles n WHERE n.media_type='podcast' AND n.podcast_transcript_pending
    ORDER BY n.published_at DESC NULLS LAST,n.id
    LIMIT greatest(1,least(coalesce(p_limit,100),200))
  )
  SELECT n.id,n.url,src.value->>'content',src.value->>'raw_notes',src.value->'declared',
    md5(src.value::text || coalesce(n.ingestion_staging_id::text,'')),n.audio_url
  FROM todo n LEFT JOIN public.ingestion_staging s ON s.id=n.ingestion_staging_id
  CROSS JOIN LATERAL (SELECT api_private.news_podcast_transcript_source(
    n.content,s.raw_data,s.normalized_data,n.podcast_transcript_feed_links,n.url,n.audio_url) AS value) src
$$;
REVOKE ALL ON FUNCTION public.news_podcast_transcripts_pending(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.news_podcast_transcripts_pending(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.news_podcast_transcripts_apply(p_items jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_count integer;
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)>200 THEN
    RAISE EXCEPTION 'Expected at most 200 transcript items';
  END IF;
  -- Lock staging before news, matching the staging-update trigger's order.
  -- The following statement gets a fresh snapshot after any concurrent edit.
  PERFORM 1 FROM public.ingestion_staging s JOIN public.news_articles n ON n.ingestion_staging_id=s.id
    JOIN jsonb_to_recordset(p_items) p(id uuid) ON p.id=n.id FOR SHARE OF s;
  UPDATE public.news_articles n SET
    podcast_transcript_pending=false,
    podcast_transcript_links=p.links,
    podcast_transcript_source_hash=p.source_hash,
    podcast_transcript_checked_at=now()
  FROM jsonb_to_recordset(p_items) p(id uuid,source_hash text,links jsonb)
  WHERE n.id=p.id AND n.media_type='podcast'
    AND jsonb_typeof(p.links)='array' AND jsonb_array_length(p.links)<=8
    AND n.podcast_transcript_pending
    AND p.source_hash=(
      SELECT md5(api_private.news_podcast_transcript_source(n.content,s.raw_data,s.normalized_data,n.podcast_transcript_feed_links,n.url,n.audio_url)::text || coalesce(n.ingestion_staging_id::text,''))
      FROM (SELECT 1) seed LEFT JOIN public.ingestion_staging s ON s.id=n.ingestion_staging_id);
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.news_podcast_transcripts_apply(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.news_podcast_transcripts_apply(jsonb) TO service_role;
