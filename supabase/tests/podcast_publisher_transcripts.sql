BEGIN;
DO $$
DECLARE r public.news_articles; after_row public.news_articles; v_hash text; v_count integer; v_items jsonb;
BEGIN
  IF has_function_privilege('anon','public.news_podcast_transcripts_pending(integer)','EXECUTE')
    OR has_function_privilege('authenticated','public.news_podcast_transcripts_apply(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Transcript maintenance must remain service-only';
  END IF;
  SELECT * INTO STRICT r FROM public.news_articles WHERE media_type='podcast'
    ORDER BY published_at DESC NULLS LAST LIMIT 1 FOR UPDATE;
  SELECT md5(api_private.news_podcast_transcript_source(n.content,s.raw_data,s.normalized_data,n.podcast_transcript_feed_links,n.url)::text)
    INTO v_hash FROM public.news_articles n LEFT JOIN public.ingestion_staging s ON s.id=n.ingestion_staging_id WHERE n.id=r.id;
  v_items := jsonb_build_array(jsonb_build_object('id',r.id,'source_hash','stale',
    'links',jsonb_build_array(jsonb_build_object('url','https://publisher.example/42.txt','scope','episode','source','feed'))));
  SELECT public.news_podcast_transcripts_apply(v_items) INTO v_count;
  IF v_count<>0 THEN RAISE EXCEPTION 'Stale source must be rejected'; END IF;
  UPDATE public.news_articles SET podcast_transcript_source_hash=NULL WHERE id=r.id;
  v_items := jsonb_set(v_items,'{0,source_hash}',to_jsonb(v_hash));
  SELECT public.news_podcast_transcripts_apply(v_items) INTO v_count;
  IF v_count<>1 THEN RAISE EXCEPTION 'Fresh source must apply exactly once'; END IF;
  SELECT * INTO STRICT after_row FROM public.news_articles WHERE id=r.id;
  IF after_row.content IS DISTINCT FROM r.content OR after_row.excerpt IS DISTINCT FROM r.excerpt
    OR after_row.audio_url IS DISTINCT FROM r.audio_url OR after_row.podcast_summary IS DISTINCT FROM r.podcast_summary
    OR after_row.quality_status IS DISTINCT FROM r.quality_status THEN
    RAISE EXCEPTION 'Transcript links must not change source, summary, audio or publication fields';
  END IF;
  SELECT public.news_podcast_transcripts_apply(v_items) INTO v_count;
  IF v_count<>0 THEN RAISE EXCEPTION 'Repeated application must be a no-op'; END IF;
  -- A corrected source URL changes the snapshot even if show notes are unchanged.
  UPDATE public.news_articles SET url=r.url || '#transcript-test' WHERE id=r.id;
  SELECT public.news_podcast_transcripts_apply(v_items) INTO v_count;
  IF v_count<>0 THEN RAISE EXCEPTION 'Source URL changes must reject stale links'; END IF;
  -- Empty discovery is recorded, removing obsolete links without repeated work.
  SELECT md5(api_private.news_podcast_transcript_source(n.content,s.raw_data,s.normalized_data,n.podcast_transcript_feed_links,n.url)::text)
    INTO v_hash FROM public.news_articles n LEFT JOIN public.ingestion_staging s ON s.id=n.ingestion_staging_id WHERE n.id=r.id;
  v_items := jsonb_build_array(jsonb_build_object('id',r.id,'source_hash',v_hash,'links','[]'::jsonb));
  SELECT public.news_podcast_transcripts_apply(v_items) INTO v_count;
  IF v_count<>1 OR (SELECT podcast_transcript_links FROM public.news_articles WHERE id=r.id)<>'[]'::jsonb THEN
    RAISE EXCEPTION 'Removed transcripts must clear obsolete links';
  END IF;
END;
$$;
ROLLBACK;
