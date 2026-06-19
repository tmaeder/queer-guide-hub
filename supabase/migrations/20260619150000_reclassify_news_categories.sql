-- #2 — Deterministic news category reclassifier.
--
-- ~51% of live articles sit in the catch-all 'general' because no pipeline step
-- ever assigns a category (insert default is 'general'; enrich only emits tags).
-- This is a cheap, no-LLM keyword classifier over title+content+tags that only
-- touches currently-uncategorised rows (category_canonical NULL/'general'/'news').
-- Keyword groups are ordered by priority (first hit wins); LGBTQ+ legal/rights
-- terms win over generic politics. Reversible via enrichment_status.reclassify.
-- Batched by keyset (search_documents_sync reindexes each changed row).

CREATE OR REPLACE FUNCTION public.reclassify_news_categories(
  p_after uuid DEFAULT NULL,
  p_max_batches integer DEFAULT 0
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_changed int := 0; v_examined int := 0; v_batches int := 0;
  v_last uuid := coalesce(p_after, '00000000-0000-0000-0000-000000000000'::uuid);
  v_ids uuid[]; v_n int; v_done boolean := false;
BEGIN
  SET LOCAL statement_timeout = 0;
  LOOP
    SELECT array_agg(id ORDER BY id) INTO v_ids FROM (
      SELECT id FROM public.news_articles
      WHERE duplicate_of_id IS NULL AND id > v_last
        AND coalesce(category_canonical, category, 'general') IN ('general','news')
      ORDER BY id LIMIT 500) s;
    v_n := coalesce(cardinality(v_ids), 0);
    IF v_n = 0 THEN v_done := true; EXIT; END IF;
    v_last := v_ids[v_n];
    v_examined := v_examined + v_n;

    WITH scored AS (
      SELECT a.id,
        lower(coalesce(a.title,'') || ' ' || left(coalesce(a.content,''),1200)
              || ' ' || array_to_string(coalesce(a.tags,'{}'),' ')) AS txt
      FROM public.news_articles a WHERE a.id = ANY(v_ids)
    ),
    mapped AS (
      SELECT id,
        CASE
          WHEN txt ~ '(decriminali|criminali|marriage equal|same-sex marriage|court|supreme court|ruling|lawsuit|legislation|legal|\maban\M|\mlaw\M|rights bill|equality act|asylum|constitutional|verdict|appeal)'
            THEN 'rights-legal'
          WHEN txt ~ '(\melection\M|\mvote\M|senate|congress|parliament|president|governor|\mpolicy\M|minister|republican|democrat|\mbill\M|campaign|government|legislat|referendum)'
            THEN 'politics'
          WHEN txt ~ '(\mhiv\M|\maids\M|\mprep\M|\bmpox\b|mental health|\mtherapy\M|wellness|\mclinic\M|\mvaccine\M|healthcare|gender-affirming|hormone|transition care)'
            THEN 'health-wellness'
          WHEN txt ~ '(olympic|world cup|\mleague\M|\mathlete\M|tournament|\mfootball\M|\msoccer\M|basketball|\mrugby\M|\btennis\b|championship|\bsport)'
            THEN 'sports'
          WHEN txt ~ '(\mfilm\M|\mmovie\M|\mmusic\M|\malbum\M|\bsong\b|\mbook\M|\mart\M|drag\b|festival|\mactor\M|\msinger\M|netflix|\btv\b|theatre|theater|fashion|\maward|\mcelebrit)'
            THEN 'culture-arts'
          WHEN txt ~ '(\mschool\M|universit|\mstudent\M|\mcollege\M|campus|\mteacher\M|curriculum|education)'
            THEN 'education'
          WHEN txt ~ '(\mtech\M|\mapp\M|google|\bapple\b|\bai\b|software|\monline\M|platform|social media|startup|cyber)'
            THEN 'technology'
          WHEN txt ~ '(\mcompany\M|\bbusiness\b|\mmarket\M|economy|\bbrand\b|\bceo\b|corporate|\bstock\b|workplace|employer)'
            THEN 'business-economy'
          WHEN txt ~ '(\mpride\M|\bcommunity\b|\bparade\b|\bvolunteer\b|nonprofit|fundrais|\bvigil\b|\blocal\b)'
            THEN 'community'
          ELSE NULL
        END AS cat
      FROM scored
    )
    UPDATE public.news_articles a
      SET category_canonical = m.cat,
          enrichment_status = jsonb_set(coalesce(a.enrichment_status,'{}'::jsonb), array['reclassify'],
            jsonb_build_object('prev_canonical', a.category_canonical, 'at', now(),
              'via','reclassify_news_categories'), true)
    FROM mapped m
    WHERE a.id = m.id AND m.cat IS NOT NULL
      AND a.category_canonical IS DISTINCT FROM m.cat;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_changed := v_changed + v_n;
    v_batches := v_batches + 1;

    IF cardinality(v_ids) < 500 THEN v_done := true; EXIT; END IF;
    IF p_max_batches > 0 AND v_batches >= p_max_batches THEN EXIT; END IF;
  END LOOP;
  RETURN jsonb_build_object('reclassified',v_changed,'examined',v_examined,'done',v_done,'last_id',v_last);
END; $function$;
