-- Run as postgres after restore_admin_media_merge. Fixtures and merges roll back.
BEGIN;
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.merge_duplicate_images(uuid,uuid[])', 'execute') THEN
    RAISE EXCEPTION 'Anonymous callers can merge media';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.merge_duplicate_images(uuid,uuid[])', 'execute') THEN
    RAISE EXCEPTION 'Browser callers cannot reach the merge function';
  END IF;
END $$;

INSERT INTO public.image_assets (id, url_hash, url, optimization_status)
VALUES
  ('bea734f2-1111-4000-8000-000000000001', '__media_merge_test_keep', 'https://example.invalid/merge-keep.webp', 'skipped'),
  ('bea734f2-1111-4000-8000-000000000002', '__media_merge_test_remove_a', 'https://example.invalid/merge-a.webp', 'skipped'),
  ('bea734f2-1111-4000-8000-000000000003', '__media_merge_test_remove_b', 'https://example.invalid/merge-b.webp', 'skipped');

-- Two sources share a link absent on the target; all three also share another.
INSERT INTO public.image_asset_links (asset_id, entity_type, entity_id, role, sort_order)
SELECT id, 'media_merge_test', 'bea734f2-2222-4000-8000-000000000001'::uuid, 'gallery', 5
FROM public.image_assets WHERE url_hash LIKE '__media_merge_test_%';
INSERT INTO public.image_asset_links (asset_id, entity_type, entity_id, role, sort_order)
SELECT id, 'media_merge_test', 'bea734f2-2222-4000-8000-000000000002'::uuid, 'gallery', 7
FROM public.image_assets WHERE id IN
  ('bea734f2-1111-4000-8000-000000000002', 'bea734f2-1111-4000-8000-000000000003');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"role":"authenticated","sub":"bea734f2-3333-4000-8000-000000000001"}';
DO $$
BEGIN
  BEGIN
    PERFORM public.merge_duplicate_images('bea734f2-1111-4000-8000-000000000001', ARRAY['bea734f2-1111-4000-8000-000000000002']::uuid[]);
    RAISE EXCEPTION 'Non-admin merge unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims', jsonb_build_object(
  'role', 'authenticated', 'user_role', 'admin',
  'sub', (SELECT user_id FROM public.user_roles WHERE role = 'admin' LIMIT 1)
)::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  keep_id constant uuid := 'bea734f2-1111-4000-8000-000000000001';
BEGIN
  BEGIN
    PERFORM public.merge_duplicate_images(keep_id, ARRAY[keep_id]);
    RAISE EXCEPTION 'Self merge unexpectedly succeeded';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.merge_duplicate_images(keep_id, ARRAY['bea734f2-9999-4000-8000-000000000001']::uuid[]);
    RAISE EXCEPTION 'Missing asset merge unexpectedly succeeded';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  PERFORM public.merge_duplicate_images(keep_id, ARRAY[
    'bea734f2-1111-4000-8000-000000000002',
    'bea734f2-1111-4000-8000-000000000003',
    'bea734f2-1111-4000-8000-000000000003'
  ]::uuid[]);
  BEGIN
    PERFORM public.merge_duplicate_images(keep_id, ARRAY['bea734f2-1111-4000-8000-000000000002']::uuid[]);
    RAISE EXCEPTION 'Stale merge unexpectedly succeeded';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $$;
RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.image_asset_links WHERE asset_id = 'bea734f2-1111-4000-8000-000000000001') <> 2 THEN
    RAISE EXCEPTION 'Shared links were lost or duplicated';
  END IF;
  IF EXISTS (SELECT FROM public.image_asset_links WHERE asset_id IN
    ('bea734f2-1111-4000-8000-000000000002', 'bea734f2-1111-4000-8000-000000000003')) THEN
    RAISE EXCEPTION 'Source links remain';
  END IF;
  IF (SELECT count(*) FROM public.image_assets WHERE id IN
    ('bea734f2-1111-4000-8000-000000000002', 'bea734f2-1111-4000-8000-000000000003')
    AND status = 'superseded' AND superseded_by_id = 'bea734f2-1111-4000-8000-000000000001') <> 2 THEN
    RAISE EXCEPTION 'Sources were not superseded';
  END IF;
END $$;
ROLLBACK;
