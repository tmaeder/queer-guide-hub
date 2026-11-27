-- Presentation metadata only: original content, audio and summaries are intact.
ALTER TABLE public.news_articles
  ADD COLUMN podcast_transcript_links jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(podcast_transcript_links) = 'array' AND jsonb_array_length(podcast_transcript_links) <= 8),
  ADD COLUMN podcast_transcript_feed_links jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(podcast_transcript_feed_links) = 'array' AND jsonb_array_length(podcast_transcript_feed_links) <= 8),
  ADD COLUMN podcast_transcript_source_hash text,
  ADD COLUMN podcast_transcript_checked_at timestamptz;

-- Use the same snapshot for selection and guarded application. Recovered RSS
-- hints remain usable until a later import supplies fresh transcript metadata.
CREATE FUNCTION api_private.news_podcast_transcript_source(
  p_content text, p_raw jsonb, p_normalized jsonb, p_feed jsonb, p_url text
) RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'url',p_url,
    'content',left(coalesce(p_content,''),100000),
    'raw_notes',left(coalesce(p_raw->>'content',''),100000),
    'declared',coalesce(p_normalized->'metadata'->'podcast_transcript_links',
      p_raw->'podcast_transcript_links',p_feed,'[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION api_private.news_podcast_transcript_source(text,jsonb,jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api_private.news_podcast_transcript_source(text,jsonb,jsonb,jsonb,text) TO service_role;

CREATE FUNCTION public.news_podcast_transcripts_pending(p_limit integer DEFAULT 100)
RETURNS TABLE(id uuid, url text, content text, raw_notes text, declared jsonb, source_hash text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT n.id,n.url,src.value->>'content',src.value->>'raw_notes',src.value->'declared',md5(src.value::text)
  FROM public.news_articles n
  LEFT JOIN public.ingestion_staging s ON s.id=n.ingestion_staging_id
  CROSS JOIN LATERAL (SELECT api_private.news_podcast_transcript_source(
    n.content,s.raw_data,s.normalized_data,n.podcast_transcript_feed_links,n.url) AS value) src
  WHERE n.media_type='podcast' AND n.podcast_transcript_source_hash IS DISTINCT FROM md5(src.value::text)
  ORDER BY n.published_at DESC NULLS LAST,n.id
  LIMIT greatest(1,least(coalesce(p_limit,100),200));
$$;
REVOKE ALL ON FUNCTION public.news_podcast_transcripts_pending(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.news_podcast_transcripts_pending(integer) TO service_role;

CREATE FUNCTION public.news_podcast_transcripts_apply(p_items jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_count integer;
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)>200 THEN
    RAISE EXCEPTION 'Expected at most 200 transcript items';
  END IF;
  UPDATE public.news_articles n SET
    podcast_transcript_links=p.links,
    podcast_transcript_source_hash=p.source_hash,
    podcast_transcript_checked_at=now()
  FROM jsonb_to_recordset(p_items) p(id uuid,source_hash text,links jsonb)
  WHERE n.id=p.id AND n.media_type='podcast'
    AND jsonb_typeof(p.links)='array' AND jsonb_array_length(p.links)<=8
    AND n.podcast_transcript_source_hash IS DISTINCT FROM p.source_hash
    AND p.source_hash=(
      SELECT md5(api_private.news_podcast_transcript_source(n.content,s.raw_data,s.normalized_data,n.podcast_transcript_feed_links,n.url)::text)
      FROM (SELECT 1) seed LEFT JOIN public.ingestion_staging s ON s.id=n.ingestion_staging_id);
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.news_podcast_transcripts_apply(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.news_podcast_transcripts_apply(jsonb) TO service_role;

COMMENT ON COLUMN public.news_articles.podcast_transcript_links IS
  'Publisher-provided transcript destinations, distinguishing episode links from show archives. Not generated transcripts.';
