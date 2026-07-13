-- Repair shim: this migration was applied live (via MCP apply_migration) by a
-- concurrent session on 2026-07-13 but its file never landed in the repo,
-- which breaks CI `db push` ("Remote migration versions not found in local
-- migrations directory"). Content reconstructed from the live function
-- definition; CREATE OR REPLACE is idempotent, so re-running is safe.
--
-- Change: get_similar_personalities gains an adult gate — recommendations
-- from a non-adult source personality never surface is_adult profiles.

CREATE OR REPLACE FUNCTION public.get_similar_personalities(personality_uuid uuid, result_limit integer DEFAULT 6, min_similarity double precision DEFAULT 0.3)
 RETURNS TABLE(id uuid, name text, profession text, nationality text, image_url text, is_living boolean, birth_date date, death_date date, description text, similarity double precision)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  source_embedding vector(1024);
  source_is_adult boolean;
BEGIN
  SELECT COALESCE(p.is_adult, false) INTO source_is_adult
  FROM personalities p WHERE p.id = personality_uuid;

  SELECT ce.embedding INTO source_embedding
  FROM content_embeddings ce
  WHERE ce.content_id = personality_uuid
    AND ce.content_type = 'personality'
  LIMIT 1;

  IF source_embedding IS NULL THEN
    RETURN QUERY
    SELECT
      p.id, p.name, p.profession, p.nationality, p.image_url,
      p.is_living, p.birth_date, p.death_date, p.description,
      0.0::FLOAT AS similarity
    FROM personalities p
    WHERE p.id != personality_uuid
      AND p.visibility = 'public'
      AND (source_is_adult OR COALESCE(p.is_adult, false) = false)
      AND p.profession IS NOT NULL
      AND p.profession = (SELECT p2.profession FROM personalities p2 WHERE p2.id = personality_uuid)
    ORDER BY p.view_count DESC NULLS LAST
    LIMIT result_limit;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.name, p.profession, p.nationality, p.image_url,
    p.is_living, p.birth_date, p.death_date, p.description,
    (1 - (ce.embedding <=> source_embedding))::FLOAT AS similarity
  FROM content_embeddings ce
  JOIN personalities p ON p.id = ce.content_id
  WHERE ce.content_type = 'personality'
    AND ce.content_id != personality_uuid
    AND p.visibility = 'public'
    AND (source_is_adult OR COALESCE(p.is_adult, false) = false)
    AND (1 - (ce.embedding <=> source_embedding)) > min_similarity
  ORDER BY ce.embedding <=> source_embedding
  LIMIT result_limit;
END;
$function$;
