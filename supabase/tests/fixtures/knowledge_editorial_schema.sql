-- Minimal production-shape fixture for the isolated knowledge integration suite.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;

CREATE SCHEMA auth; CREATE SCHEMA api_private;
CREATE TYPE public.app_role AS ENUM('admin','moderator','editor');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
CREATE FUNCTION public.has_any_role_jwt(public.app_role[]) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.admin',true)='true' $$;
CREATE TABLE public.unified_tags(id uuid PRIMARY KEY,name text,slug text,description text,long_description text,status text DEFAULT 'active',publication_role text DEFAULT 'article',seo_indexable boolean DEFAULT true,restoration_review_required boolean DEFAULT false,category text,is_sensitive boolean DEFAULT false,is_adult boolean DEFAULT false);
CREATE TABLE public.personalities(id uuid PRIMARY KEY,name text,slug text,description text,bio text,visibility text DEFAULT 'public',duplicate_of_id uuid,is_living boolean DEFAULT false,is_adult boolean DEFAULT false,sensitivity_flags jsonb DEFAULT '{}');
GRANT USAGE ON SCHEMA auth,api_private,public TO anon,authenticated,service_role;
ALTER TABLE public.personalities ADD COLUMN image_url text;
CREATE TABLE public.image_assets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),url_hash text UNIQUE NOT NULL,url text NOT NULL,source text,source_ref text,license text,attribution text,alt_text text,width integer,height integer,access_level text DEFAULT 'public' CHECK(access_level IN ('public','partner','internal')),metadata jsonb,is_flagged boolean DEFAULT false,status text DEFAULT 'active',last_seen_at timestamptz);
CREATE TABLE public.image_asset_links(asset_id uuid,entity_type text,entity_id uuid,role text,sort_order integer,PRIMARY KEY(asset_id,entity_type,entity_id,role));
CREATE TABLE public.admin_automations(slug text PRIMARY KEY,name text,description text,managed_by text,enabled boolean,trigger jsonb,conditions jsonb,action jsonb,schedule text);
