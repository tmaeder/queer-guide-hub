-- Safe transactional contract test. Uses an existing episode and rolls back.
BEGIN;
DO $$
DECLARE r public.news_articles; v_count integer; v_hash text; v_item jsonb; after_row public.news_articles;
BEGIN
  IF has_function_privilege('anon','public.news_podcast_text_apply(jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','public.news_podcast_text_apply(jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.news_podcast_text_pending(integer)','EXECUTE') THEN
    RAISE EXCEPTION 'Podcast maintenance RPCs must be service-only';
  END IF;
  SELECT * INTO STRICT r FROM public.news_articles WHERE media_type='podcast' ORDER BY published_at DESC NULLS LAST LIMIT 1 FOR UPDATE;
  -- Reset the derived version inside the transaction to exercise the CAS path.
  UPDATE public.news_articles SET podcast_text_version=0 WHERE id=r.id;
  v_hash := md5(coalesce(r.title,'') || chr(31) || coalesce(r.content,''));
  v_item := jsonb_build_object('id',r.id,'source_hash','stale','notes','Episode show notes.','summary','Episode summary.','method','show_notes_extract');
  SELECT public.news_podcast_text_apply(jsonb_build_array(v_item)) INTO v_count;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Stale source must not be updated'; END IF;
  v_item := v_item || jsonb_build_object('source_hash',v_hash);
  SELECT public.news_podcast_text_apply(jsonb_build_array(v_item)) INTO v_count;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Expected one guarded update'; END IF;
  SELECT * INTO STRICT after_row FROM public.news_articles WHERE id=r.id;
  IF after_row.content IS DISTINCT FROM r.content OR after_row.content_hash IS DISTINCT FROM r.content_hash
    OR after_row.quality_status IS DISTINCT FROM r.quality_status OR after_row.audio_url IS DISTINCT FROM r.audio_url
    OR after_row.excerpt IS DISTINCT FROM 'Episode summary.' THEN
    RAISE EXCEPTION 'Derived update changed source/publication fields or failed to update excerpt';
  END IF;
  SELECT public.news_podcast_text_apply(jsonb_build_array(v_item)) INTO v_count;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Repeated update must be a no-op'; END IF;
  UPDATE public.news_articles SET excerpt='A repeated import with promotional text' WHERE id=r.id;
  IF (SELECT excerpt FROM public.news_articles WHERE id=r.id) <> 'Episode summary.' THEN
    RAISE EXCEPTION 'Repeated import must preserve the derived excerpt';
  END IF;
  UPDATE public.news_articles SET content=coalesce(content,'') || E'\nAn editorial correction.' WHERE id=r.id;
  SELECT * INTO STRICT after_row FROM public.news_articles WHERE id=r.id;
  IF after_row.podcast_text_version <> 0 OR after_row.podcast_summary IS NOT NULL OR after_row.podcast_show_notes IS NOT NULL THEN
    RAISE EXCEPTION 'Source edits must invalidate derived text';
  END IF;
END;
$$;
ROLLBACK;
