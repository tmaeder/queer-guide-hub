-- DAM template governance: a lightweight approval + audit layer over assets
-- designated as reusable brand templates (brand_category='template'). Only
-- 'approved' templates count as published for reuse. Reversible, audited, and
-- reuses the existing access_level/version machinery.

ALTER TABLE public.image_assets
  ADD COLUMN IF NOT EXISTS template_status text
  CHECK (template_status IS NULL OR template_status IN ('draft','approved','deprecated'));
ALTER TABLE public.cms_media
  ADD COLUMN IF NOT EXISTS template_status text
  CHECK (template_status IS NULL OR template_status IN ('draft','approved','deprecated'));

-- Audit ledger of every status change.
CREATE TABLE IF NOT EXISTS public.dam_template_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL,
  asset_id uuid NOT NULL,
  old_status text,
  new_status text,
  actor uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dam_template_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dam_template_audit_admin_read ON public.dam_template_audit;
CREATE POLICY dam_template_audit_admin_read ON public.dam_template_audit FOR SELECT
  USING (public.has_any_role_jwt(ARRAY['admin','moderator','editor']::public.app_role[]));

-- Admin-gated setter (SECURITY DEFINER: the catalog tables have no client write
-- policies). Pass NULL to clear.
CREATE OR REPLACE FUNCTION public.set_template_status(p_source text, p_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_old text;
BEGIN
  IF NOT public.has_any_role_jwt(ARRAY['admin','moderator','editor']::public.app_role[]) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('draft','approved','deprecated') THEN
    RAISE EXCEPTION 'invalid template status: %', p_status;
  END IF;
  IF p_source = 'image_asset' THEN
    SELECT template_status INTO v_old FROM public.image_assets WHERE id = p_id FOR UPDATE;
    UPDATE public.image_assets SET template_status = p_status WHERE id = p_id;
  ELSIF p_source = 'cms_media' THEN
    SELECT template_status INTO v_old FROM public.cms_media WHERE id = p_id FOR UPDATE;
    UPDATE public.cms_media SET template_status = p_status WHERE id = p_id;
  ELSE
    RAISE EXCEPTION 'invalid source: %', p_source;
  END IF;
  INSERT INTO public.dam_template_audit (source_type, asset_id, old_status, new_status)
  VALUES (p_source, p_id, v_old, p_status);
END;
$$;
REVOKE ALL ON FUNCTION public.set_template_status(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_template_status(text, uuid, text) TO authenticated;

-- Surface template_status on the unified media view (appended as the last column
-- of each UNION branch so CREATE OR REPLACE keeps existing columns stable).
CREATE OR REPLACE VIEW public.admin_media_unified AS
 SELECT ia.id,
    'image_asset'::text AS source_type,
    COALESCE(NULLIF(ia.alt_text, ''::text),
        CASE
            WHEN ia.url ~~ 'data:image/svg+xml%'::text THEN 'SVG Gradient Placeholder'::text
            WHEN ia.url ~~ 'data:%'::text THEN 'Embedded Data URI'::text
            ELSE split_part(ia.url, '/'::text, '-1'::integer)
        END) AS display_name,
    ia.url,
    ia.thumbnail_url,
    ia.width,
    ia.height,
    ia.bytes AS file_size,
    COALESCE('image/'::text || ia.format, 'image/jpeg'::text) AS mime_type,
    ia.format,
    ia.source,
    ia.license,
    ia.attribution,
    ia.alt_text,
    NULL::jsonb AS alt_text_i18n,
    NULL::jsonb AS caption_i18n,
    ia.phash,
    ia.content_hash,
    ia.is_flagged,
    ia.flagged_reason,
    ia.status AS asset_status,
    COALESCE(ia.optimization_status, 'pending'::text) AS optimization_status,
    ia.metadata,
    ia.created_at,
    ia.updated_at,
    NULL::uuid AS uploaded_by,
    NULL::text AS storage_path,
    NULL::text AS bucket_name,
    ia.starred,
    ( SELECT count(*)::integer AS count
           FROM image_asset_links l
          WHERE l.asset_id = ia.id) AS usage_count,
    ( SELECT array_agg(DISTINCT l.entity_type) AS array_agg
           FROM image_asset_links l
          WHERE l.asset_id = ia.id) AS entity_types,
    ia.access_level,
    ia.brand_category,
    ia.version,
    ia.version_group_id,
    ( SELECT array_agg(ut.slug ORDER BY ut.slug) AS array_agg
           FROM unified_tag_assignments a
             JOIN unified_tags ut ON ut.id = a.tag_id
          WHERE a.entity_id = ia.id AND a.entity_type = 'image_asset'::text) AS tags,
    ia.template_status
   FROM image_assets ia
  WHERE ia.status = 'active'::text
UNION ALL
 SELECT cm.id,
    'cms_media'::text AS source_type,
    cm.original_filename AS display_name,
        CASE
            WHEN cm.storage_path IS NOT NULL AND cm.storage_bucket = 'cms-media'::text THEN 'https://xqeacpakadqfxjxjcewc.supabase.co/storage/v1/object/public/cms-media/'::text || cm.storage_path
            WHEN cm.storage_path IS NULL THEN cm.source_url
            ELSE NULL::text
        END AS url,
    NULL::text AS thumbnail_url,
    cm.width,
    cm.height,
    cm.file_size,
    cm.mime_type,
    split_part(cm.mime_type, '/'::text, 2) AS format,
    COALESCE(cm.external_source, 'upload'::text) AS source,
    cm.license,
    cm.attribution,
    cm.alt_text ->> 'en'::text AS alt_text,
    cm.alt_text AS alt_text_i18n,
    cm.caption AS caption_i18n,
    NULL::text AS phash,
    NULL::text AS content_hash,
    false AS is_flagged,
    NULL::text AS flagged_reason,
    'active'::text AS asset_status,
    'not_optimized'::text AS optimization_status,
    '{}'::jsonb AS metadata,
    cm.created_at,
    cm.created_at AS updated_at,
    cm.uploaded_by,
    cm.storage_path,
    cm.storage_bucket AS bucket_name,
    cm.starred,
    (( SELECT count(*)::integer AS count
           FROM cms_content_media ccm
          WHERE ccm.media_id = cm.id)) + (( SELECT count(*)::integer AS count
           FROM cms_media_attachments cma
          WHERE cma.media_id = cm.id)) AS usage_count,
    ARRAY[]::text[] AS entity_types,
    cm.access_level,
    cm.brand_category,
    cm.version,
    cm.version_group_id,
    ( SELECT array_agg(ut.slug ORDER BY ut.slug) AS array_agg
           FROM unified_tag_assignments a
             JOIN unified_tags ut ON ut.id = a.tag_id
          WHERE a.entity_id = cm.id AND a.entity_type = 'cms_media'::text) AS tags,
    cm.template_status
   FROM cms_media cm;
