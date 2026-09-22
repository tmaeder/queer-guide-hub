-- Prefer an explicit source-category mapping for the newly ingested German
-- vinyl mini-skirt instead of spending a model call on a deterministic label.

INSERT INTO public.marketplace_source_category_mappings
  (source_slug,source_category,subcategory_group,confidence,mapping_version)
VALUES('ohmyfantasy','Lack-Minirock','bottoms',1.0,'marketplace-taxonomy-v4.2')
ON CONFLICT(source_slug,source_category) DO UPDATE SET
  subcategory_group=excluded.subcategory_group,
  confidence=excluded.confidence,
  mapping_version=excluded.mapping_version,
  updated_at=now();

INSERT INTO public.marketplace_taxonomy_validation_corpus
  (listing_id,source_category,title,expected_group,expected_department,provenance,stratum)
VALUES('3d2c2c09-c6bf-47b1-b609-456290bd87cf','Lack-Minirock',
  'Black Level - Lack Minirock & Strapsriemen','bottoms','apparel',
  'human_review:prod_2026_09_22','multilingual')
ON CONFLICT(source_category,title) DO UPDATE SET
  expected_group=excluded.expected_group,
  expected_department=excluded.expected_department,
  provenance=excluded.provenance,
  stratum=excluded.stratum;

WITH candidate AS (
  SELECT id,department,subcategory_group,subcategory_fine
  FROM public.marketplace_listings
  WHERE id='3d2c2c09-c6bf-47b1-b609-456290bd87cf'
), event AS (
  INSERT INTO public.marketplace_quality_events
    (listing_id,dimension,previous_value,new_value,classifier_version,confidence)
  SELECT id,'taxonomy',
    jsonb_build_object('department',department,'group',subcategory_group,'fine',subcategory_fine),
    jsonb_build_object('department','apparel','group','bottoms','fine',null),
    'marketplace-taxonomy-v4.2-source-map',1.0
  FROM candidate
  WHERE NOT EXISTS(SELECT 1 FROM public.marketplace_quality_events e
    WHERE e.listing_id=candidate.id AND e.dimension='taxonomy'
      AND e.classifier_version='marketplace-taxonomy-v4.2-source-map' AND e.rollback_of IS NULL)
)
UPDATE public.marketplace_listings ml SET
  department='apparel',subcategory_group='bottoms',subcategory_fine=NULL,
  taxonomy_confidence=1.0,
  taxonomy_classifier_version='marketplace-taxonomy-v4.2-source-map'
FROM candidate c WHERE ml.id=c.id;

INSERT INTO public.search_reindex_queue(entity_type,entity_id)
VALUES('marketplace','3d2c2c09-c6bf-47b1-b609-456290bd87cf')
ON CONFLICT DO NOTHING;

SELECT public.marketplace_quality_completion_supervisor();
SELECT public.run_marketplace_quality_snapshot();
