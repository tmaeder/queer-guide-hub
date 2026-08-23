-- RECOVERED, not authored. Applied to prod 2026-08-23 06:29 with no file on
-- main, in any local worktree, and no open PR carrying it. Migration drift
-- makes `supabase db push` SKIP for the WHOLE repo, so every open PR fails
-- migration-versions as collateral and no merged migration reaches prod.
--
-- Body is a byte-for-byte recovery from
-- supabase_migrations.schema_migrations.statements at version 20260823062909
-- (6,027 chars, md5 5b104eb163a1d032162803520b963401), transported as base64
-- and decoded locally so no hand-transcription could mangle a regex escape --
-- this is a normalizer full of \s, \y and \M classes where one wrong
-- backslash silently changes how every profession string is parsed.
--
-- Already live, so applying it is a no-op; the file exists so db push can match
-- the version and continue.
--
-- Third orphan of the day (20260822170452 and 20260823061200 were the others).
-- `apply_migration` is not done until the file is MERGED TO MAIN.

-- normalize_profession v2.1 — German compound ellipsis, and "not a profession".
-- See supabase/migrations/<version>_profession_compound_ellipsis.sql for the full
-- rationale. Summary: a post-split segment ending in a hyphen is a German elided
-- compound prefix ("Musik- und Filmproduzent"), never a profession, so it is
-- dropped and the following complete compound supplies the value. Also: collapse
-- hyphen runs left by the inflection-tail strip, keep the fallback segment AS
-- WRITTEN (never a gender-stripped lookup variant), and resolve a parenthetical-only
-- value to NULL/not_a_profession instead of publishing the parenthesised epithet.

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

  -- German compound ellipsis: drop hanging-hyphen prefixes, keep the head compound.
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
      v_primary := CASE
                     WHEN v_seg ~ '[A-ZÄÖÜ]' THEN v_seg
                     ELSE initcap(v_seg)
                   END;
      v_pslug := NULL;
    END IF;
  END LOOP;

  IF v_primary IS NULL THEN
    RETURN jsonb_build_object('profession', NULL, 'roles', '[]'::jsonb,
                              'match', 'unresolved', 'all', to_jsonb(v_all));
  END IF;

  RETURN jsonb_build_object(
    'profession', v_primary,
    'roles', to_jsonb(v_roles),
    'match', CASE WHEN v_pslug IS NULL THEN 'fallback' ELSE 'vocabulary' END,
    'all', to_jsonb(v_all)
  );
END;
$fn$;

DO $do$
DECLARE
  r         record;
  v_res     jsonb;
  v_new     text;
  v_raw     text;
  v_fixed   int := 0;
  v_nulled  int := 0;
BEGIN
  FOR r IN
    SELECT id, profession, enrichment_status
      FROM public.personalities
     WHERE profession IS NOT NULL
       AND (profession ~ '-\s*$' OR profession ~ '--' OR profession ~ '^\s*\(')
  LOOP
    v_raw := coalesce(r.enrichment_status->'profession'->>'raw', r.profession);
    v_res := public.normalize_profession_full(v_raw);
    v_new := v_res->>'profession';

    IF v_new IS DISTINCT FROM r.profession THEN
      UPDATE public.personalities
         SET profession = v_new,
             enrichment_status = jsonb_set(
               coalesce(enrichment_status, '{}'::jsonb),
               '{profession}',
               jsonb_build_object(
                 'raw', v_raw,
                 'all', v_res->'all',
                 'match', v_res->>'match',
                 'source', 'normalize_profession_full',
                 'version', 'v2.1',
                 'normalized_at', now()
               )
             )
       WHERE id = r.id;

      IF v_new IS NULL THEN
        v_nulled := v_nulled + 1;
      ELSE
        v_fixed := v_fixed + 1;
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE 'compound-ellipsis repair: % re-resolved, % cleared', v_fixed, v_nulled;
END;
$do$;
