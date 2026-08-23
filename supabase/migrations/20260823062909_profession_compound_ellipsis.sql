-- normalize_profession v2.1 — German compound ellipsis, and "not a profession".
--
-- THE BUG THIS FIXES IS MINE. v2 (20260917100200) splits on `/ & ; und and ,` AFTER
-- stripping gender markers, which was the right order and fixed nine classes of
-- garbage. It did not account for German COMPOUND ELLIPSIS, where the shared head
-- noun is written once and elided from every earlier member with a hanging hyphen:
--
--     "Musik- und Filmproduzent"      = Musik[produzent] und Filmproduzent
--     "Mode-/Kostümdesigner"          = Mode[designer] / Kostümdesigner
--     "Intersex- und Transgender-Aktivist/in"
--
-- Splitting yields a first segment of `Musik-` / `Mode-` / `Intersex-`, which is not
-- a word at all — it is a prefix whose head lives in the NEXT segment. Because the
-- fallback tier keeps segment 1, five people were published with a profession that
-- is a bare prefix, David Geffen ("Musik-") and Bob Mackie ("Mode-") among them.
--
-- THE RULE IS ROBUST BECAUSE IT IS NEGATIVE: no profession in any language ends in a
-- hyphen. So a post-split segment matching '-$' is by construction an elided prefix
-- and is dropped, which lets the following segment — a complete compound — supply
-- the value. Reconstructing the elision instead ("Musik-" + head of "Filmproduzent"
-- -> "Musikproduzent") would need to find the morpheme boundary inside a German
-- compound, which is not decidable in SQL; dropping loses the secondary role and
-- keeps the primary one correct, and the raw string is preserved in
-- enrichment_status.profession.raw either way.
--
-- Guard: if EVERY segment ends in a hyphen there is no head to fall back to, so the
-- original cleaned string is kept rather than normalising to nothing.
--
-- Also fixed here, both found in the same review pass:
--   * "Theater--Schauspieler" — the `/-?[a-zäöüß]{1,2}` inflection-tail strip can
--     leave a doubled hyphen behind; collapse runs of hyphens after stripping.
--   * "Verwaltungsbeamt" — profession_gender_forms() strips a bare trailing "in",
--     which is correct for Schriftstellerin but truncates a word whose stem simply
--     ends in -in. It is only ever used to LOOK UP a vocabulary row, so a bad
--     variant was harmless; but the fallback tier stored the stripped text. The
--     fallback now stores the segment as written, never a lookup variant.
--   * A value that is ONLY a parenthetical ("(Lady of Llangollen)") is an epithet,
--     not a profession. v2 deliberately fell back to the raw text to keep it
--     visible in the review queue; that was the wrong call — it published a
--     parenthesised nickname in the profession slot on two people. It now resolves
--     to NULL with match='not_a_profession'. The raw text is still in
--     enrichment_status, so nothing is lost and the decision is reversible.

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

  -- 0a. Drop "(...)" annotations, then collapse whitespace.
  v_clean := btrim(regexp_replace(p, '\s*\([^)]*\)', ' ', 'g'));
  v_clean := btrim(regexp_replace(v_clean, '\s+', ' ', 'g'));

  -- 0a'. Parenthetical-only -> not a profession. (v2 fell back to the raw text.)
  IF v_clean = '' THEN
    RETURN jsonb_build_object('profession', NULL, 'roles', '[]'::jsonb,
                              'match', 'not_a_profession',
                              'all', to_jsonb(ARRAY[btrim(p)]));
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

  -- 1. Full-string exact match, BEFORE any splitting.
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

  -- 2. Strip gender markers IN PLACE, then 1-2 char slash inflection tails, then
  -- collapse any hyphen run the tail-strip left behind ("Theater--Schauspieler").
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

  -- 2a. Drop German compound-ellipsis prefixes ("Musik-", "Mode-", "Intersex-").
  -- Nothing in any language is a profession ending in a hyphen, so this cannot
  -- discard a real value. Keep the originals if that would empty the list.
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
      -- 3. Fallback: keep the primary segment AS WRITTEN. Never a lookup variant —
      -- profession_gender_forms() strips a bare trailing "in", which truncates a
      -- stem that legitimately ends in -in ("Verwaltungsbeamtin" -> "Verwaltungsbeamt").
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
$$;

-- ---------------------------------------------------------------------------
-- Re-resolve only the rows the two defects could have produced: a stored value
-- ending in a hyphen, a doubled hyphen, or a parenthetical-only value. Scoped by
-- the defect signature rather than re-opening the whole corpus, because every
-- personalities UPDATE enqueues a search reindex (see CLAUDE.md batch discipline)
-- and the rest of the corpus is already correct.
--
-- The raw snapshot is NOT rewritten -- coalesce(existing raw, current value) is
-- what makes the backfill idempotent and is the only surviving copy of the
-- original German.
-- ---------------------------------------------------------------------------
DO $$
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

  RAISE NOTICE 'compound-ellipsis repair: % re-resolved, % cleared as not-a-profession',
    v_fixed, v_nulled;
END;
$$;
