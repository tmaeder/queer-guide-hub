-- Design System & Branding Control Center — backend
--   * site_branding — single-row draft/published branding override document
--   * site_branding_versions — capped publish history (revert source)
--   * branding_validate — whitelist + strict value-format gate for every write
--   * RPCs: branding_save_draft / branding_publish / branding_revert / branding_set_enabled
--   * storage bucket 'brand' — logo / OG image / email logo assets
--
-- The document is SPARSE: it only holds keys an admin overrode. An empty doc
-- means the site renders exactly from the static defaults in src/index.css /
-- functions/_lib/routeMeta.ts. Delivery: functions/_middleware.ts injects the
-- published doc as a <style id="brand-overrides"> block + meta overrides.

-- ---------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.site_branding (
  id                INT PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- single-row table
  draft             JSONB NOT NULL DEFAULT '{}'::jsonb,
  published         JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_version INT NOT NULL DEFAULT 0,
  overrides_enabled BOOLEAN NOT NULL DEFAULT TRUE, -- kill switch: false = serve stock site
  updated_by        UUID REFERENCES auth.users(id),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.site_branding (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.site_branding_versions (
  version      INT PRIMARY KEY,
  doc          JSONB NOT NULL,
  note         TEXT,
  published_by UUID REFERENCES auth.users(id),
  published_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.site_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_branding_versions ENABLE ROW LEVEL SECURITY;

-- Published doc must be readable by the CF Pages middleware (anon key).
-- Draft is not secret (design tokens, no PII).
DO $$ BEGIN
  CREATE POLICY "anyone read branding" ON public.site_branding
    FOR SELECT TO authenticated, anon USING (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- No INSERT/UPDATE/DELETE policies on site_branding: writes go only through
-- the SECURITY DEFINER RPCs below.

DO $$ BEGIN
  CREATE POLICY "admin read branding versions" ON public.site_branding_versions
    FOR SELECT TO authenticated
    USING (public.has_role_jwt('admin'::public.app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE public.site_branding IS
  'Single-row sparse override document for design tokens + brand/meta/email identity. Empty doc = stock site. Served by CF Pages middleware; edited at /admin/design.';
COMMENT ON TABLE public.site_branding_versions IS
  'Publish history for site_branding (capped at 50 rows). Revert = re-publish an old doc as a new version.';

-- ---------------------------------------------------------------
-- 2. Validation — hard whitelist + strict value formats
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.branding_validate(p_doc jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  -- HSL channel tokens overridable per mode (mirrors :root/.dark in src/index.css)
  v_color_keys text[] := ARRAY[
    'background','foreground','card','card-foreground','popover','popover-foreground',
    'primary','primary-foreground','secondary','secondary-foreground',
    'muted','muted-foreground','accent','accent-foreground',
    'destructive','destructive-foreground','warning','warning-foreground',
    'success','success-foreground','border','input','input-bg','ring',
    'sidebar-background','sidebar-foreground','sidebar-primary','sidebar-primary-foreground',
    'sidebar-accent','sidebar-accent-foreground','sidebar-border','sidebar-ring',
    'text-primary','text-secondary','text-muted','border-hairline',
    'surface','surface-container-lowest','surface-container-low','surface-container',
    'surface-container-high','surface-container-highest','surface-dim','inverse-surface'
  ];
  -- Mode-independent tokens (@theme scale + motion)
  v_size_keys text[] := ARRAY[
    'radius-container','radius-element','radius-badge',
    'text-3xs','text-2xs','text-xs2','text-13','text-15','text-body-lg',
    'text-title','text-headline','text-headline-lg','text-display','text-hero','text-hero-xl'
  ];
  v_lh_keys text[] := ARRAY[
    'text-3xs--line-height','text-2xs--line-height','text-xs2--line-height',
    'text-13--line-height','text-15--line-height','text-body-lg--line-height',
    'text-title--line-height','text-headline--line-height','text-headline-lg--line-height',
    'text-display--line-height','text-hero--line-height','text-hero-xl--line-height'
  ];
  v_hsl_re      text := '^\d{1,3}(\.\d+)? \d{1,3}(\.\d+)?% \d{1,3}(\.\d+)?%$';
  v_size_re     text := '^\d+(\.\d+)?(rem|px)$';
  v_lh_re       text := '^\d+(\.\d+)?(rem)?$';
  v_url_re      text := '^(https://|/)[^\s"''<>]{1,300}$';
  v_hex_re      text := '^#[0-9a-fA-F]{6}$';
  v_top_key text;
  v_mode text;
  v_key text;
  v_val jsonb;
  v_str text;
  v_total_keys int := 0;
  v_item jsonb;
BEGIN
  IF p_doc IS NULL OR jsonb_typeof(p_doc) <> 'object' THEN
    RAISE EXCEPTION 'branding doc must be a JSON object';
  END IF;
  IF pg_column_size(p_doc) > 32768 THEN
    RAISE EXCEPTION 'branding doc too large (max 32 KB)';
  END IF;

  FOR v_top_key IN SELECT jsonb_object_keys(p_doc) LOOP
    IF v_top_key NOT IN ('tokens','meta','manifest','email') THEN
      RAISE EXCEPTION 'unknown branding section: %', v_top_key;
    END IF;
  END LOOP;

  -- tokens.light / tokens.dark / tokens.global
  IF p_doc ? 'tokens' THEN
    IF jsonb_typeof(p_doc->'tokens') <> 'object' THEN
      RAISE EXCEPTION 'tokens must be an object';
    END IF;
    FOR v_mode IN SELECT jsonb_object_keys(p_doc->'tokens') LOOP
      IF v_mode NOT IN ('light','dark','global') THEN
        RAISE EXCEPTION 'unknown tokens scope: %', v_mode;
      END IF;
      IF jsonb_typeof(p_doc->'tokens'->v_mode) <> 'object' THEN
        RAISE EXCEPTION 'tokens.% must be an object', v_mode;
      END IF;
      FOR v_key, v_val IN SELECT * FROM jsonb_each(p_doc->'tokens'->v_mode) LOOP
        v_total_keys := v_total_keys + 1;
        IF jsonb_typeof(v_val) <> 'string' THEN
          RAISE EXCEPTION 'token % must be a string', v_key;
        END IF;
        v_str := v_val #>> '{}';
        IF v_mode IN ('light','dark') THEN
          IF NOT (v_key = ANY (v_color_keys)) THEN
            RAISE EXCEPTION 'token % is not an overridable color token', v_key;
          END IF;
          IF v_str !~ v_hsl_re THEN
            RAISE EXCEPTION 'token % value "%" is not an HSL channel triple (e.g. "0 0%% 96%%")', v_key, v_str;
          END IF;
        ELSE -- global
          IF v_key = ANY (v_size_keys) THEN
            IF v_str !~ v_size_re THEN
              RAISE EXCEPTION 'token % value "%" must be rem or px', v_key, v_str;
            END IF;
          ELSIF v_key = ANY (v_lh_keys) THEN
            IF v_str !~ v_lh_re THEN
              RAISE EXCEPTION 'token % value "%" must be a unitless or rem line-height', v_key, v_str;
            END IF;
          ELSIF v_key = 'tracking-label' THEN
            IF v_str !~ '^-?\d+(\.\d+)?em$' THEN
              RAISE EXCEPTION 'tracking-label value "%" must be an em value', v_str;
            END IF;
          ELSIF v_key = 'transition-smooth' THEN
            IF v_str !~ '^[a-z0-9 .,()-]{1,120}$' THEN
              RAISE EXCEPTION 'transition-smooth value "%" contains disallowed characters', v_str;
            END IF;
          ELSE
            RAISE EXCEPTION 'token % is not an overridable global token', v_key;
          END IF;
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  -- meta
  IF p_doc ? 'meta' THEN
    IF jsonb_typeof(p_doc->'meta') <> 'object' THEN
      RAISE EXCEPTION 'meta must be an object';
    END IF;
    FOR v_key, v_val IN SELECT * FROM jsonb_each(p_doc->'meta') LOOP
      v_total_keys := v_total_keys + 1;
      IF v_key = 'org_sameas' THEN
        IF jsonb_typeof(v_val) <> 'array' OR jsonb_array_length(v_val) > 20 THEN
          RAISE EXCEPTION 'org_sameas must be an array of at most 20 URLs';
        END IF;
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_val) LOOP
          IF jsonb_typeof(v_item) <> 'string' OR (v_item #>> '{}') !~ '^https://[^\s"''<>]{1,300}$' THEN
            RAISE EXCEPTION 'org_sameas entries must be https URLs';
          END IF;
        END LOOP;
        CONTINUE;
      END IF;
      IF jsonb_typeof(v_val) <> 'string' THEN
        RAISE EXCEPTION 'meta.% must be a string', v_key;
      END IF;
      v_str := v_val #>> '{}';
      CASE v_key
        WHEN 'site_name', 'default_title', 'default_description' THEN
          IF length(v_str) < 1 OR length(v_str) > 300 THEN
            RAISE EXCEPTION 'meta.% must be 1-300 characters', v_key;
          END IF;
        WHEN 'twitter_handle' THEN
          IF v_str !~ '^@\w{1,30}$' THEN
            RAISE EXCEPTION 'twitter_handle "%" must look like @handle', v_str;
          END IF;
        WHEN 'og_image_url', 'org_logo_url' THEN
          IF v_str !~ v_url_re THEN
            RAISE EXCEPTION 'meta.% must be an https:// or / URL', v_key;
          END IF;
        WHEN 'theme_color_light', 'theme_color_dark' THEN
          IF v_str !~ v_hex_re THEN
            RAISE EXCEPTION 'meta.% must be a 6-digit hex color', v_key;
          END IF;
        ELSE
          RAISE EXCEPTION 'unknown meta field: %', v_key;
      END CASE;
    END LOOP;
  END IF;

  -- manifest
  IF p_doc ? 'manifest' THEN
    IF jsonb_typeof(p_doc->'manifest') <> 'object' THEN
      RAISE EXCEPTION 'manifest must be an object';
    END IF;
    FOR v_key, v_val IN SELECT * FROM jsonb_each(p_doc->'manifest') LOOP
      v_total_keys := v_total_keys + 1;
      IF jsonb_typeof(v_val) <> 'string' THEN
        RAISE EXCEPTION 'manifest.% must be a string', v_key;
      END IF;
      v_str := v_val #>> '{}';
      CASE v_key
        WHEN 'name', 'short_name' THEN
          IF length(v_str) < 1 OR length(v_str) > 100 THEN
            RAISE EXCEPTION 'manifest.% must be 1-100 characters', v_key;
          END IF;
        WHEN 'theme_color', 'background_color' THEN
          IF v_str !~ v_hex_re THEN
            RAISE EXCEPTION 'manifest.% must be a 6-digit hex color', v_key;
          END IF;
        ELSE
          RAISE EXCEPTION 'unknown manifest field: %', v_key;
      END CASE;
    END LOOP;
  END IF;

  -- email
  IF p_doc ? 'email' THEN
    IF jsonb_typeof(p_doc->'email') <> 'object' THEN
      RAISE EXCEPTION 'email must be an object';
    END IF;
    FOR v_key, v_val IN SELECT * FROM jsonb_each(p_doc->'email') LOOP
      v_total_keys := v_total_keys + 1;
      IF jsonb_typeof(v_val) <> 'string' THEN
        RAISE EXCEPTION 'email.% must be a string', v_key;
      END IF;
      v_str := v_val #>> '{}';
      CASE v_key
        WHEN 'from_name' THEN
          IF length(v_str) < 1 OR length(v_str) > 100 OR v_str ~ '[<>@"]' THEN
            RAISE EXCEPTION 'email.from_name must be 1-100 chars without <>@"';
          END IF;
        WHEN 'from_address' THEN
          IF v_str !~ '^[^@\s"<>]+@[^@\s"<>]+\.[^@\s"<>]+$' OR length(v_str) > 100 THEN
            RAISE EXCEPTION 'email.from_address "%" is not a plausible email address', v_str;
          END IF;
        WHEN 'logo_url' THEN
          IF v_str !~ '^https://[^\s"''<>]{1,300}$' THEN
            RAISE EXCEPTION 'email.logo_url must be an absolute https URL';
          END IF;
        WHEN 'wrapper_bg', 'wrapper_fg' THEN
          IF v_str !~ v_hex_re THEN
            RAISE EXCEPTION 'email.% must be a 6-digit hex color', v_key;
          END IF;
        ELSE
          RAISE EXCEPTION 'unknown email field: %', v_key;
      END CASE;
    END LOOP;
  END IF;

  IF v_total_keys > 150 THEN
    RAISE EXCEPTION 'branding doc has too many overrides (% > 150)', v_total_keys;
  END IF;
END;
$$;

-- ---------------------------------------------------------------
-- 3. Write RPCs (SECURITY DEFINER, admin-gated)
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.branding_save_draft(p_doc jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role_jwt('admin'::public.app_role) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  PERFORM public.branding_validate(p_doc);
  UPDATE public.site_branding
     SET draft = p_doc, updated_by = auth.uid(), updated_at = now()
   WHERE id = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.branding_publish(p_note text DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.site_branding%ROWTYPE;
  v_new_version int;
BEGIN
  IF NOT public.has_role_jwt('admin'::public.app_role) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM public.site_branding WHERE id = 1 FOR UPDATE;
  PERFORM public.branding_validate(v_row.draft);
  v_new_version := v_row.published_version + 1;
  UPDATE public.site_branding
     SET published = v_row.draft,
         published_version = v_new_version,
         updated_by = auth.uid(),
         updated_at = now()
   WHERE id = 1;
  INSERT INTO public.site_branding_versions (version, doc, note, published_by)
  VALUES (v_new_version, v_row.draft, left(p_note, 300), auth.uid());
  -- disk-constrained DB: keep only the newest 50 versions
  DELETE FROM public.site_branding_versions
   WHERE version <= v_new_version - 50;
  RETURN v_new_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.branding_revert(p_version int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc jsonb;
BEGIN
  IF NOT public.has_role_jwt('admin'::public.app_role) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  SELECT doc INTO v_doc FROM public.site_branding_versions WHERE version = p_version;
  IF v_doc IS NULL THEN
    RAISE EXCEPTION 'branding version % not found', p_version;
  END IF;
  UPDATE public.site_branding
     SET draft = v_doc, updated_by = auth.uid(), updated_at = now()
   WHERE id = 1;
  RETURN public.branding_publish('revert of v' || p_version);
END;
$$;

CREATE OR REPLACE FUNCTION public.branding_set_enabled(p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role_jwt('admin'::public.app_role) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  UPDATE public.site_branding
     SET overrides_enabled = p_enabled, updated_by = auth.uid(), updated_at = now()
   WHERE id = 1;
END;
$$;

-- Self-gating admin RPCs: EXECUTE must stay granted to authenticated
-- (the DB linter has previously revoked these — see admin RPC 403 incident).
REVOKE ALL ON FUNCTION public.branding_validate(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.branding_save_draft(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.branding_publish(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.branding_revert(int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.branding_set_enabled(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.branding_save_draft(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.branding_publish(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.branding_revert(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.branding_set_enabled(boolean) TO authenticated;

-- ---------------------------------------------------------------
-- 4. Brand assets bucket (logo / OG image / email logo)
-- ---------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('brand', 'brand', true, 2097152,
        ARRAY['image/png','image/jpeg','image/webp','image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "brand_storage_public_read" ON storage.objects;
CREATE POLICY "brand_storage_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'brand');

DROP POLICY IF EXISTS "brand_storage_admin_insert" ON storage.objects;
CREATE POLICY "brand_storage_admin_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'brand' AND public.has_role_jwt('admin'::public.app_role)
  );

DROP POLICY IF EXISTS "brand_storage_admin_update" ON storage.objects;
CREATE POLICY "brand_storage_admin_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'brand' AND public.has_role_jwt('admin'::public.app_role)
  );

DROP POLICY IF EXISTS "brand_storage_admin_delete" ON storage.objects;
CREATE POLICY "brand_storage_admin_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'brand' AND public.has_role_jwt('admin'::public.app_role)
  );
