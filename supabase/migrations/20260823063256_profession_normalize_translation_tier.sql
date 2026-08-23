-- RECOVERED, not authored. Applied to prod at version 20260823063256 with no file on
-- main, in any local worktree, and no open PR carrying it. Migration drift makes
-- `supabase db push` SKIP for the WHOLE repo, so every open PR fails
-- migration-versions as collateral and no merged migration reaches prod.
--
-- Byte-for-byte from supabase_migrations.schema_migrations.statements
-- (6256 chars, md5 261e9d84a4c74fe040d579b1ceb92b82), transported as base64 and decoded
-- locally so no hand-transcription could mangle an escape. Already live, so
-- applying it is a no-op; the file exists so db push can match the version.
--
-- One of five orphans applied within ~20 minutes on 2026-08-23 by concurrent
-- sessions. `apply_migration` is not done until the file is MERGED TO MAIN.

-- normalize_profession v2.2 — consult profession_translations.
--
-- New tier 2c, per segment, AFTER the vocabulary lookup fails and BEFORE the
-- fallback: if the segment (or any of its gender/umlaut spelling variants) is a
-- known non-English term, store the English. A row whose english is NULL is an
-- explicit "not a profession" and clears the value rather than storing the German.
--
-- Tier order matters: vocabulary first, so a term that IS one of the 35 canonicals
-- keeps resolving there and keeps its slug (the roles[] array and the facet chips
-- depend on the slug, which a translation has none of).

CREATE OR REPLACE FUNCTION public.normalize_profession_full(p text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_clean   text;
  v_deg     text;
  v_segs    text[];
  v_kept    text[];
  v_seg     text;
  v_hit     text;
  v_slug    text;
  v_primary text := NULL;
  v_pslug   text := NULL;
  v_roles   text[] := '{}';
  v_all     text[] := '{}';
  v_forms   text[];
  v_i       int := 0;
  v_tr      record;
  v_tr_seen boolean := false;
BEGIN
  IF p IS NULL OR btrim(p) = '' THEN
    RETURN jsonb_build_object('profession', NULL, 'roles', '[]'::jsonb,
                              'match', 'empty', 'all', '[]'::jsonb);
  END IF;

  v_clean := btrim(regexp_replace(p, '\s*\([^)]*\)', ' ', 'g'));
  v_clean := btrim(regexp_replace(v_clean, '\s+', ' ', 'g'));

  IF v_clean = '' THEN
    RETURN jsonb_build_object('profession', NULL, 'roles', '[]'::jsonb,
                              'match', 'not_a_profession',
                              'all', to_jsonb(ARRAY[btrim(p)]));
  END IF;

  SELECT name INTO v_hit FROM public.professions
   WHERE NOT is_active
     AND (lower(name) = lower(v_clean)
       OR lower(v_clean) = ANY (SELECT lower(a) FROM unnest(aliases) a))
   LIMIT 1;
  IF v_hit IS NOT NULL THEN
    RETURN jsonb_build_object('profession', NULL, 'roles', '[]'::jsonb,
                              'match', 'rejected',
                              'all', to_jsonb(ARRAY[v_clean]));
  END IF;
  v_hit := NULL;

  SELECT name INTO v_hit FROM public.professions
   WHERE is_active
     AND (lower(name) = lower(v_clean)
       OR lower(v_clean) = ANY (SELECT lower(a) FROM unnest(aliases) a))
   ORDER BY sort_order, name
   LIMIT 1;
  IF v_hit IS NOT NULL THEN
    RETURN jsonb_build_object('profession', v_hit, 'roles', '[]'::jsonb,
                              'match', 'vocabulary',
                              'all', to_jsonb(ARRAY[v_clean]));
  END IF;

  -- Whole-string translation, before splitting: "könig von england" contains no
  -- separator but "Zehnkämpfer/in, Arzt/Ärztin" does, and the multi-word royal
  -- titles must not be split into "könig" + "england".
  SELECT t.english, TRUE INTO v_hit, v_tr_seen
    FROM public.profession_translations t
   WHERE t.source_term = lower(v_clean)
   LIMIT 1;
  IF v_tr_seen THEN
    RETURN jsonb_build_object(
      'profession', v_hit,
      'roles', '[]'::jsonb,
      'match', CASE WHEN v_hit IS NULL THEN 'not_a_profession' ELSE 'translated' END,
      'all', to_jsonb(ARRAY[v_clean]));
  END IF;
  v_hit := NULL;

  v_deg := regexp_replace(v_clean, '(/-?|:|\*|_)in(nen)?\M', '', 'gi');
  v_deg := regexp_replace(v_deg, '/-?[a-zäöüß]{1,2}\M', '', 'gi');
  v_deg := regexp_replace(v_deg, '-{2,}', '-', 'g');

  v_segs := ARRAY(
    SELECT btrim(s)
    FROM regexp_split_to_table(
           regexp_replace(v_deg, '\s*(/|&|;|\yand\y|\yund\y)\s*', ',', 'gi'), ','
         ) AS s
    WHERE btrim(s) <> ''
  );

  v_kept := ARRAY(SELECT s FROM unnest(v_segs) s WHERE s !~ '-\s*$');
  IF cardinality(v_kept) > 0 THEN
    v_segs := v_kept;
  END IF;

  IF cardinality(v_segs) = 0 THEN
    v_segs := ARRAY[v_clean];
  END IF;

  FOREACH v_seg IN ARRAY v_segs LOOP
    v_i := v_i + 1;
    v_all := v_all || v_seg;

    v_forms := public.profession_gender_forms(v_seg);

    SELECT pr.name, pr.slug INTO v_hit, v_slug
      FROM public.professions pr
     WHERE pr.is_active
       AND EXISTS (
             SELECT 1
             FROM unnest(v_forms) f
             WHERE lower(pr.name) = f
                OR f = ANY (SELECT lower(a) FROM unnest(pr.aliases) a)
                OR pr.slug = btrim(regexp_replace(f, '[^a-z0-9]+', '-', 'g'), '-')
           )
     ORDER BY pr.sort_order, pr.name
     LIMIT 1;

    IF v_hit IS NOT NULL THEN
      IF v_primary IS NULL THEN
        v_primary := v_hit;
        v_pslug   := v_slug;
      ELSIF v_slug IS DISTINCT FROM v_pslug THEN
        v_roles := v_roles || v_slug;
      END IF;

    ELSIF v_i = 1 AND v_primary IS NULL THEN
      -- 2c. Translation tier, tried across the same spelling variants.
      SELECT t.english, TRUE INTO v_hit, v_tr_seen
        FROM public.profession_translations t
       WHERE t.source_term = lower(v_seg)
          OR t.source_term = ANY (v_forms)
       ORDER BY (t.source_term = lower(v_seg)) DESC
       LIMIT 1;

      IF v_tr_seen THEN
        v_primary := v_hit;   -- may be NULL: an explicit "not a profession"
        v_pslug   := NULL;
        IF v_hit IS NULL THEN
          RETURN jsonb_build_object('profession', NULL, 'roles', '[]'::jsonb,
                                    'match', 'not_a_profession',
                                    'all', to_jsonb(v_all));
        END IF;
      ELSE
        -- 3. Fallback: the segment as written.
        v_primary := CASE
                       WHEN v_seg ~ '[A-ZÄÖÜ]' THEN v_seg
                       ELSE initcap(v_seg)
                     END;
        v_pslug := NULL;
      END IF;
      v_tr_seen := false;
      v_hit := NULL;
    END IF;
  END LOOP;

  IF v_primary IS NULL THEN
    RETURN jsonb_build_object('profession', NULL, 'roles', '[]'::jsonb,
                              'match', 'unresolved', 'all', to_jsonb(v_all));
  END IF;

  RETURN jsonb_build_object(
    'profession', v_primary,
    'roles', to_jsonb(v_roles),
    'match', CASE
               WHEN v_pslug IS NOT NULL THEN 'vocabulary'
               WHEN EXISTS (SELECT 1 FROM public.profession_translations t
                             WHERE t.english = v_primary) THEN 'translated'
               ELSE 'fallback'
             END,
    'all', to_jsonb(v_all)
  );
END;
$fn$;
