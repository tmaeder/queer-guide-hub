-- assign_personality_profession_tags must also read personalities.roles.
--
-- The German normalization (20260916100200) moves SECONDARY professions out of
-- the free-text `profession` column and into `roles[]` as vocabulary slugs, so a
-- person stored as "Aktivist/in; Journalist/in" now has profession='Activist' and
-- roles={journalist}. This function joined on `profession ILIKE '%kw%'` only, so
-- that person would stop matching the `journalist` keyword.
--
-- Measured on prod before the change: `journalist` matched 151 rows against the
-- raw column and 75 against the normalized one — the 76-row gap is exactly the
-- cohort whose journalism is a secondary profession. (The function only ever
-- INSERTs and never removes, so already-assigned tags were never at risk; the
-- loss would have been silent under-tagging of every future row.)
--
-- `personality_profession_tags.profession_kw` is a 10-word English list whose
-- terms coincide with the profession SLUGS for 8 of 10 (activist, writer, poet,
-- journalist, photographer, actor, singer, athlete); `author` and `actress` have
-- no slug and keep matching through the text arm alone. So an exact-equality arm
-- against roles recovers precisely the secondaries and cannot over-match: it is
-- `= ANY(roles)`, not a substring test, because a slug is an exact-match token.

CREATE OR REPLACE FUNCTION public.assign_personality_profession_tags(
  p_limit integer DEFAULT 500, p_dry_run boolean DEFAULT false)
 RETURNS TABLE(out_personality_id uuid, out_tag_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT p.id AS pid, m.tag_id AS tid
    FROM public.personalities p
    JOIN public.personality_profession_tags m
      ON (p.profession IS NOT NULL AND p.profession ILIKE '%' || m.profession_kw || '%')
      -- Secondary professions now live here; slugs are exact tokens, never substrings.
      OR (m.profession_kw = ANY (coalesce(p.roles, '{}'::text[])))
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
    out_personality_id := r.pid; out_tag_id := r.tid; RETURN NEXT;
  END LOOP;

  IF NOT p_dry_run THEN
    UPDATE public.unified_tags t
    SET usage_count = sub.cnt
    FROM (
      SELECT a.tag_id AS tid, count(*) AS cnt
      FROM public.unified_tag_assignments a GROUP BY a.tag_id
    ) sub
    WHERE sub.tid = t.id AND t.usage_count IS DISTINCT FROM sub.cnt;
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.assign_personality_profession_tags(integer, boolean) IS
  'Assigns profession-derived tags. Matches personality_profession_tags.profession_kw '
  'against the free-text profession (substring) OR the roles[] slug array (exact) — '
  'the latter added when normalization moved secondary professions into roles.';
