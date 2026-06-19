-- #1 — Full-text re-extraction for committed news_articles.
--
-- pipeline-extract-fulltext only runs in staging (pre-commit). ~84% of live
-- articles are sub-500-char RSS stubs that were committed before extraction
-- matured (or whose feed never carried a body). These RPCs back the
-- `news-fulltext-backfill` edge function, which re-fetches the source URL and
-- swaps in the recovered body. enrichment_status.refetch marks done rows (so a
-- batch never re-processes), and a successful body swap clears the geo "checked"
-- marker so geo-link can re-run over the richer content.

-- Work-list: thin, never-refetched, live articles that have a fetchable URL.
CREATE OR REPLACE FUNCTION public.news_thin_for_refetch(p_limit integer DEFAULT 100)
 RETURNS TABLE (id uuid, url text, content_len integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT id, url, length(coalesce(content,''))
  FROM public.news_articles
  WHERE duplicate_of_id IS NULL
    AND url ~* '^https?://'
    AND length(coalesce(content,'')) < 600
    AND (enrichment_status->'refetch') IS NULL
  ORDER BY id
  LIMIT greatest(1, least(p_limit, 500));
$function$;

-- Apply one re-extraction result. p_content NULL = nothing better found, just
-- stamp the meta so the row isn't retried. A non-NULL p_content swaps the body,
-- bumps updated_at (so the nightly quality/trust recompute re-scores it), and
-- clears the geo marker so geo-link re-evaluates the fuller text.
CREATE OR REPLACE FUNCTION public.apply_news_refetch(
  p_id uuid, p_content text, p_meta jsonb)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF p_content IS NOT NULL AND length(p_content) > 0 THEN
    UPDATE public.news_articles a
      SET content = p_content,
          updated_at = now(),
          enrichment_status = jsonb_set(
            coalesce(a.enrichment_status,'{}'::jsonb), ARRAY['refetch'],
            coalesce(p_meta,'{}'::jsonb) || jsonb_build_object(
              'prev_content', left(coalesce(a.content,''),2000), 'applied', true, 'at', now()), true)
      WHERE a.id = p_id;
    DELETE FROM public.news_geo_checked WHERE article_id = p_id;
  ELSE
    UPDATE public.news_articles a
      SET enrichment_status = jsonb_set(
            coalesce(a.enrichment_status,'{}'::jsonb), ARRAY['refetch'],
            coalesce(p_meta,'{}'::jsonb) || jsonb_build_object('applied', false, 'at', now()), true)
      WHERE a.id = p_id;
  END IF;
END; $function$;

-- Service-side safe-publish sweep (cron twin of admin batch_approve_safe_news):
-- as re-extraction + nightly recompute lift content/quality, promote the safe
-- slice of the review backlog to 'passed'. Batched against the reindex trigger.
CREATE OR REPLACE FUNCTION public.run_news_safe_publish_sweep(
  p_min_relevance numeric DEFAULT 0.6, p_min_quality integer DEFAULT 50, p_min_content integer DEFAULT 300)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_published int := 0; v_ids uuid[]; v_n int;
  v_last uuid := '00000000-0000-0000-0000-000000000000'::uuid;
BEGIN
  SET LOCAL statement_timeout = 0;
  LOOP
    SELECT array_agg(id ORDER BY id) INTO v_ids FROM (
      SELECT id FROM public.news_articles
      WHERE duplicate_of_id IS NULL AND quality_status='review' AND id > v_last
        AND coalesce(lgbti_relevance_score, relevance_score, 0) >= p_min_relevance
        AND coalesce(quality_score,0) >= p_min_quality
        AND content IS NOT NULL AND length(content) >= p_min_content
        AND NOT (coalesce(auto_publish_blocked_reasons,'{}') && array['critical_paywall','satire','advertorial'])
      ORDER BY id LIMIT 300) s;
    v_n := coalesce(cardinality(v_ids),0);
    EXIT WHEN v_n = 0;
    v_last := v_ids[v_n];
    UPDATE public.news_articles a
      SET quality_status='passed', auto_publish_blocked_reasons='{}', seo_indexable=true,
          enrichment_status = jsonb_set(coalesce(a.enrichment_status,'{}'::jsonb), array['batch_approve'],
            jsonb_build_object('prev_status','review','prev_seo_indexable',a.seo_indexable,
              'approved_at', now(), 'via','safe_publish_sweep'), true)
      WHERE a.id = ANY(v_ids);
    v_published := v_published + v_n;
    EXIT WHEN v_n < 300;
  END LOOP;
  RETURN jsonb_build_object('published', v_published);
END; $function$;

-- Crons (idempotent upserts by name):
--   news_fulltext_backfill   — drain thin committed articles via the edge fn
--   news_safe_publish_sweep  — auto-publish the safe slice nightly after recompute
--   news_geo_link_sweep      — re-link geo for articles whose marker was cleared
SELECT cron.schedule('news_fulltext_backfill', '*/10 * * * *',
$cmd$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/news-fulltext-backfill',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret')),
    body := '{"batch_size":50,"concurrency":5}'::jsonb,
    timeout_milliseconds := 70000);
$cmd$);

SELECT cron.schedule('news_safe_publish_sweep', '10 4 * * *',
  $$ SET statement_timeout=0; SELECT public.run_news_safe_publish_sweep(); $$);

SELECT cron.schedule('news_geo_link_sweep', '*/20 * * * *',
$cmd$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/geo-link-content',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret')),
    body := '{"content_type":"news_articles","batch":true,"batch_limit":300}'::jsonb,
    timeout_milliseconds := 60000);
$cmd$);
