-- Include the audio identity and discovery rule version in guarded snapshots.
-- This requeues existing episodes without changing publisher text or audio.
CREATE FUNCTION api_private.news_podcast_transcript_source(
  p_content text,p_raw jsonb,p_normalized jsonb,p_feed jsonb,p_url text,p_audio_url text
) RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT api_private.news_podcast_transcript_source(p_content,p_raw,p_normalized,p_feed,p_url)
    || jsonb_build_object('audio_url',p_audio_url,'rules_version',2);
$$;
REVOKE ALL ON FUNCTION api_private.news_podcast_transcript_source(text,jsonb,jsonb,jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api_private.news_podcast_transcript_source(text,jsonb,jsonb,jsonb,text,text) TO service_role;

DROP FUNCTION public.news_podcast_transcripts_pending(integer);
CREATE FUNCTION public.news_podcast_transcripts_pending(p_limit integer DEFAULT 100)
RETURNS TABLE(id uuid, url text, content text, raw_notes text, declared jsonb, source_hash text, audio_url text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT n.id,n.url,src.value->>'content',src.value->>'raw_notes',src.value->'declared',md5(src.value::text),n.audio_url
  FROM public.news_articles n
  LEFT JOIN public.ingestion_staging s ON s.id=n.ingestion_staging_id
  CROSS JOIN LATERAL (SELECT api_private.news_podcast_transcript_source(
    n.content,s.raw_data,s.normalized_data,n.podcast_transcript_feed_links,n.url,n.audio_url) AS value) src
  WHERE n.media_type='podcast' AND n.podcast_transcript_source_hash IS DISTINCT FROM md5(src.value::text)
  ORDER BY n.published_at DESC NULLS LAST,n.id
  LIMIT greatest(1,least(coalesce(p_limit,100),200));
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
  UPDATE public.news_articles n SET
    podcast_transcript_links=p.links,
    podcast_transcript_source_hash=p.source_hash,
    podcast_transcript_checked_at=now()
  FROM jsonb_to_recordset(p_items) p(id uuid,source_hash text,links jsonb)
  WHERE n.id=p.id AND n.media_type='podcast'
    AND jsonb_typeof(p.links)='array' AND jsonb_array_length(p.links)<=8
    AND n.podcast_transcript_source_hash IS DISTINCT FROM p.source_hash
    AND p.source_hash=(
      SELECT md5(api_private.news_podcast_transcript_source(n.content,s.raw_data,s.normalized_data,n.podcast_transcript_feed_links,n.url,n.audio_url)::text)
      FROM (SELECT 1) seed LEFT JOIN public.ingestion_staging s ON s.id=n.ingestion_staging_id);
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.news_podcast_transcripts_apply(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.news_podcast_transcripts_apply(jsonb) TO service_role;

