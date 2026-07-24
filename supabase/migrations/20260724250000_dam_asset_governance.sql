-- Brand & DAM: asset governance layer.
-- Extends the EXISTING catalog (image_assets + cms_media) rather than adding a competing table.
-- Adds per-asset access_level (public/partner/internal), brand_category, version lineage;
-- tiered RLS; a private bytes bucket for non-public tiers; reproduces dashboard-only buckets
-- into source; and extends admin_media_unified with the new fields + tag slugs.
-- Fully idempotent (safe to re-apply): guards on every statement.

-- ---------------------------------------------------------------------------
-- 1. Columns on both catalog tables (constant DEFAULT => metadata-only, no rewrite/backfill).
-- ---------------------------------------------------------------------------
ALTER TABLE public.image_assets
  ADD COLUMN IF NOT EXISTS access_level text NOT NULL DEFAULT 'public'
    CHECK (access_level IN ('public','partner','internal')),
  ADD COLUMN IF NOT EXISTS brand_category text
    CHECK (brand_category IN ('logo','color','typography','photography','iconography','illustration','template','guideline','other')),
  ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS version_group_id uuid;

ALTER TABLE public.cms_media
  ADD COLUMN IF NOT EXISTS access_level text NOT NULL DEFAULT 'public'
    CHECK (access_level IN ('public','partner','internal')),
  ADD COLUMN IF NOT EXISTS brand_category text
    CHECK (brand_category IN ('logo','color','typography','photography','iconography','illustration','template','guideline','other')),
  ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS version_group_id uuid,
  -- which storage bucket holds the bytes: 'cms-media' (public) or 'dam-private' (partner/internal)
  ADD COLUMN IF NOT EXISTS storage_bucket text NOT NULL DEFAULT 'cms-media';

CREATE INDEX IF NOT EXISTS idx_image_assets_brand_category ON public.image_assets (brand_category) WHERE brand_category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_image_assets_version_group ON public.image_assets (version_group_id) WHERE version_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_image_assets_access_level ON public.image_assets (access_level) WHERE access_level <> 'public';
CREATE INDEX IF NOT EXISTS idx_cms_media_brand_category ON public.cms_media (brand_category) WHERE brand_category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cms_media_version_group ON public.cms_media (version_group_id) WHERE version_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cms_media_access_level ON public.cms_media (access_level) WHERE access_level <> 'public';

-- ---------------------------------------------------------------------------
-- 2. Tiered row RLS. Default 'public' keeps every existing row visible => no
--    behavior change for storefront/search. partner => any authed; internal => staff.
-- ---------------------------------------------------------------------------
-- The tiered policies below call has_any_role_jwt from anon/authenticated contexts;
-- it was only granted to authenticated. Grant to anon too (returns false for anon) so
-- anon reads evaluate the policy instead of erroring with "permission denied for function".
GRANT EXECUTE ON FUNCTION public.has_any_role_jwt(public.app_role[]) TO anon, authenticated;

DROP POLICY IF EXISTS image_assets_select ON public.image_assets;
CREATE POLICY image_assets_select ON public.image_assets FOR SELECT USING (
  (status = 'active' AND access_level = 'public')
  OR (status = 'active' AND access_level = 'partner' AND (SELECT auth.uid()) IS NOT NULL)
  OR (SELECT public.has_any_role_jwt(ARRAY['admin','moderator','editor']::public.app_role[]))
);

DROP POLICY IF EXISTS "Public media viewable by all" ON public.cms_media;
CREATE POLICY "Public media viewable by all" ON public.cms_media FOR SELECT USING (
  access_level = 'public'
  OR (access_level = 'partner' AND (SELECT auth.uid()) IS NOT NULL)
  OR (SELECT public.has_any_role_jwt(ARRAY['admin','moderator','editor']::public.app_role[]))
);

-- Debt: strip stray anon table-level write grants (RLS already blocked writes; this
-- removes the over-grant surface). SELECT/service_role untouched.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.cms_media FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.cms_content_media FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.cms_media_attachments FROM anon;

-- ---------------------------------------------------------------------------
-- 3. Private bytes bucket for partner/internal tiers. Public tier keeps living in the
--    public buckets (cms-media/brand); non-public bytes live here, served via signed URLs.
--    Path convention: first folder segment is the tier ('partner' | 'internal').
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('dam-private','dam-private', false, 26214400,
        ARRAY['image/png','image/jpeg','image/webp','image/svg+xml','image/gif','application/pdf','font/woff2'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS dam_private_read ON storage.objects;
CREATE POLICY dam_private_read ON storage.objects FOR SELECT USING (
  bucket_id = 'dam-private' AND (
    public.has_any_role_jwt(ARRAY['admin','moderator','editor']::public.app_role[])
    OR ((storage.foldername(name))[1] = 'partner' AND auth.uid() IS NOT NULL)
  )
);
DROP POLICY IF EXISTS dam_private_insert ON storage.objects;
CREATE POLICY dam_private_insert ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'dam-private' AND public.has_any_role_jwt(ARRAY['admin','moderator','editor']::public.app_role[])
);
DROP POLICY IF EXISTS dam_private_update ON storage.objects;
CREATE POLICY dam_private_update ON storage.objects FOR UPDATE USING (
  bucket_id = 'dam-private' AND public.has_any_role_jwt(ARRAY['admin','moderator','editor']::public.app_role[])
);
DROP POLICY IF EXISTS dam_private_delete ON storage.objects;
CREATE POLICY dam_private_delete ON storage.objects FOR DELETE USING (
  bucket_id = 'dam-private' AND public.has_any_role_jwt(ARRAY['admin','moderator','editor']::public.app_role[])
);

-- ---------------------------------------------------------------------------
-- 4. Reproduce dashboard-only buckets into source (auditability debt). Definitions are
--    no-ops if present; policies are re-declared verbatim from the live DB so the whole
--    media surface is reproducible from the repo.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public) VALUES
  ('avatars','avatars', true),
  ('cms-media','cms-media', true),
  ('user-photos','user-photos', true)
ON CONFLICT (id) DO NOTHING;

-- avatars: owner-scoped write, public bucket read via public URL
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar" ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar" ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- user-photos: owner-scoped write
DROP POLICY IF EXISTS "Users can upload their own photos" ON storage.objects;
CREATE POLICY "Users can upload their own photos" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'user-photos' AND (auth.uid())::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Users can update their own photos" ON storage.objects;
CREATE POLICY "Users can update their own photos" ON storage.objects FOR UPDATE
  USING (bucket_id = 'user-photos' AND (auth.uid())::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Users can delete their own photos" ON storage.objects;
CREATE POLICY "Users can delete their own photos" ON storage.objects FOR DELETE
  USING (bucket_id = 'user-photos' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- cms-media: authenticated read + owner-scoped write (first folder = uploader uid)
DROP POLICY IF EXISTS "Authenticated users can view CMS media files" ON storage.objects;
CREATE POLICY "Authenticated users can view CMS media files" ON storage.objects FOR SELECT
  USING (bucket_id = 'cms-media' AND auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authenticated users can upload CMS media files" ON storage.objects;
CREATE POLICY "Authenticated users can upload CMS media files" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'cms-media' AND auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authenticated users can update their own CMS media files" ON storage.objects;
CREATE POLICY "Authenticated users can update their own CMS media files" ON storage.objects FOR UPDATE
  USING (bucket_id = 'cms-media' AND (auth.uid())::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Authenticated users can delete their own CMS media files" ON storage.objects;
CREATE POLICY "Authenticated users can delete their own CMS media files" ON storage.objects FOR DELETE
  USING (bucket_id = 'cms-media' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- ---------------------------------------------------------------------------
-- 5. Extend admin_media_unified with the DAM fields + tag slugs. CREATE OR REPLACE keeps
--    the existing leading columns unchanged and appends the new ones (replace-safe).
-- ---------------------------------------------------------------------------
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
    ( SELECT array_agg(ut.slug ORDER BY ut.slug)
           FROM unified_tag_assignments a
           JOIN unified_tags ut ON ut.id = a.tag_id
          WHERE a.entity_id = ia.id AND a.entity_type = 'image_asset') AS tags
   FROM image_assets ia
  WHERE ia.status = 'active'::text
UNION ALL
 SELECT cm.id,
    'cms_media'::text AS source_type,
    cm.original_filename AS display_name,
        CASE
            -- Only public-bucket bytes get a direct public URL. Private (dam-private) rows
            -- return NULL here; the client mints a short-lived signed URL instead.
            WHEN cm.storage_path IS NOT NULL AND cm.storage_bucket = 'cms-media'
                THEN 'https://xqeacpakadqfxjxjcewc.supabase.co/storage/v1/object/public/cms-media/'::text || cm.storage_path
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
    ( SELECT array_agg(ut.slug ORDER BY ut.slug)
           FROM unified_tag_assignments a
           JOIN unified_tags ut ON ut.id = a.tag_id
          WHERE a.entity_id = cm.id AND a.entity_type = 'cms_media') AS tags
   FROM cms_media cm;
