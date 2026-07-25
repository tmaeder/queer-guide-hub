-- Design & Branding Control Center — custom font management.
--   * branding_validate gains a `fonts` section (display/sans slots, woff2 files)
--   * brand bucket accepts font/woff2 uploads
--
-- The font URL host is hardcoded (branding_validate is IMMUTABLE and cannot read
-- config): only the project's own storage bucket or a site-relative /fonts/ path.

-- Allow font uploads into the existing public brand bucket (INSERT used
-- ON CONFLICT DO NOTHING originally, so the mime list must be UPDATEd).
UPDATE storage.buckets
   SET allowed_mime_types = array_append(allowed_mime_types, 'font/woff2')
 WHERE id = 'brand' AND NOT ('font/woff2' = ANY(allowed_mime_types));

CREATE OR REPLACE FUNCTION public.branding_validate(p_doc jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
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
  -- font URL: our own storage bucket or a site-relative /fonts/ path, ending .woff2
  v_font_url_re text := '^(https://xqeacpakadqfxjxjcewc\.supabase\.co/storage/v1/object/public/brand/|/fonts/)[^\s"''<>]{1,300}\.woff2$';
  v_family_re   text := '^[A-Za-z0-9 _-]{1,60}$';
  v_weight_re   text := '^[1-9]00( [1-9]00)?$';
  v_top_key text;
  v_mode text;
  v_key text;
  v_val jsonb;
  v_str text;
  v_total_keys int := 0;
  v_item jsonb;
  v_slot text;
  v_slot_obj jsonb;
  v_file jsonb;
  v_fkey text;
BEGIN
  IF p_doc IS NULL OR jsonb_typeof(p_doc) <> 'object' THEN
    RAISE EXCEPTION 'branding doc must be a JSON object';
  END IF;
  IF pg_column_size(p_doc) > 32768 THEN
    RAISE EXCEPTION 'branding doc too large (max 32 KB)';
  END IF;

  FOR v_top_key IN SELECT jsonb_object_keys(p_doc) LOOP
    IF v_top_key NOT IN ('tokens','meta','manifest','email','fonts') THEN
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

  -- fonts.display / fonts.sans
  IF p_doc ? 'fonts' THEN
    IF jsonb_typeof(p_doc->'fonts') <> 'object' THEN
      RAISE EXCEPTION 'fonts must be an object';
    END IF;
    FOR v_slot IN SELECT jsonb_object_keys(p_doc->'fonts') LOOP
      IF v_slot NOT IN ('display','sans') THEN
        RAISE EXCEPTION 'unknown font slot: %', v_slot;
      END IF;
      v_slot_obj := p_doc->'fonts'->v_slot;
      IF jsonb_typeof(v_slot_obj) <> 'object' THEN
        RAISE EXCEPTION 'fonts.% must be an object', v_slot;
      END IF;
      v_total_keys := v_total_keys + 1;
      -- keys must be exactly family + files
      FOR v_fkey IN SELECT jsonb_object_keys(v_slot_obj) LOOP
        IF v_fkey NOT IN ('family','files') THEN
          RAISE EXCEPTION 'fonts.% has unknown key: %', v_slot, v_fkey;
        END IF;
      END LOOP;
      IF (v_slot_obj->>'family') IS NULL OR (v_slot_obj->>'family') !~ v_family_re THEN
        RAISE EXCEPTION 'fonts.%.family must match %s (letters/digits/space/_/-, 1-60)', v_slot, v_family_re;
      END IF;
      IF jsonb_typeof(v_slot_obj->'files') <> 'array'
         OR jsonb_array_length(v_slot_obj->'files') < 1
         OR jsonb_array_length(v_slot_obj->'files') > 4 THEN
        RAISE EXCEPTION 'fonts.%.files must be an array of 1-4 entries', v_slot;
      END IF;
      FOR v_file IN SELECT * FROM jsonb_array_elements(v_slot_obj->'files') LOOP
        IF jsonb_typeof(v_file) <> 'object' THEN
          RAISE EXCEPTION 'fonts.% file must be an object', v_slot;
        END IF;
        FOR v_fkey IN SELECT jsonb_object_keys(v_file) LOOP
          IF v_fkey NOT IN ('url','weight','style') THEN
            RAISE EXCEPTION 'fonts.% file has unknown key: %', v_slot, v_fkey;
          END IF;
        END LOOP;
        IF (v_file->>'url') IS NULL OR (v_file->>'url') !~ v_font_url_re THEN
          RAISE EXCEPTION 'fonts.% file url must be a woff2 in our storage bucket or /fonts/', v_slot;
        END IF;
        IF (v_file->>'weight') IS NULL OR (v_file->>'weight') !~ v_weight_re THEN
          RAISE EXCEPTION 'fonts.% file weight "%" must be e.g. 400 or "100 900"', v_slot, (v_file->>'weight');
        END IF;
        IF COALESCE(v_file->>'style','normal') NOT IN ('normal','italic') THEN
          RAISE EXCEPTION 'fonts.% file style must be normal or italic', v_slot;
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
