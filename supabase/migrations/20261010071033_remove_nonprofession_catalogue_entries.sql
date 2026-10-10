-- Remove the 13 non-occupation topic rows from the professions catalogue.
-- Preserve their exact rejection tokens in the existing import dictionary.
-- Original rows are retained by content_revisions and the operator's JSON backup.
SELECT set_config('app.actor','admin:profession-taxonomy-cleanup',true);
SET LOCAL statement_timeout = '120s';
LOCK TABLE public.professions IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.profession_translations IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE _retired_profession_topics ON COMMIT DROP AS
SELECT * FROM public.professions
WHERE slug IN ('nonprofession-comedy','nonprofession-community','nonprofession-dienstleistung','nonprofession-film','nonprofession-kunst','nonprofession-literatur','nonprofession-mode','nonprofession-musik','nonprofession-performance','nonprofession-politik','nonprofession-schauspiel','nonprofession-tanz','nonprofession-wissenschaft') AND NOT is_active AND category='Non-profession';

DO $preflight$
BEGIN
 IF (SELECT count(*) FROM _retired_profession_topics)<>13 THEN
  RAISE EXCEPTION 'Expected exactly 13 reviewed non-profession rows';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.content_versioned_tables WHERE table_name='professions' AND enabled) THEN
  RAISE EXCEPTION 'Profession revision history must be enabled before removing catalogue rows';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f' AND confrelid='public.professions'::regclass) THEN
  RAISE EXCEPTION 'New profession references require review before cleanup';
 END IF;
END $preflight$;

-- Lock this vocabulary while checking that active occupation matching stays exact.
CREATE TEMP TABLE _active_profession_baseline ON COMMIT DROP AS
SELECT p.slug,to_jsonb(p) AS data FROM public.professions p WHERE is_active;
CREATE TEMP TABLE _profession_match_baseline ON COMMIT DROP AS
SELECT DISTINCT token,public.normalize_profession_full(token) AS result
FROM public.professions p CROSS JOIN LATERAL unnest(ARRAY[p.name]||p.aliases) token
WHERE p.is_active;
CREATE TEMP TABLE _profession_rejected_tokens ON COMMIT DROP AS
SELECT DISTINCT lower(btrim(token)) AS token
FROM _retired_profession_topics p CROSS JOIN LATERAL unnest(ARRAY[p.name]||p.aliases) token;

DO $dictionary_guard$
BEGIN
 IF EXISTS(SELECT 1 FROM public.profession_translations t JOIN _profession_rejected_tokens r ON r.token=t.source_term WHERE t.english IS NOT NULL) THEN
  RAISE EXCEPTION 'A topic token now has a positive occupation translation; review before cleanup';
 END IF;
END $dictionary_guard$;

-- A NULL English value is the existing dictionary's explicit non-occupation rule.
INSERT INTO public.profession_translations(source_term,english,note)
SELECT token,NULL,'Non-occupation import token; moved out of the professions catalogue on 2026-10-10.'
FROM _profession_rejected_tokens
ON CONFLICT(source_term) DO UPDATE SET english=NULL,note=EXCLUDED.note;

CREATE OR REPLACE FUNCTION public.normalize_profession_full(p text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE PARALLEL SAFE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- Topic rejection rules belong to the import dictionary, not the job catalogue.
  SELECT rejected.name INTO v_hit
    FROM (
      SELECT name, aliases FROM public.professions WHERE NOT is_active
      UNION ALL
      SELECT source_term AS name, '{}'::text[] AS aliases
        FROM public.profession_translations WHERE english IS NULL
    ) AS rejected
   WHERE lower(rejected.name) = lower(v_clean)
      OR lower(v_clean) = ANY (SELECT lower(a) FROM unnest(rejected.aliases) a)
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
$function$;

DELETE FROM public.professions p USING _retired_profession_topics r WHERE p.id=r.id;

DO $verify$
DECLARE v_token text;
BEGIN
 IF EXISTS(SELECT 1 FROM public.professions WHERE slug IN ('nonprofession-comedy','nonprofession-community','nonprofession-dienstleistung','nonprofession-film','nonprofession-kunst','nonprofession-literatur','nonprofession-mode','nonprofession-musik','nonprofession-performance','nonprofession-politik','nonprofession-schauspiel','nonprofession-tanz','nonprofession-wissenschaft')) THEN
  RAISE EXCEPTION 'Reviewed topic rows remain in the professions catalogue';
 END IF;
 IF EXISTS(SELECT 1 FROM _active_profession_baseline b FULL JOIN public.professions p ON p.slug=b.slug AND p.is_active
  WHERE (b.slug IS NOT NULL OR p.is_active) AND b.data IS DISTINCT FROM to_jsonb(p)) THEN
  RAISE EXCEPTION 'An active profession changed during topic cleanup';
 END IF;
 IF EXISTS(SELECT 1 FROM _profession_match_baseline b WHERE public.normalize_profession_full(b.token) IS DISTINCT FROM b.result) THEN
  RAISE EXCEPTION 'An active profession or alias changed its normalization';
 END IF;
 FOR v_token IN SELECT token FROM _profession_rejected_tokens LOOP
  IF public.normalize_profession(v_token) IS NOT NULL
   OR public.normalize_profession_full(v_token)->>'match'<>'rejected' THEN
   RAISE EXCEPTION 'Non-occupation rejection lost for %',v_token;
  END IF;
 END LOOP;
 IF (SELECT count(*) FROM public.content_revisions WHERE source_table='professions' AND op='D'
   AND actor='admin:profession-taxonomy-cleanup' AND source_id IN (SELECT id FROM _retired_profession_topics))<>13 THEN
  RAISE EXCEPTION 'Missing before-images for deleted topic rows';
 END IF;
END $verify$;

