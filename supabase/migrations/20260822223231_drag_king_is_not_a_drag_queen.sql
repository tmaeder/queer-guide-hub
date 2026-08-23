-- A drag king is not a drag queen.
--
-- `20260608200003_profession_vocabulary.sql` seeded 'drag king' as an ALIAS of
-- `Drag queen`, and 20260917100100 propagated the same mistake by adding the
-- despaced 'dragking'. Two different performance traditions and, for many of the
-- people in this table, two different gender presentations — collapsing one into
-- the other is a mislabelling of a person, not a tidy-up of a vocabulary.
--
-- WHY IT MATTERED ONLY NOW. Until 20260917100200 the alias was latent: nothing
-- rewrote `personalities.profession`, so a row reading "Drag King" kept saying
-- "Drag King" and the alias only ever affected matching. The v2 normalizer plus
-- the write gate make the vocabulary the stored value, so the same alias would
-- have overwritten 8 rows (6 × "Drag King", plus one composite each with
-- "Performance-Künstler/in" and "Schauspieler:in") with "Drag queen" — and,
-- because the gate normalizes every future write too, done so permanently and to
-- every drag king imported from here on. Caught by dry-running
-- normalize_profession_full() over the corpus BEFORE draining the backfill;
-- none of the 8 was public yet.
--
-- Aliases here are drag-king spellings ONLY. 'drag performer', 'drag artist' and
-- 'drag entertainer' stay on `Drag queen`: they are genuinely ambiguous, and the
-- existing row is where an unspecified drag performer has always landed. Moving
-- them would silently re-label a much larger cohort in the opposite direction —
-- the same class of error in reverse.

INSERT INTO public.professions (slug, name, category, icon_name, aliases, sort_order, is_active)
VALUES (
  'drag-king', 'Drag king', 'Performance', 'crown',
  ARRAY['drag king','dragking','drag-king','dragkoenig','dragkönig','drag-könig','drag-koenig'],
  8, true
)
ON CONFLICT (slug) DO UPDATE
  SET name       = EXCLUDED.name,
      category   = EXCLUDED.category,
      icon_name  = EXCLUDED.icon_name,
      aliases    = EXCLUDED.aliases,
      is_active  = EXCLUDED.is_active;

-- Remove every drag-king spelling from Drag queen. Tier 1 of
-- normalize_profession_full() is a full-string alias match with no ordering
-- between vocabulary rows, so leaving them on both rows would make the result
-- depend on sort_order — a coin flip, not a fix.
UPDATE public.professions
   SET aliases = ARRAY(
         SELECT a FROM unnest(aliases) a
         WHERE lower(regexp_replace(a, '[^a-zäöüß]', '', 'g')) NOT IN
               ('dragking','dragkoenig','dragkonig','dragkönig')
       )
 WHERE slug = 'drag-queen';

DO $$
DECLARE v_king uuid; v_queen_bad int;
BEGIN
  SELECT id INTO v_king FROM public.professions WHERE slug = 'drag-king';
  IF v_king IS NULL THEN
    RAISE EXCEPTION 'drag-king row missing after upsert';
  END IF;

  SELECT count(*) INTO v_queen_bad
    FROM public.professions, unnest(aliases) a
   WHERE slug = 'drag-queen'
     AND lower(regexp_replace(a, '[^a-zäöüß]', '', 'g')) IN
         ('dragking','dragkoenig','dragkonig','dragkönig');
  IF v_queen_bad > 0 THEN
    RAISE EXCEPTION 'Drag queen still carries % drag-king alias(es)', v_queen_bad;
  END IF;

  IF public.normalize_profession('Drag King') IS DISTINCT FROM 'Drag king' THEN
    RAISE EXCEPTION 'normalize_profession(''Drag King'') = %, expected ''Drag king''',
      public.normalize_profession('Drag King');
  END IF;
  IF public.normalize_profession('Drag Queen') IS DISTINCT FROM 'Drag queen' THEN
    RAISE EXCEPTION 'normalize_profession(''Drag Queen'') = %, expected ''Drag queen''',
      public.normalize_profession('Drag Queen');
  END IF;
END $$;
