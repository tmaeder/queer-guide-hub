-- Production source values use "Pain & Punishment"; the v4.7 slug keeps the
-- ampersand, so accept both the symbolic and word forms.
BEGIN;
SET lock_timeout='15s';
SET statement_timeout='120s';

DO $$
DECLARE v_def text; v_next text;
BEGIN
  SELECT pg_get_functiondef('public.marketplace_content_rating(text,text,text)'::regprocedure)
  INTO v_def;
  IF position('pain_(&|and)_punishment' IN v_def)>0 THEN RETURN; END IF;
  v_next:=replace(v_def,'pain_and_punishment','pain_(&|and)_punishment');
  IF v_next=v_def OR position('pain_(&|and)_punishment' IN v_next)=0 THEN
    RAISE EXCEPTION 'content rating v4.7 anchor changed; refusing partial correction';
  END IF;
  EXECUTE v_next;
END;
$$;

SELECT set_config('app.marketplace_quality_safety_version','marketplace-content-rating-v4.8',true);
SELECT set_config('app.marketplace_quality_safety_confidence','1.0',true);

CREATE TEMP TABLE marketplace_v48_safety ON COMMIT DROP AS
SELECT id FROM public.marketplace_listings
WHERE status='active' AND content_rating IS DISTINCT FROM
  public.marketplace_content_rating(subcategory,title,description);

UPDATE public.marketplace_listings ml SET title=ml.title
FROM marketplace_v48_safety c WHERE ml.id=c.id;

DELETE FROM public.search_documents sd USING public.marketplace_listings ml
WHERE sd.entity_type='marketplace' AND sd.entity_id=ml.id
  AND ml.content_rating NOT IN('sfw','suggestive');
INSERT INTO public.search_reindex_queue(entity_type,entity_id)
SELECT 'marketplace',id FROM marketplace_v48_safety ON CONFLICT DO NOTHING;

SELECT public.run_marketplace_quality_snapshot();
RESET statement_timeout;
COMMIT;
