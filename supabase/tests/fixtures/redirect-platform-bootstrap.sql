CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
-- Narrow fixture-only Auth management grants model account creation/deletion.
-- Runtime service_role must not read Auth email columns directly.
GRANT INSERT,DELETE ON auth.users TO service_role;
GRANT SELECT(id),UPDATE(email) ON auth.users TO service_role;
CREATE TYPE public.app_role AS ENUM ('admin','user','editor','moderator');
CREATE TABLE public.user_roles(user_id uuid,role public.app_role);
CREATE TABLE public.notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,type text NOT NULL,title text NOT NULL,content text,action_url text,related_id uuid,metadata jsonb,created_at timestamptz DEFAULT now());
GRANT ALL ON public.user_roles,public.notifications TO service_role;

CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role',current_user::text) $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub','')::uuid $$;
CREATE FUNCTION public.has_role_jwt(required_role public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'user_role'=required_role::text,false) $$;
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
CREATE TYPE public.redirect_type AS ENUM('SHORT','PATH');
CREATE TYPE public.redirect_query_mode AS ENUM('PRESERVE','DROP','OVERRIDE');
CREATE TABLE public.redirects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),type public.redirect_type NOT NULL,slug text UNIQUE,target text NOT NULL,
 source_path text, match_kind text DEFAULT 'EXACT', status_code integer DEFAULT 302,is_enabled boolean DEFAULT true,
 query_mode public.redirect_query_mode DEFAULT 'PRESERVE',preserve_query boolean DEFAULT true,query_override jsonb,utm_defaults jsonb,
 click_count integer DEFAULT 0,click_limit integer,start_at timestamptz,end_at timestamptz,created_by uuid,notes text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.redirects ENABLE ROW LEVEL SECURITY;
CREATE POLICY redirects_public_read ON public.redirects FOR SELECT TO authenticated USING (is_enabled);
CREATE POLICY redirects_admin_inventory_read ON public.redirects FOR SELECT TO authenticated USING(public.has_role_jwt('admin'));
CREATE POLICY redirects_admin_write ON public.redirects FOR ALL TO authenticated USING(public.has_role_jwt('admin')) WITH CHECK(public.has_role_jwt('admin'));
GRANT ALL ON public.redirects TO authenticated,service_role;
CREATE TABLE public.redirect_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,redirect_id uuid REFERENCES public.redirects(id) ON DELETE CASCADE,ts timestamptz DEFAULT now(),path text,query text,referer text,user_agent text,country text,ip_hash text,status integer);
ALTER TABLE public.redirect_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_admin_read ON public.redirect_events FOR SELECT TO authenticated USING(public.has_role_jwt('admin'));
GRANT SELECT ON public.redirect_events TO authenticated;
GRANT ALL ON public.redirect_events TO service_role;
GRANT USAGE ON SEQUENCE public.redirect_events_id_seq TO service_role;
CREATE FUNCTION public.resolve_short_redirect(p_slug text) RETURNS SETOF public.redirects LANGUAGE sql SECURITY DEFINER AS $$ SELECT * FROM public.redirects WHERE slug=p_slug $$;
CREATE FUNCTION public.record_redirect_click(uuid,text,text,text,text,text,text,integer) RETURNS void LANGUAGE sql AS $$SELECT$$;

-- Existing payment table needed by the native attribution FK migration.
CREATE TABLE public.donations(id uuid PRIMARY KEY DEFAULT gen_random_uuid());

GRANT ALL ON public.donations TO service_role;

-- Representative Storage ACL surface for isolated migration/policy verification.
CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role;
CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT ALL ON storage.objects TO authenticated,service_role;
GRANT ALL ON storage.buckets TO service_role;
CREATE POLICY fixture_existing_storage_access ON storage.objects TO authenticated USING(true) WITH CHECK(true);
