-- Deterministic, SAFE auto-tagging for named people.
-- HARD RULE: only tags from an explicit allow-list of professional/identity/
-- activism categories are ever attached to a real person. No LLM, no NULL-category
-- tags, no kink/NSFW/slang. Free-form LLM tagging is deferred to a human-gated phase.

-- 1. Curated mapping: lowercased profession substring -> existing tag.
CREATE TABLE IF NOT EXISTS public.personality_profession_tags (
  id            BIGSERIAL PRIMARY KEY,
  profession_kw TEXT NOT NULL,
  tag_id        UUID NOT NULL REFERENCES public.unified_tags(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profession_kw, tag_id)
);

-- 2. Seed mapping from EXISTING whitelisted tags only.
WITH allowed AS (
  SELECT id, lower(name) AS lname FROM public.unified_tags
  WHERE status IS DISTINCT FROM 'deprecated'
    AND category IS NOT NULL
    AND lower(category) IN (
      'rights & activism','political activism','legal rights','identity & orientation',
      'sexual orientation','gender identity','intersex','lgbtq+ culture','lgbtq+ rights',
      'historical movements','social movements','history & heritage'
    )
), kw(profession_kw, tag_name) AS (
  VALUES
    ('activist','activist'), ('politician','politician'), ('writer','writer'),
    ('author','author'), ('poet','poet'), ('artist','artist'), ('musician','musician'),
    ('singer','singer'), ('actor','actor'), ('actress','actor'), ('filmmaker','filmmaker'),
    ('director','director'), ('journalist','journalist'), ('academic','academic'),
    ('historian','historian'), ('scientist','scientist'), ('athlete','athlete'),
    ('drag','drag queen'), ('model','model'), ('photographer','photographer')
)
INSERT INTO public.personality_profession_tags (profession_kw, tag_id)
SELECT kw.profession_kw, a.id
FROM kw JOIN allowed a ON a.lname = kw.tag_name
ON CONFLICT (profession_kw, tag_id) DO NOTHING;

-- actor/actress → the safe 'actor' tag (category 'LGBTQ+ Culture'). Seeded explicitly
-- because a duplicate NULL-category 'actor' tag confuses the name-only join above.
INSERT INTO public.personality_profession_tags (profession_kw, tag_id)
SELECT kw, (SELECT id FROM public.unified_tags WHERE lower(name)='actor' AND category='LGBTQ+ Culture' LIMIT 1)
FROM (VALUES ('actor'),('actress')) v(kw)
WHERE EXISTS (SELECT 1 FROM public.unified_tags WHERE lower(name)='actor' AND category='LGBTQ+ Culture')
ON CONFLICT (profession_kw, tag_id) DO NOTHING;

-- 3. Assignment RPC: attach mapped tags whose keyword appears in profession.
CREATE OR REPLACE FUNCTION public.assign_personality_profession_tags(
  p_limit   INT DEFAULT 500,
  p_dry_run BOOLEAN DEFAULT false
)
RETURNS TABLE(personality_id UUID, tag_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.id AS pid, m.tag_id AS tid
    FROM public.personalities p
    JOIN public.personality_profession_tags m
      ON p.profession IS NOT NULL AND p.profession ILIKE '%' || m.profession_kw || '%'
    WHERE p.duplicate_of_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.unified_tag_assignments a
        WHERE a.entity_type='personality' AND a.entity_id=p.id AND a.tag_id=m.tag_id
      )
    LIMIT p_limit
  LOOP
    IF NOT p_dry_run THEN
      INSERT INTO public.unified_tag_assignments (tag_id, entity_id, entity_type)
      VALUES (r.tid, r.pid, 'personality')
      ON CONFLICT DO NOTHING;
    END IF;
    personality_id := r.pid; tag_id := r.tid; RETURN NEXT;
  END LOOP;

  IF NOT p_dry_run THEN
    UPDATE public.unified_tags t
    SET usage_count = sub.cnt
    FROM (
      SELECT tag_id, count(*) AS cnt FROM public.unified_tag_assignments GROUP BY tag_id
    ) sub
    WHERE sub.tag_id = t.id AND t.usage_count IS DISTINCT FROM sub.cnt;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_personality_profession_tags(INT, BOOLEAN) TO service_role;

COMMENT ON FUNCTION public.assign_personality_profession_tags IS
  'Deterministic profession->tag assignment using the curated, category-whitelisted personality_profession_tags map. Never assigns sensitive/NSFW/uncategorised tags. p_dry_run previews.';
