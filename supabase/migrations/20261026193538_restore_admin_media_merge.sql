-- Browser access was revoked because the old definer had no authorization check.
-- Keep the privileged implementation outside the Data API and authorize before writes.
CREATE OR REPLACE FUNCTION api_private.merge_duplicate_images(
  p_keep_id uuid, p_remove_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_remove_ids uuid[];
BEGIN
  IF NOT coalesce(public.is_admin(auth.uid()), false)
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only admins can merge media' USING ERRCODE = '42501';
  END IF;

  IF p_keep_id IS NULL OR coalesce(cardinality(p_remove_ids), 0) = 0
     OR p_keep_id = ANY(p_remove_ids)
     OR array_position(p_remove_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Choose a kept image and different images to merge' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(DISTINCT id) INTO v_remove_ids FROM unnest(p_remove_ids) AS ids(id);

  -- Serialize overlapping merges and validate the current state after locking.
  PERFORM id FROM public.image_assets
  WHERE id = p_keep_id OR id = ANY(v_remove_ids)
  ORDER BY id FOR UPDATE;
  IF NOT EXISTS (SELECT FROM public.image_assets WHERE id = p_keep_id AND status = 'active')
     OR (SELECT count(*) FROM public.image_assets WHERE id = ANY(v_remove_ids) AND status = 'active')
        <> cardinality(v_remove_ids) THEN
    RAISE EXCEPTION 'Images changed or are no longer active; refresh and try again' USING ERRCODE = '22023';
  END IF;

  -- INSERT handles links shared by several removed assets, which UPDATE could
  -- collapse onto the same primary key and fail with a unique violation.
  INSERT INTO public.image_asset_links
    (asset_id, entity_type, entity_id, role, sort_order, added_by, added_at)
  SELECT p_keep_id, entity_type, entity_id, role, sort_order, added_by, added_at
  FROM public.image_asset_links WHERE asset_id = ANY(v_remove_ids)
  ORDER BY sort_order, added_at, asset_id
  ON CONFLICT (asset_id, entity_type, entity_id, role) DO NOTHING;

  DELETE FROM public.image_asset_links WHERE asset_id = ANY(v_remove_ids);

  UPDATE public.social_profiles SET avatar_asset_id = p_keep_id
  WHERE avatar_asset_id = ANY(v_remove_ids);
  UPDATE public.marketplace_listings SET overview_image_asset_id = p_keep_id
  WHERE overview_image_asset_id = ANY(v_remove_ids);

  UPDATE public.image_assets
  SET status = 'superseded', superseded_by_id = p_keep_id, updated_at = now()
  WHERE id = ANY(v_remove_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_duplicate_images(
  p_keep_id uuid, p_remove_ids uuid[]
)
RETURNS void
LANGUAGE sql SECURITY INVOKER
SET search_path = ''
AS $$ SELECT api_private.merge_duplicate_images(p_keep_id, p_remove_ids) $$;

REVOKE ALL ON FUNCTION api_private.merge_duplicate_images(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.merge_duplicate_images(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api_private.merge_duplicate_images(uuid, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_images(uuid, uuid[]) TO authenticated, service_role;
