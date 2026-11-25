-- A deliberately narrow public projection over private claim-review data.
-- SECURITY DEFINER is required because anon cannot read personality_claim_sources.
-- No raw claims, rejected/pending evidence, or non-public records are returned.
CREATE SCHEMA IF NOT EXISTS api_private;

CREATE OR REPLACE FUNCTION api_private.personality_public_editorial(p_ids uuid[], p_lang text DEFAULT 'en')
RETURNS TABLE(personality_id uuid, connection text, details text, sources jsonb, translations jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT p.id,
    CASE WHEN verified.connection_sources IS NOT NULL THEN p.lgbti_connection END,
    CASE WHEN verified.detail_sources IS NOT NULL THEN nullif(btrim(p.lgbti_details), '') END,
    coalesce(verified.connection_sources, '[]'::jsonb) || coalesce(verified.detail_sources, '[]'::jsonb),
    coalesce((
      SELECT jsonb_object_agg(ct.field_name, ct.value)
      FROM public.content_translations ct
      WHERE ct.table_name = 'personalities' AND ct.record_id = p.id
        AND ct.language = lower(split_part(replace(p_lang, '_', '-'), '-', 1))
        AND ct.status = 'published' AND nullif(btrim(ct.value), '') IS NOT NULL
        AND (ct.field_name IN ('description', 'bio', 'profession')
          OR (ct.field_name = 'lgbti_details' AND verified.detail_sources IS NOT NULL))
    ), '{}'::jsonb)
  FROM public.personalities p
  LEFT JOIN LATERAL (
    SELECT
      jsonb_agg(DISTINCT jsonb_build_object('url', s.source_url)) FILTER (WHERE c.field_name = 'lgbti_connection') AS connection_sources,
      jsonb_agg(DISTINCT jsonb_build_object('url', s.source_url)) FILTER (WHERE c.field_name = 'lgbti_details') AS detail_sources
    FROM public.personality_claim_sources c
    JOIN public.personality_sources s ON s.id = c.source_id AND s.personality_id = p.id
    WHERE c.personality_id = p.id AND c.verification_status = 'verified'
      AND s.source_url ~ '^https?://[^/[:space:]]+'
      AND c.field_name IN ('lgbti_connection', 'lgbti_details')
  ) verified ON true
  WHERE p.id = ANY(p_ids[1:100]) AND p.visibility = 'public'
    AND p.duplicate_of_id IS NULL;
$$;
REVOKE ALL ON FUNCTION api_private.personality_public_editorial(uuid[], text) FROM PUBLIC;
GRANT USAGE ON SCHEMA api_private TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION api_private.personality_public_editorial(uuid[], text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.personality_public_editorial(p_ids uuid[], p_lang text DEFAULT 'en')
RETURNS TABLE(personality_id uuid, connection text, details text, sources jsonb, translations jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT * FROM api_private.personality_public_editorial(p_ids, p_lang); $$;
REVOKE ALL ON FUNCTION public.personality_public_editorial(uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.personality_public_editorial(uuid[], text) TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.personality_public_editorial(uuid[], text) IS
  'Public, bounded editorial projection: verified connections and explanations with sources; published translations only.';
