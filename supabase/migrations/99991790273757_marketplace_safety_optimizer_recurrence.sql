-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 99991790273757 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
-- Close the post-rollout safety/taxonomy recurrence without deriving ratings
-- blindly from category labels. Taxonomy false positives are corrected first;
-- only then is the text-based rating recomputed. All semantic changes remain
-- reversible through marketplace_quality_events.

BEGIN;

SET lock_timeout='15s';

SET statement_timeout='120s';

CREATE OR REPLACE FUNCTION public.marketplace_subcategory_group(p_subcategory text,p_title text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=public AS $$
  SELECT CASE
    WHEN lower(coalesce(p_title,'')) ~ '\m(packing|packer|stp) (strap|pouch)\M'
      AND lower(coalesce(p_title,'')) !~ '\m(kit|included|with)\M|\+' THEN 'accessories'
    WHEN lower(coalesce(p_title,'')) ~ '\mftm packer( with panty)?\M' THEN 'accessories'
    WHEN lower(coalesce(p_title,'')) ~ '\m(sex oil|stimulating (sex )?(oil|gel)|silicone shots?)\M' THEN 'lubricants'
    WHEN lower(coalesce(p_title,'')) ~ '\m(energy booster|dietary supplement|creatine supplement|cleanliness supplement)\M|\m[0-9]+ capsules?\M'
      THEN 'grooming'
    WHEN lower(coalesce(p_title,'')) ~ '\m(socks?|stockings?)\M'
      AND lower(coalesce(p_subcategory,'')) ~ '(apparel|accessor|ropa|calcetines|menswear)'
      THEN 'apparel'
    WHEN lower(coalesce(p_title,'')||' '||coalesce(p_subcategory,'')) ~
      '(nipple.{0,32}(plier|torture|clamp|forcep|suction)|tit torture|nipsuck|pincer nipple)'
      THEN 'sex_toys'
    WHEN lower(coalesce(p_title,'')) ~ '\m(cuff ring|ring cuff)\M' THEN 'jewelry'
    WHEN lower(coalesce(p_title,'')) ~ '\m(wrap |wrist |bicep |ruff )?cuffs?\M'
      AND lower(coalesce(p_subcategory,'')) ~ '(menswear|apparel|accessor|jewel)'
      AND lower(coalesce(p_title,'')) !~ '(spreader|restraint|bondage|bdsm|lockable|torture|nipple|ankle)'
      THEN 'accessories'
    WHEN lower(coalesce(p_title,'')) ~ '\m(cleaner|cleaning spray|toy cleaner)\M' THEN 'safer_sex'
    WHEN lower(coalesce(p_title,'')) ~ '\m(cycling kit|cycle kit)\M' THEN 'apparel'
    WHEN lower(coalesce(p_title,'')) ~ '\m(t-?shirts?|tees?|tank tops?|crop tops?|camis?|camisoles?|polos?|jerseys?|blouses?)\M' THEN 'tops'
    WHEN lower(coalesce(p_title,'')) ~ '\m(hoodies?|sweatshirts?|jackets?|coats?|bombers?)\M' THEN 'outerwear'
    WHEN lower(coalesce(p_title,'')) ~ '\m(leggings?|shorts?|trousers?|pants?|jeans?|skirts?)\M' THEN 'bottoms'
    WHEN lower(coalesce(p_title,'')) ~ '\m(dresses?|robes?)\M' THEN 'apparel'
    WHEN lower(coalesce(p_title,'')) ~ '\m(dildo|vibrator|masturbator|stroker|butt plug|anal plug|cock ring|chastity cage|wand massager)\M'
      THEN public.marketplace_subcategory_group_v3(p_title,p_title)
    WHEN lower(coalesce(p_title,'')) ~ '\m(lubricants?|lubes?|gleitgel|douches?|enemas?|condoms?)\M'
      THEN public.marketplace_subcategory_group(p_title)
    WHEN lower(coalesce(p_title,'')) ~ '\m(restraints?|manacles?|shackles?|handcuffs?)\M' THEN 'bondage'
    WHEN lower(coalesce(p_title,'')) ~ '\m(harness|harnesses)\M' THEN 'harnesses'
    WHEN lower(coalesce(p_title,'')) ~ '\m(menstrual cup)\M' THEN 'grooming'
    WHEN lower(coalesce(p_title,'')) ~ '\m(jocks?|jockstraps?|briefs|boxers|thong|lingerie|underwear)\M'
      THEN public.marketplace_subcategory_group(p_title)
    WHEN lower(coalesce(p_title,'')) ~ '\m(necklace|earrings?|bracelet|pendant|ring)\M' THEN 'jewelry'
    WHEN lower(coalesce(p_title,'')) ~ '\m(books?|novels?|memoirs?|antholog(y|ies)|paperbacks?|hardcovers?)\M' THEN 'books'
    ELSE public.marketplace_subcategory_group_v3(p_subcategory,p_title)
  END;
$$;

CREATE OR REPLACE FUNCTION public.marketplace_content_rating(
  p_subcategory text,p_title text,p_description text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public,extensions AS $$
  WITH s AS (
    SELECT lower(regexp_replace(coalesce(p_subcategory,''),'[\s\-]+','_','g')) slug,
      lower(coalesce(p_title,'')||' '||coalesce(p_description,'')) txt
  ), ranked AS (
    SELECT greatest(
      CASE
        WHEN slug IN('sex_toys','anal_toys','cock_rings','cock_rings_and_stretchers',
          'dildos','vibrators','masturbators','pumps_and_enlargement','chastity',
          'cage','bdsm_and_bondage','bondage','bdsm','butt_plugs','penis_rings',
          'penis_pumps','pumps','pup_and_pet_play','pup_play','impact_play','gags',
          'hoods_masks','sound','intim_body','penis_extender','male_chastity_device')
          OR slug ~ '(^|_)(dildos?|ovipositors?)$' THEN 4
        WHEN slug IN('fetish_wear','fetish_gear','lubricants','lubes','condoms',
          'safer_sex','poppers','adult_magazines','adult_digital_magazines',
          'adult_photo_books','adult_art_prints','adult_zines','adult_photography',
          'adult_polaroids','adult_subscriptions') THEN 3
        WHEN slug IN('underwear_and_swimwear','underwear','swimwear') THEN 2
        ELSE 1 END,
      CASE
        WHEN txt ~ '(dildo|butt ?plug|silicone plug|vibrat|cock ?(ring|sling)|ball ?stretch|chastity|bondage|\mbdsm\M|fisting|prostate|masturbat|fleshlight|\mstrap[- ]?ons?\M|anal (plug|bead|douche|hook|fastener|speculum)|nipple.{0,32}(plier|torture|clamp|forcep|ring|suction)|(?:clamp|plier|forcep|pincer).{0,32}nipple|tit torture|nipsuck|urethral|\me[- ]?stim|\mestim\M|stroker|onanism|analplug|analkette|analkugel|analdusche|penisring|hodenring|keuschheit|peniskäfig|handschellen|peitsche|\mfessel|\mknebel\M|nippelklemme|liebeskugel|penispumpe|prostata|umschnall|spreizstange|flogger|elastrator|\mwhips?\M|spreader ?bar|\mball ?gag|\mgimp\M|humbler|hogtie|\mcock\M|penis[- ]?extender|penisvergr|klitoris|clitoris|clitoral|stimulator|love ?egg|liebesei|sexspielzeug|lovetoys?|\mg[- ]?spot|\mg[- ]?punkt|handcuffs?|restraints?|maglock|fußfessel|fussfessel|sperm stopper|penis sleeve|pack[- ]and[- ]play)' THEN 4
        WHEN txt ~ '(fetish|leather harness|pup hood|puppy hood|\mlube\M|lubricant|\menema|latex (gear|suit)|rubber (gear|suit)|erotic|\mkink\M|fetisch|gleitgel|gleitmittel|catsuit|wetlook|erotik|\manal\M|(silicone|wooden|leather|boot|spanking) paddle|nose hook)' THEN 3
        WHEN txt ~ '(jockstrap|jock strap|\mthong\M|lingerie|harness|\msexy\M|dessous|\mtanga\M|reizwäsche|orgasm|big d[''’]?ck energy)' THEN 2
        ELSE 1 END) rank FROM s
  )
  SELECT CASE rank WHEN 4 THEN 'explicit' WHEN 3 THEN 'adult'
    WHEN 2 THEN 'suggestive' ELSE 'sfw' END FROM ranked;
$$;

CREATE TEMP TABLE marketplace_recurrence_taxonomy ON COMMIT DROP AS
SELECT ml.id,ml.department old_department,ml.subcategory_group old_group,
  ml.subcategory_fine old_fine,ml.subcategory old_subcategory,
  CASE
    WHEN lower(ml.title) ~ '\m(socks?|stockings?)\M'
      AND lower(coalesce(ml.subcategory,'')) ~ '(apparel|accessor|ropa|calcetines|menswear)' THEN 'apparel'
    WHEN lower(ml.title) ~ '\m(energy booster|dietary supplement|creatine supplement|cleanliness supplement)\M|\m[0-9]+ capsules?\M' THEN 'grooming'
    WHEN lower(ml.title) ~ '\m(cuff ring|ring cuff)\M' THEN 'jewelry'
    ELSE 'accessories'
  END new_group
FROM public.marketplace_listings ml
WHERE ml.status='active' AND (
  (ml.subcategory_group='bondage' AND lower(ml.title) ~ '\m(socks?|stockings?)\M'
    AND lower(coalesce(ml.subcategory,'')) ~ '(apparel|accessor|ropa|calcetines|menswear)')
  OR (ml.subcategory_group='bondage' AND lower(ml.title) ~ '\m(wrap |wrist |bicep |ruff )?cuffs?\M'
    AND lower(coalesce(ml.subcategory,'')) ~ '(menswear|apparel|accessor|jewel)'
    AND lower(ml.title) !~ '(spreader|restraint|bondage|bdsm|lockable|torture|nipple|ankle)')
  OR (ml.subcategory_group='sex_toys'
    AND lower(ml.title) ~ '\m(energy booster|dietary supplement|creatine supplement|cleanliness supplement)\M|\m[0-9]+ capsules?\M')
);

INSERT INTO public.marketplace_quality_events
  (listing_id,dimension,previous_value,new_value,classifier_version,confidence)
SELECT c.id,'taxonomy',
  jsonb_build_object('department',c.old_department,'group',c.old_group,'fine',c.old_fine),
  jsonb_build_object('department',public.marketplace_department(c.new_group),'group',c.new_group,'fine',null),
  'marketplace-taxonomy-v4.4',1.0
FROM marketplace_recurrence_taxonomy c
WHERE NOT EXISTS(SELECT 1 FROM public.marketplace_quality_events e
  WHERE e.listing_id=c.id AND e.dimension='taxonomy'
    AND e.classifier_version='marketplace-taxonomy-v4.4' AND e.rollback_of IS NULL);

UPDATE public.marketplace_listings ml SET
  department=public.marketplace_department(c.new_group),subcategory_group=c.new_group,
  subcategory_fine=NULL,taxonomy_confidence=1.0,
  taxonomy_classifier_version='marketplace-taxonomy-v4.4',
  attributes=CASE WHEN c.new_group='grooming' THEN coalesce(ml.attributes,'{}'::jsonb)
    ||jsonb_build_object('_quality_original_subcategory',c.old_subcategory,
      '_quality_taxonomy_normalized_at',now(),'_quality_taxonomy_version','marketplace-taxonomy-v4.4')
    ELSE ml.attributes END,
  subcategory=CASE WHEN c.new_group='grooming' THEN 'grooming' ELSE ml.subcategory END
FROM marketplace_recurrence_taxonomy c WHERE ml.id=c.id;

CREATE TEMP TABLE marketplace_recurrence_safety ON COMMIT DROP AS
SELECT ml.id,ml.content_rating old_rating,
  public.marketplace_content_rating(ml.subcategory,ml.title,ml.description) new_rating
FROM public.marketplace_listings ml
WHERE ml.status='active' AND ml.content_rating IS DISTINCT FROM
  public.marketplace_content_rating(ml.subcategory,ml.title,ml.description);

INSERT INTO public.marketplace_quality_events
  (listing_id,dimension,previous_value,new_value,classifier_version,confidence)
SELECT c.id,'safety',to_jsonb(c.old_rating),to_jsonb(c.new_rating),
  'marketplace-content-rating-v4.4',1.0
FROM marketplace_recurrence_safety c
WHERE NOT EXISTS(SELECT 1 FROM public.marketplace_quality_events e
  WHERE e.listing_id=c.id AND e.dimension='safety'
    AND e.classifier_version='marketplace-content-rating-v4.4' AND e.rollback_of IS NULL);

-- content_rating is stored-generated; touching a source column rematerializes it.
UPDATE public.marketplace_listings ml SET title=ml.title
FROM marketplace_recurrence_safety c WHERE ml.id=c.id;

DELETE FROM public.search_documents sd USING public.marketplace_listings ml
WHERE sd.entity_type='marketplace' AND sd.entity_id=ml.id
  AND ml.content_rating NOT IN('sfw','suggestive');

INSERT INTO public.search_reindex_queue(entity_type,entity_id)
SELECT 'marketplace',id FROM public.marketplace_listings
WHERE taxonomy_classifier_version='marketplace-taxonomy-v4.4'
   OR id IN(SELECT id FROM marketplace_recurrence_safety)
ON CONFLICT DO NOTHING;

-- Reconcile image worker registry state as well as its schedule. Accelerate
-- only while retry-attempt assets remain; keep the ordinary pending gallery
-- drain at the existing bounded two-minute cadence.
CREATE OR REPLACE FUNCTION public.marketplace_quality_completion_supervisor()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_active integer; v_attr integer; v_stale integer; v_healthy integer;
  v_tax_pending integer; v_other integer; v_model_pending integer;
  v_desc_recovery integer; v_image_pending integer; v_image_retry_due integer;
  v_changed boolean:=false;
BEGIN
  SELECT count(*),count(*) FILTER(WHERE attributes_extracted_at IS NULL),
    count(*) FILTER(WHERE (link_checked_at IS NULL OR link_checked_at<now()-interval '30 days')
      AND (last_seen_at IS NULL OR last_seen_at<now()-interval '30 days')),
    count(*) FILTER(WHERE department='other'),count(*) FILTER(WHERE taxonomy_version<4),
    count(*) FILTER(WHERE taxonomy_version=4 AND subcategory_group='other'
      AND coalesce(taxonomy_model_status,'pending') IN('pending','failed')
      AND taxonomy_model_attempts<3)
  INTO v_active,v_attr,v_stale,v_other,v_tax_pending,v_model_pending
  FROM public.marketplace_listings WHERE status='active';
  SELECT count(*) INTO v_healthy FROM public.marketplace_listings ml
  WHERE ml.status='active' AND EXISTS(SELECT 1 FROM public.image_asset_links ial
    JOIN public.image_assets ia ON ia.id=ial.asset_id
    WHERE ial.entity_type='marketplace_listing' AND ial.entity_id=ml.id
      AND ia.optimization_status IN('optimized','cdn_optimized'));
  SELECT count(*) INTO v_desc_recovery FROM public.marketplace_listings
  WHERE status='active' AND length(coalesce(btrim(description),''))<=20
    AND NOT(coalesce(description_i18n,'{}'::jsonb)?'_recovery_checked_at');
  SELECT count(*) FILTER(WHERE ia.optimization_status='pending'),
    count(*) FILTER(WHERE (ia.optimization_status='failed' AND
      CASE WHEN coalesce(ia.metadata->>'optimization_attempts','')~'^\d+$'
        THEN (ia.metadata->>'optimization_attempts')::int ELSE 0 END<3)
      OR (ia.optimization_status='pending' AND
        CASE WHEN coalesce(ia.metadata->>'optimization_attempts','')~'^\d+$'
          THEN (ia.metadata->>'optimization_attempts')::int ELSE 0 END BETWEEN 1 AND 2))
  INTO v_image_pending,v_image_retry_due
  FROM public.image_assets ia WHERE ia.status='active' AND EXISTS(
    SELECT 1 FROM public.image_asset_links ial JOIN public.marketplace_listings ml ON ml.id=ial.entity_id
    WHERE ial.asset_id=ia.id AND ial.entity_type='marketplace_listing' AND ml.status='active');

  IF v_attr=0 THEN
    UPDATE public.admin_automations SET schedule='*/10 * * * *',updated_at=now()
    WHERE slug='marketplace_variant_backfill' AND schedule<>'*/10 * * * *'; v_changed:=v_changed OR FOUND;
  END IF;
  IF v_stale<=ceil(v_active*0.05) THEN
    UPDATE public.admin_automations SET schedule='0 * * * *',updated_at=now()
    WHERE slug='marketplace_link_checker' AND schedule<>'0 * * * *'; v_changed:=v_changed OR FOUND;
  END IF;
  IF v_image_pending>0 OR v_image_retry_due>0 THEN
    UPDATE public.admin_automations SET enabled=true,consecutive_failures=0,
      schedule=CASE WHEN v_image_retry_due>0 THEN '* * * * *' ELSE '*/2 * * * *' END,updated_at=now()
    WHERE slug='marketplace_image_optimize' AND (NOT enabled OR consecutive_failures<>0 OR
      schedule<>CASE WHEN v_image_retry_due>0 THEN '* * * * *' ELSE '*/2 * * * *' END);
    v_changed:=v_changed OR FOUND;
  END IF;
  IF v_tax_pending=0 THEN
    UPDATE public.admin_automations SET enabled=false,updated_at=now()
    WHERE slug='marketplace_taxonomy_v3_backfill' AND enabled; v_changed:=v_changed OR FOUND;
  END IF;
  IF v_model_pending=0 THEN
    UPDATE public.admin_automations SET enabled=false,updated_at=now()
    WHERE slug='marketplace_taxonomy_classify' AND enabled; v_changed:=v_changed OR FOUND;
  END IF;
  IF v_desc_recovery=0 THEN
    UPDATE public.admin_automations SET schedule='0 * * * *',updated_at=now()
    WHERE slug='marketplace_description_enhance' AND schedule<>'0 * * * *'; v_changed:=v_changed OR FOUND;
  END IF;
  IF v_changed THEN PERFORM public.sync_automations_to_cron(true); END IF;
  RETURN jsonb_build_object('active',v_active,'attributes_pending',v_attr,
    'link_stale_30d',v_stale,'healthy_image_listings',v_healthy,
    'taxonomy_pending',v_tax_pending,'department_other',v_other,
    'taxonomy_model_pending',v_model_pending,'description_recovery_pending',v_desc_recovery,
    'image_pending',v_image_pending,'image_retry_due',v_image_retry_due,'schedule_changed',v_changed);
END;
$$;

SELECT public.marketplace_quality_completion_supervisor();

SELECT public.marketplace_retry_failed_images(1000);

SELECT public.marketplace_quality_completion_supervisor();

SELECT public.run_marketplace_quality_snapshot();

RESET statement_timeout;

COMMIT;
