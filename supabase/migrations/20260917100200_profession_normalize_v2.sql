-- normalize_profession v2 — gender-aware, multi-value-aware, and no longer
-- default-accept.
--
-- WHY v1 COULD NOT JUST BE RE-RUN. v1 split on `/ & and ,` and kept only the FIRST
-- atom, then initcap()'d whatever was left. Measured on prod against the 4,148 rows
-- it had never processed:
--     would lose a real second profession .......... 1,236
--     mangled ("Lyriker:in" -> "Lyriker:In") ........... 96
--     left German, merely initcapped ................ 3,096
--     clean vocabulary hit ............................ 904
-- and its snapshot wrote `'raw', old_prof` UNCONDITIONALLY, so re-opening the
-- due-set would have overwritten the June 2026 snapshot with already-mangled text
-- and destroyed the only copy of the original German. Both are fixed here.
--
-- THE ORDER OF OPERATIONS IS THE FIX. v1 split first, which manufactured garbage
-- atoms out of gender markers: "Zauberkünstler/in (Magier/in)" produced the atoms
-- `in (Magier` and `in)`, and slash-inflections produced a bare `r` (9 rows). v2
-- strips parentheticals from the WHOLE string, then strips gender markers IN PLACE,
-- and only then splits — so a marker can never become a segment.
--
-- Tiers:
--   0a  clean    strip "(...)" annotations, collapse whitespace
--   0b  reject   an is_active=false vocabulary row -> NULL (known non-professions)
--   1   exact    full-string name/alias match, UNCHANGED and still FIRST — this is
--                what protects 'hiv/aids activist' and 'r&b singer' from the
--                splitter, and what makes the function idempotent over its own
--                output (load-bearing for the write gate in the next migration)
--   2   split    on ; , / & " und " " and ", now that markers are already gone
--   2b  fold     per segment, try the gender/umlaut spelling variants
--   3   fallback keep the primary segment, flagged as unreviewed work
--
-- Fallback casing: v1 used initcap(), which turned 'DJ' into 'Dj' and 'HIV' into
-- 'Hiv' and 'König von Preußen' into 'König Von Preußen'. v2 leaves a segment that
-- is already capitalised alone (German nouns always are) and only initcaps one that
-- is not.

-- ---------------------------------------------------------------------------
-- Spelling variants for one token.
--
-- Ported from stripGenderSuffix() in supabase/functions/_shared/profession-keywords.js
-- rather than reinvented — that file's header records that a duplicated copy of this
-- logic drifted and silently reclassified real historical figures. Kept in sync by
-- supabase/migrations/__tests__/profession_normalize.sql.
--
-- Covers all three gender-inclusive conventions live in this corpus (/in, :in, *in),
-- plus _in, the plural -innen, the bare feminine (Schriftstellerin -> Schriftsteller)
-- and umlaut folding in BOTH directions (ä->ae and ä->a), because the corpus and the
-- stored aliases disagree about which spelling they use.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profession_gender_forms(p text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  WITH t AS (
    SELECT lower(btrim(coalesce(p, ''))) AS v
  ), base AS (
    SELECT v FROM t WHERE v <> ''
    UNION
    -- separator-marked gender suffix: /in /-in :in *in _in, singular or plural
    SELECT regexp_replace(v, '(/-?|:|\*|_)in(nen)?$', '') FROM t WHERE v <> ''
    UNION
    -- bare feminine / plural: Schriftstellerin -> Schriftsteller, Aktivistinnen -> Aktivist
    SELECT regexp_replace(v, 'in(nen)?$', '') FROM t WHERE v <> ''
  ), folded AS (
    -- NB: replace(), not translate() — translate() is char-for-char, so
    -- translate(v,'ß','ss') yields a single 's' and silently mis-folds Fußballspieler.
    SELECT v FROM base
    UNION
    SELECT replace(replace(replace(replace(v, 'ä','ae'), 'ö','oe'), 'ü','ue'), 'ß','ss') FROM base
    UNION
    SELECT replace(replace(replace(replace(v, 'ä','a'),  'ö','o'),  'ü','u'),  'ß','ss') FROM base
  )
  SELECT coalesce(array_agg(DISTINCT btrim(v)), '{}'::text[])
  FROM folded
  WHERE btrim(v) <> '';
$$;

COMMENT ON FUNCTION public.profession_gender_forms(text) IS
  'Spelling variants of one profession token: the token, its gender-marker-stripped '
  'forms (/in :in *in _in -innen and the bare feminine) and both umlaut foldings. '
  'SQL port of stripGenderSuffix() in _shared/profession-keywords.js.';

-- ---------------------------------------------------------------------------
-- Resolve one free-text profession into a canonical name, secondary role slugs
-- and an outcome label. normalize_profession() is a thin wrapper so the existing
-- callers (the facets matview, commit_personality_staging_item, the anon RPC used
-- by ProfessionDetail) keep their signature.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_profession_full(p text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_clean   text;
  v_deg     text;
  v_segs    text[];
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

  -- 0a. Drop "(...)" annotations, then collapse whitespace. A value that is ONLY a
  -- parenthetical ("(Lady of Llangollen)") would otherwise clean to the empty
  -- string, so fall back to the raw text and let it land in the review queue.
  v_clean := btrim(regexp_replace(p, '\s*\([^)]*\)', ' ', 'g'));
  v_clean := btrim(regexp_replace(v_clean, '\s+', ' ', 'g'));
  IF v_clean = '' THEN
    v_clean := btrim(p);
  END IF;

  -- 0b. Explicit reject list (is_active = false rows: "Kunst", "Politik", …).
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

  -- 1. Full-string exact match, BEFORE any splitting. Keeps multi-word canonicals
  -- and slash-bearing aliases intact, and guarantees normalize(normalize(x)) = x.
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

  -- 2. Strip gender markers IN PLACE so the splitter cannot turn one into a
  -- segment, then drop 1-2 character slash fragments ("/r", "/e", "/n"), which are
  -- German inflection tails and never a profession. Both run before the split.
  v_deg := regexp_replace(v_clean, '(/-?|:|\*|_)in(nen)?\M', '', 'gi');
  v_deg := regexp_replace(v_deg, '/-?[a-zäöüß]{1,2}\M', '', 'gi');

  v_segs := ARRAY(
    SELECT btrim(s)
    FROM regexp_split_to_table(
           regexp_replace(v_deg, '\s*(/|&|;|\yand\y|\yund\y)\s*', ',', 'gi'), ','
         ) AS s
    WHERE btrim(s) <> ''
  );
  IF cardinality(v_segs) = 0 THEN
    v_segs := ARRAY[v_clean];
  END IF;

  FOREACH v_seg IN ARRAY v_segs LOOP
    v_i := v_i + 1;
    v_all := v_all || v_seg;

    -- 2b. Name / alias / slug, tried across every spelling variant of the segment.
    -- Hoisted out of the correlated EXISTS: inline it and the variant set is
    -- rebuilt once per vocabulary row instead of once per segment.
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
      -- 3. Fallback: keep the primary segment. Already-capitalised text is left
      -- alone (German nouns, "DJ", "MMA-Kämpfer", "König von Preußen"); only
      -- lowercase input is title-cased.
      v_primary := CASE WHEN v_seg ~ '^[[:upper:]]' THEN v_seg ELSE initcap(v_seg) END;
    END IF;
    v_hit := NULL; v_slug := NULL;
  END LOOP;

  RETURN jsonb_build_object(
    'profession', v_primary,
    'roles',      to_jsonb(ARRAY(SELECT DISTINCT unnest(v_roles) ORDER BY 1)),
    'match',      CASE WHEN v_pslug IS NOT NULL THEN 'vocabulary' ELSE 'fallback' END,
    'all',        to_jsonb(v_all)
  );
END;
$$;

COMMENT ON FUNCTION public.normalize_profession_full(text) IS
  'Resolves free-text profession -> {profession, roles[], match, all[]}. match is '
  'vocabulary | fallback | rejected | empty. Secondary segments become role slugs '
  '(default-reject: only real vocabulary slugs). See profession_review_queue for the '
  'fallback tail.';

GRANT EXECUTE ON FUNCTION public.normalize_profession_full(text) TO anon, authenticated, service_role;

-- Back-compat wrapper: same signature and grants as v1. Callers are the facets
-- matview, commit_personality_staging_item (20260608200002) and the anon RPC.
CREATE OR REPLACE FUNCTION public.normalize_profession(p text)
RETURNS text
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT public.normalize_profession_full(p) ->> 'profession';
$$;

GRANT EXECUTE ON FUNCTION public.normalize_profession(text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The unmatched tail, as a ranked worklist rather than silent state.
--
-- Same shape as scripts/data-quality/englishify-tags.mjs: a REPORT a human drains
-- by adding aliases in the CMS (professions has an `aliases` tags field registered
-- at src/config/contentTypes/index.ts), never a heuristic that widens itself.
--
-- Deliberately NOT a needs_attention flag: 20260716130000_hide_needs_attention_personalities
-- moved every flagged personality from public to draft, so flagging the tail would
-- silently unpublish hundreds of people.
-- ---------------------------------------------------------------------------
-- Membership is computed from the CURRENT column, not from the backfill's
-- `match` stamp. The write gate normalizes without touching enrichment_status, so
-- a stamp-keyed view would be blind to everything the gate lets through — which is
-- every future import. After normalization a resolved value IS a canonical name,
-- so "not a canonical name" is an exact test for the fallback tier and needs no
-- bookkeeping to stay true.
CREATE OR REPLACE VIEW public.profession_review_queue AS
  SELECT
    p.profession,
    count(*)::bigint                                AS people,
    bool_or(p.visibility = 'public')                AS on_public_site,
    p.profession ~ '[äöüßÄÖÜ]|(/|:|\*)in\M|innen\M' AS looks_german,
    min(p.enrichment_status->'profession'->>'raw')  AS example_raw
  FROM public.personalities p
  WHERE p.profession IS NOT NULL
    AND btrim(p.profession) <> ''
    AND NOT EXISTS (
      SELECT 1 FROM public.professions pr
      WHERE pr.is_active AND lower(pr.name) = lower(p.profession)
    )
  GROUP BY p.profession
  ORDER BY count(*) DESC, p.profession;

COMMENT ON VIEW public.profession_review_queue IS
  'Profession values normalize_profession could not resolve to the vocabulary. '
  'Drain by adding aliases to professions.aliases (which also fixes search, the '
  'facet matview and the commit gate). Emptiness is the exit criterion for deleting '
  'src/lib/professionDisplay.ts.';

-- New views inherit this schema's default privileges, which include anon. This is
-- operator data over unpublished people — revoke first, then grant deliberately.
REVOKE ALL ON public.profession_review_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.profession_review_queue TO service_role;

-- ---------------------------------------------------------------------------
-- Backfill v2 — re-openable, snapshot-preserving, and writes roles.
--
-- DROP first: v1 returned TABLE(processed, changed) and CREATE OR REPLACE cannot
-- widen a function's return type (42P13).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.run_profession_normalize_backfill(int);

CREATE OR REPLACE FUNCTION public.run_profession_normalize_backfill(p_batch int DEFAULT 300)
RETURNS TABLE(processed int, changed int, rejected int, fallback int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_processed int := 0;
  v_changed   int := 0;
  v_rejected  int := 0;
  v_fallback  int := 0;
BEGIN
  -- Batched on purpose: every personalities UPDATE enqueues a search_documents
  -- reindex, and this DB is disk-constrained. Driven by a loop in
  -- scripts/data-quality/normalize-professions.mjs, never as one statement.
  WITH due AS (
    SELECT id, profession AS old_prof, enrichment_status AS old_es, roles AS old_roles
    FROM public.personalities
    WHERE profession IS NOT NULL AND btrim(profession) <> ''
      -- v1's due-set was `raw IS NULL`, which selects NOTHING German: the single
      -- June 2026 pass already stamped those rows with its own mangled output.
      AND coalesce(enrichment_status->'profession'->>'version', 'v1') <> 'v2'
    ORDER BY id
    LIMIT greatest(p_batch, 1)
    FOR UPDATE SKIP LOCKED
  ), calc AS (
    SELECT d.*, public.normalize_profession_full(d.old_prof) AS nf
    FROM due d
  ), upd AS (
    UPDATE public.personalities p SET
      profession = c.nf ->> 'profession',
      -- Union, never replace: 20260716120000 already backfilled roles for 1,162 rows.
      roles = ARRAY(
        SELECT DISTINCT r FROM unnest(
          coalesce(c.old_roles, '{}'::text[])
          || ARRAY(SELECT jsonb_array_elements_text(c.nf -> 'roles'))
        ) r WHERE r IS NOT NULL AND r <> '' ORDER BY r
      ),
      enrichment_status = jsonb_set(
        coalesce(p.enrichment_status, '{}'::jsonb),
        '{profession}',
        jsonb_build_object(
          -- NEVER overwrite an existing snapshot. v1 wrote this unconditionally,
          -- so a second pass would have replaced the original German with v1's
          -- own lossy output and made the change irreversible.
          'raw',           coalesce(c.old_es->'profession'->>'raw', c.old_prof),
          'all',           c.nf -> 'all',
          'match',         c.nf ->> 'match',
          'version',       'v2',
          'normalized_at', now(),
          'source',        'normalize_profession_full'
        ),
        true
      )
    FROM calc c
    WHERE p.id = c.id
    RETURNING (c.nf ->> 'profession') IS DISTINCT FROM c.old_prof AS did_change,
              c.nf ->> 'match'                                    AS match
  )
  SELECT count(*)::int,
         count(*) FILTER (WHERE did_change)::int,
         count(*) FILTER (WHERE match = 'rejected')::int,
         count(*) FILTER (WHERE match = 'fallback')::int
    INTO v_processed, v_changed, v_rejected, v_fallback
  FROM upd;

  RETURN QUERY SELECT v_processed, v_changed, v_rejected, v_fallback;
END;
$$;

REVOKE ALL ON FUNCTION public.run_profession_normalize_backfill(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_profession_normalize_backfill(int) TO service_role;
