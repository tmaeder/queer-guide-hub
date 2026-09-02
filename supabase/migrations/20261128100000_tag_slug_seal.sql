-- Tag slug seal: a name-derived slug wins when, and ONLY when, the name is non-ASCII.
--
-- The fault: source-tags-extract computes its own slug with
--   name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
-- which never transliterates, so 'ü' falls into the character class and becomes
-- '-': "Bühne" -> "b-hne". It then hands that slug to upsert({onConflict:'slug'}),
-- and the caller-supplied slug beats both triggers:
--   * normalize_tag_input() only re-derives from the name when the slug is
--     NULL/empty (or, on UPDATE, when the name changed);
--   * unified_tags_normalize_slug() does normalize_tag_slug(coalesce(NEW.slug,
--     NEW.name)) -- slug first.
-- 9 active rows carry lossy slugs from this (b-hne, preistr-ger, nonbin-r,
-- sch-neberg, kirsten-pl-tz, m-nchen), all created AFTER 20260802104650 added
-- the transliterating normalize_tag_slug() that was supposed to have fixed it.
-- normalize_tag_slug('Prüfung') already returns 'prufung'; the input just never
-- reached it.
--
-- WHY THE CONDITION IS NARROW -- do not widen this to "always derive from the
-- name". public.unified_tags serves FOUR vocabularies at once and names are not
-- unique in it, only slugs are. The marketplace facets (mat-, vibe-, occ-,
-- color-, genre-) and the news taxonomy (news-) are deliberate namespace
-- prefixes carried in the slug and NOT in the name. A blanket rule would rename
-- mat-silicone -> silicone (4,643 uses), news-education -> education (691), and
-- would collapse occ-pride and news-pride -- two DIFFERENT tags that share the
-- name "Pride" -- onto one slug. Every one of those prefixes sits on a pure
-- ASCII name, which is exactly what makes them unreachable from this branch.
--
-- Signature and search_path below are byte-identical to the live function
-- (verified against pg_get_functiondef on prod). No CREATE TRIGGER: the trigger
-- trg_unified_tags_normalize_slug already exists and points at this function.

CREATE OR REPLACE FUNCTION public.unified_tags_normalize_slug()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog', 'extensions'
AS $function$
BEGIN
  IF NEW.name IS NOT NULL AND NEW.name ~ '[^\x00-\x7F]' THEN
    -- A caller has no business hand-slugging a diacritic name.
    NEW.slug := normalize_tag_slug(NEW.name);
  ELSE
    NEW.slug := normalize_tag_slug(coalesce(NEW.slug, NEW.name));
  END IF;

  IF NEW.slug = '' OR NEW.slug IS NULL THEN
    NEW.slug := encode(digest(coalesce(NEW.name, NEW.id::text), 'sha1'), 'hex');
  END IF;
  RETURN NEW;
END;
$function$;
