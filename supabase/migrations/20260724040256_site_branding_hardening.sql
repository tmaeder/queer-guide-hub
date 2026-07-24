-- Design & Branding Control Center — trust hardening follow-ups:
--   * seed version 0 (empty doc) so the FIRST publish is undoable via revert(0)
--   * branding_publish: never prune version 0 (the permanent revert-to-stock anchor)
--   * branding_save_draft: optional optimistic-concurrency guard — a second
--     admin's stale save now errors instead of silently clobbering

INSERT INTO public.site_branding_versions (version, doc, note, published_by)
VALUES (0, '{}'::jsonb, 'stock site (no overrides)', NULL)
ON CONFLICT (version) DO NOTHING;

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
  -- disk-constrained DB: keep only the newest 50 versions, but never drop the
  -- version-0 stock anchor.
  DELETE FROM public.site_branding_versions
   WHERE version <= v_new_version - 50 AND version > 0;
  RETURN v_new_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.branding_save_draft(
  p_doc jsonb,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current timestamptz;
BEGIN
  IF NOT public.has_role_jwt('admin'::public.app_role) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  PERFORM public.branding_validate(p_doc);
  SELECT updated_at INTO v_current FROM public.site_branding WHERE id = 1 FOR UPDATE;
  IF p_expected_updated_at IS NOT NULL AND v_current IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'draft changed since you loaded it — reload before saving'
      USING ERRCODE = '40001';
  END IF;
  UPDATE public.site_branding
     SET draft = p_doc, updated_by = auth.uid(), updated_at = now()
   WHERE id = 1;
END;
$$;

-- The old single-arg signature was replaced above (default param keeps the
-- call `branding_save_draft(p_doc := …)` working). Drop the stale overload if
-- Postgres kept it as a distinct signature.
DROP FUNCTION IF EXISTS public.branding_save_draft(jsonb);

REVOKE ALL ON FUNCTION public.branding_save_draft(jsonb, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.branding_save_draft(jsonb, timestamptz) TO authenticated;
