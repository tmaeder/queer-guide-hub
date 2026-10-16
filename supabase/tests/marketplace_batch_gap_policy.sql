-- Isolated fixture only. All test writes, including schema setup, roll back.
BEGIN;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE OR REPLACE FUNCTION extensions.unaccent(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT $1 $$;
CREATE OR REPLACE FUNCTION public.marketplace_resolve_merchant_id(text,text) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
ALTER TABLE marketplace_listings ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE marketplace_listings
 ADD COLUMN title text, ADD COLUMN description text, ADD COLUMN category text, ADD COLUMN subcategory text,
 ADD COLUMN category_id uuid, ADD COLUMN price numeric, ADD COLUMN price_type text, ADD COLUMN currency text,
 ADD COLUMN business_name text, ADD COLUMN business_type text, ADD COLUMN contact_email text, ADD COLUMN contact_phone text,
 ADD COLUMN website text, ADD COLUMN location text, ADD COLUMN images text[], ADD COLUMN status text, ADD COLUMN slug text,
 ADD COLUMN source_type text, ADD COLUMN source_entity_id text, ADD COLUMN external_url text, ADD COLUMN affiliate_url text,
 ADD COLUMN merchant_domain text, ADD COLUMN merchant_id uuid, ADD COLUMN brand text, ADD COLUMN availability text,
 ADD COLUMN in_stock boolean, ADD COLUMN last_verified_at timestamptz, ADD COLUMN last_seen_at timestamptz,
 ADD COLUMN link_health text, ADD COLUMN quality_score int, ADD COLUMN lgbti_relevance_score numeric,
 ADD COLUMN sensitivity_flags jsonb, ADD COLUMN classified_at timestamptz, ADD COLUMN review_status text,
 ADD COLUMN payload_hash text, ADD COLUMN updated_at timestamptz;
ALTER TABLE ingestion_staging ADD COLUMN raw_data jsonb, ADD COLUMN classification_result jsonb,
 ADD COLUMN ai_validation_result jsonb, ADD COLUMN source_entity_id text, ADD COLUMN payload_hash text, ADD COLUMN error_message text;
CREATE TABLE marketplace_categories(id uuid, name text,slug text,is_active boolean);
CREATE TABLE marketplace_price_history(listing_id uuid,price numeric,currency text,source_slug text,availability text);
CREATE TABLE marketplace_listing_sources(listing_id uuid,source_slug text,source_entity_id text,source_url text,raw jsonb,
 payload_hash text,confidence numeric,is_primary boolean,last_seen_at timestamptz);
CREATE UNIQUE INDEX ON marketplace_listing_sources(source_slug,source_entity_id) WHERE source_entity_id IS NOT NULL;
DO $$
DECLARE run_id uuid:=gen_random_uuid(); existing_id uuid:=gen_random_uuid(); gap_id uuid:=gen_random_uuid(); invalid_id uuid:=gen_random_uuid();
 results jsonb; row record; count_rows int;
BEGIN
 INSERT INTO marketplace_listings(id,title,description,website,images,price,in_stock) VALUES
 (existing_id,'Existing','Editor description','https://editor.example/website',ARRAY['https://editor.example/image.png'],0,false),
 (gap_id,'Missing',NULL,' ',ARRAY[]::text[],NULL,NULL),
 (invalid_id,'Invalid',NULL,NULL,ARRAY[]::text[],NULL,NULL);
 INSERT INTO ingestion_staging(id,target_table,disposition,ai_validation_status,review_status,dedup_status,dedup_match_id,
 pipeline_run_id,source_name,source_entity_id,classification_result,normalized_data)
 VALUES
 (gen_random_uuid(),'marketplace_listings','pending','approved','approved','duplicate',existing_id,run_id,'test','existing','{}',
 '{"name":"Existing","description":"Incoming description","images":["https://incoming.example/image.png"],"contacts":{"website":"https://incoming.example/","email":"contact@example.org"}}'),
 (gen_random_uuid(),'marketplace_listings','pending','approved','approved','merge_candidate',gap_id,run_id,'test','gap','{}',
 '{"name":"Missing","description":"Filled description","images":["https://incoming.example/image.png"],"contacts":{"website":"https://incoming.example/"}}'),
 (gen_random_uuid(),'marketplace_listings','pending','approved','approved','duplicate',invalid_id,run_id,'test','invalid','{}',
 '{"name":"Invalid","images":["javascript:bad"],"contacts":{"website":"javascript:bad"}}'),
 (gen_random_uuid(),'marketplace_listings','pending','approved','pending_review','duplicate',existing_id,run_id,'test','review','{}','{"name":"Blocked"}'),
 (gen_random_uuid(),'marketplace_listings','pending','approved','approved','duplicate',existing_id,run_id,'test','unclassified',NULL,'{"name":"Blocked"}'),
 (gen_random_uuid(),'marketplace_listings','pending','approved','approved','merge_candidate',NULL,run_id,'test','unmatched','{}','{"name":"Blocked"}');
 SELECT jsonb_agg(to_jsonb(r)) INTO results FROM commit_marketplace_staging_batch(10,run_id) r;
 ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(results) r WHERE r->>'action'='error'), 'marketplace fixture commit must not error';
 SELECT * INTO row FROM marketplace_listings WHERE id=existing_id;
 ASSERT row.description='Editor description' AND row.website='https://editor.example/website' AND row.images=ARRAY['https://editor.example/image.png'],
   'marketplace batch must preserve populated descriptive fields';
 ASSERT row.contact_email='contact@example.org','marketplace batch must fill contact gaps';
 SELECT * INTO row FROM marketplace_listings WHERE id=gap_id;
 ASSERT row.description='Filled description' AND row.website='https://incoming.example/' AND cardinality(row.images)=1,
   'approved matched merge candidates must fill gaps';
 SELECT * INTO row FROM marketplace_listings WHERE id=invalid_id;
 ASSERT row.website IS NULL AND cardinality(row.images)=0,'invalid source fields must not reach canonical records';
 ASSERT jsonb_array_length(results)=3,'review, classification and unmatched-candidate gates must hold';
 SELECT count(*) INTO count_rows FROM ingestion_events e JOIN ingestion_staging s ON s.id=e.staging_id
 WHERE s.pipeline_run_id=run_id AND e.payload ? 'field_transfer';
 ASSERT count_rows=3,'every updated batch row must retain its field-transfer audit';
 ASSERT EXISTS(SELECT 1 FROM ingestion_events e JOIN ingestion_staging s ON s.id=e.staging_id
 WHERE s.pipeline_run_id=run_id AND s.dedup_match_id=gap_id AND e.payload#>>'{field_transfer,after,description}'='Filled description'),
 'field-transfer audit must describe the actual gap fill';
END;
$$;
ROLLBACK;
