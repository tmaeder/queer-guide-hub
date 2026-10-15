-- Isolated PostgreSQL fixture. Never load this into an application database.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('test.jwt',true),''),'{}')::jsonb $$;
CREATE TABLE public.user_roles(user_id uuid,role text);
CREATE TABLE public.venues(id uuid PRIMARY KEY, name text, slug text, description text, address text, phone text, email text,
 website text, images text[], latitude numeric, longitude numeric, country_id uuid, hours jsonb, social_links jsonb,
 data_source text, field_provenance jsonb, review_status text, safety_gated boolean DEFAULT false,
 duplicate_of_id uuid, updated_at timestamptz, is_featured boolean DEFAULT false);
CREATE TABLE public.entity_merge_audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),entity_type text,keep_id uuid,drop_id uuid,
 actor uuid,reparented jsonb DEFAULT '{}',details jsonb DEFAULT '{}',created_at timestamptz DEFAULT now(),undone_at timestamptz);
CREATE TABLE public.venue_merge_audit(LIKE public.entity_merge_audit INCLUDING ALL);
CREATE TABLE public.city_merge_audit(LIKE public.entity_merge_audit INCLUDING ALL);
CREATE TABLE public.venue_slug_redirects(old_slug text PRIMARY KEY,venue_id uuid);
CREATE TABLE public.events(id uuid PRIMARY KEY,venue_id uuid,description text,latitude numeric,longitude numeric,images text[],duplicate_of_id uuid);
CREATE TABLE public.festivals(id uuid PRIMARY KEY,venue_id uuid);
CREATE TABLE public.marketplace_listings(id uuid PRIMARY KEY,venue_id uuid);
CREATE TABLE public.trip_places(id uuid PRIMARY KEY,venue_id uuid);
CREATE TABLE public.venue_checkins(id uuid PRIMARY KEY,venue_id uuid);
CREATE TABLE public.venue_reviews(id uuid PRIMARY KEY,venue_id uuid,user_id uuid,UNIQUE(venue_id,user_id));
CREATE TABLE public.venue_personal_visits(user_id uuid,venue_id uuid,PRIMARY KEY(user_id,venue_id));
CREATE TABLE public.guide_picks(id uuid PRIMARY KEY,entity_type text,entity_id uuid,guide_id uuid);
CREATE TABLE public.venue_sources(id uuid PRIMARY KEY,venue_id uuid,source_slug text,source_entity_id text);
CREATE TABLE public.cities(LIKE public.venues INCLUDING ALL);
CREATE TABLE public.ingestion_staging(id uuid PRIMARY KEY, normalized_data jsonb,enriched_data jsonb,
 target_table text,disposition text,ai_validation_status text,review_status text,dedup_match_id uuid,dedup_status text,updated_at timestamptz,
 source_name text,source_type text,created_at timestamptz DEFAULT now(),target_record_id uuid,pipeline_run_id uuid,processed_at timestamptz);
CREATE TABLE public.ingestion_events(staging_id uuid,stage text,new_status text,actor text,payload jsonb);
CREATE TABLE public.organizations(id uuid PRIMARY KEY,description text,website text,social jsonb,duplicate_of_id uuid);
-- Representative pre-policy commit body. The application definitions are checked
-- separately; this exercises the migration's executable rewrite and native types.
CREATE FUNCTION public.commit_venue_staging_item(p_staging_id uuid,p_actor text DEFAULT 'batch')
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_existing_id uuid := coalesce((SELECT dedup_match_id FROM ingestion_staging WHERE id=p_staging_id),p_staging_id);
 v_description text := coalesce((SELECT nullif(btrim(normalized_data->>'description'),'') FROM ingestion_staging WHERE id=p_staging_id),'incoming description');
 v_phone text := '123'; v_email text := 'contact@example.org'; v_website text := 'https://example.org';
 v_lat numeric := 47; v_lng numeric := 8; v_hours jsonb := '{"tue":"10-18"}'; v_source_slug text := 'test-provider';
BEGIN
 UPDATE public.venues SET description = coalesce(description, v_description),
 phone = coalesce(phone,v_phone), email=coalesce(email,v_email), website=coalesce(website,v_website),
 hours=coalesce(hours,v_hours),latitude=coalesce(latitude,v_lat),longitude=coalesce(longitude,v_lng)
 WHERE id=v_existing_id;
 INSERT INTO public.ingestion_events(payload) VALUES(jsonb_build_object('source_slug',v_source_slug));
END;
$$;
DO $$ DECLARE kind text; BEGIN
 FOREACH kind IN ARRAY ARRAY['event','city','country','marketplace','personality','village'] LOOP
 EXECUTE format('CREATE FUNCTION public.commit_%s_staging_item(p_staging_id uuid,p_actor text DEFAULT ''batch'') RETURNS void LANGUAGE plpgsql AS $fn$ BEGIN RETURN; END; $fn$',kind);
 END LOOP;
END $$;
\ir ../../migrations/20350101100000_venue_merge_records_moved_rows.sql
CREATE FUNCTION public.merge_venues(p_keep_id uuid,p_drop_id uuid) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public._venue_merge_core(p_keep_id,p_drop_id,auth.uid()); $$;
