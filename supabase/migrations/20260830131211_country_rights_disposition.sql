-- Phase 2 — Legal corroboration, part A: disposition of the 11 countries ILGA does not cover.
-- Spec: docs/superpowers/specs/2026-08-30-legal-corroboration-phase-2-design.md
--
-- THE ROADMAP'S HYPOTHESIS WAS WRONG AND THE MEASUREMENT IS THE POINT.
-- `open-data-integration.md` §5 Phase 2 assumed the 11 persistently-skipped countries
-- failed the `a2_code` join, "the same class that hid 36 missing capitals". They do not.
-- Queried against the live ILGA GraphQL on 2026-08-30: it returns 239 national
-- jurisdictions, 239 DISTINCT a2_codes, and ZERO null codes — a 100% join hit rate against
-- the 239 rows we update nightly. None of the 11 appear under any code, and a name search
-- over ILGA's jurisdiction list finds no Åland / Svalbard / Cocos / Christmas / Norfolk /
-- Western Sahara / Antarctica / Bouvet / Heard / Outlying entry.
--
-- ILGA *does* carry dependent territories that have their own legal regime — Cook Islands,
-- Niue, Tokelau, Jersey and Anguilla are all in the corpus and all update nightly. So
-- "dependent territory" is NOT the discriminator. Having a DISTINCT LEGAL SYSTEM is.
-- `skipped: 11` was never an importer defect; it is ILGA's coverage boundary, reported
-- faithfully. Do not "fix" the join.
--
-- Second correction: the 11 are not STALE. They are EMPTY and always have been —
-- `lgbti_criminalization = '{}'`, `equality_score` NULL, `rights_verdict_general` NULL on
-- all 11. The 2026-04-21 stamp is seed data, not the residue of a successful run.
--
-- THE LIVE DEFECT IS A FAIL-OPEN, NOT THE EMPTY COLUMNS.
-- `location_is_high_risk()` tests `(lgbti_criminalization->>'legal') = 'false'`. Against
-- '{}' that is `NULL = 'false'` → NULL → NOT high risk. So El Aaiún (Western Sahara,
-- ~220k residents, under a de-facto criminalizing penal code) would publish venues
-- UNGATED. Today that leaks nothing — 0 venues / 0 events / 0 hotels across all 11, and
-- all 7 cities are shell_status='ghost', seo_indexable=false — but the DEFAULT is wrong,
-- and a default that fails open on criminalisation is the one that must not be left.
--
-- Three classes, three treatments. One mechanism cannot serve all three without either
-- inventing facts or discarding them.
--
-- NO EXPLICIT BEGIN/COMMIT: `db push` wraps each migration itself, and an explicit COMMIT
-- inside the file lands the DATA while breaking the history bookkeeping — the version is
-- then never recorded and every later migration silently skips.

-- ── 1. Inhabited territories whose law IS the parent state's law ────────────────
-- Åland (Finland), Cocos/Christmas/Norfolk (Australia), Svalbard (Norway).
-- ILGA omits them precisely BECAUSE they have no distinct regime, so inheriting is
-- the correct reading of the source's silence — but it is stamped `inherited`, never
-- `ilga`, so no downstream reader can mistake a copy for a measurement.
--
-- This migration performs the FIRST inheritance so the state is correct immediately.
-- `import-ilga-data` re-derives it on every nightly run thereafter. That recurrence is
-- load-bearing: a one-shot copy is a derived field that outlives its input — the class
-- that produced 86 safety notes describing the wrong country's laws.
WITH parent_map(child, parent) AS (
  VALUES ('AX','FI'), ('CC','AU'), ('CX','AU'), ('NF','AU'), ('SJ','NO')
)
UPDATE public.countries c SET
  lgbti_criminalization               = p.lgbti_criminalization,
  lgbti_expression_restrictions       = p.lgbti_expression_restrictions,
  lgbti_association_restrictions      = p.lgbti_association_restrictions,
  lgbti_constitutional_protection     = p.lgbti_constitutional_protection,
  lgbti_goods_services_protection     = p.lgbti_goods_services_protection,
  lgbti_health_protection             = p.lgbti_health_protection,
  lgbti_education_protection          = p.lgbti_education_protection,
  lgbti_bullying_protection           = p.lgbti_bullying_protection,
  lgbti_employment_protection         = p.lgbti_employment_protection,
  lgbti_housing_protection            = p.lgbti_housing_protection,
  lgbti_hate_crime_law                = p.lgbti_hate_crime_law,
  lgbti_incitement_prohibition        = p.lgbti_incitement_prohibition,
  lgbti_conversion_therapy_regulation = p.lgbti_conversion_therapy_regulation,
  lgbti_same_sex_unions               = p.lgbti_same_sex_unions,
  lgbti_adoption_rights               = p.lgbti_adoption_rights,
  lgbti_intersex_protection           = p.lgbti_intersex_protection,
  lgbti_gender_recognition            = p.lgbti_gender_recognition,
  equality_score                      = p.equality_score,
  rights_verdicts                     = p.rights_verdicts,
  rights_verdict_general              = p.rights_verdict_general,
  lgbti_data_last_updated             = now(),
  enrichment_status = jsonb_set(
    coalesce(c.enrichment_status, '{}'::jsonb), ARRAY['lgbti_rights'],
    jsonb_build_object(
      'state',  'inherited',
      'parent', m.parent,
      'source', 'ilga:' || m.parent,
      'reason', 'no distinct legal regime; parent-state law governs. ILGA does not list this jurisdiction separately.',
      'at',     now()),
    true)
FROM parent_map m
JOIN public.countries p ON p.code = m.parent
WHERE c.code = m.child;

-- ── 2. No permanent civilian population ─────────────────────────────────────────
-- Antarctica, Bouvet, Heard & McDonald, French Southern & Antarctic Lands, US Minor
-- Outlying Islands. There is no resident population and therefore no domestic LGBTI
-- legal regime to record. This is `not_applicable`, which is a DIFFERENT claim from
-- `data_unavailable` — we are not failing to find the answer, there is no question.
-- Their `lgbti_data_last_updated` is deliberately NOT bumped: stamping a fresh
-- timestamp would record an observation that never happened.
UPDATE public.countries SET
  enrichment_status = jsonb_set(
    coalesce(enrichment_status, '{}'::jsonb), ARRAY['lgbti_rights'],
    jsonb_build_object(
      'state',  'not_applicable',
      'source', 'decision',
      'reason', 'no permanent civilian population — no domestic LGBTI legal regime exists to record',
      'at',     now()),
    true)
WHERE code IN ('AQ','BV','HM','TF','UM');

-- ── 3. Western Sahara — disputed sovereignty, narrow fail-safe ───────────────────
-- The only one of the 11 with a large resident population (~220k in El Aaiún alone)
-- AND a criminalising de-facto legal regime, which is exactly the combination the gate
-- exists for.
--
-- ONLY the gate-relevant fields are set. Morocco's other 17 topic columns are NOT
-- copied: asserting that Moroccan marriage, adoption or gender-recognition law governs
-- Western Sahara is a sovereignty claim this platform cannot support. Asserting that the
-- criminal law is enforced in the administered territory is documented, and erring
-- toward GATING protects the user. That distinction is the whole point of the narrow copy.
--
-- `equality_score` is left NULL on purpose — it is a 0-100 projection that would imply a
-- measured rights profile we do not have. It also keeps this row out of the
-- `crim_consistency` gate, which counts criminalising countries with score >= 50.
UPDATE public.countries SET
  lgbti_criminalization = jsonb_build_object(
    'legal',              false,
    'disputed',           true,
    'de_facto_authority', 'MA',
    'basis',              'Moroccan Penal Code Art. 489, applied in Moroccan-administered Western Sahara',
    'source',             'manual:disputed-territory'),
  enrichment_status = jsonb_set(
    coalesce(enrichment_status, '{}'::jsonb), ARRAY['lgbti_rights'],
    jsonb_build_object(
      'state',  'data_unavailable',
      'source', 'decision',
      'reason', 'disputed sovereignty; no uncontested legal authority. Criminalisation set from the de-facto administering power SOLELY to make the safety gate fail closed.',
      'at',     now()),
    true)
WHERE code = 'EH';

-- The UPDATE above reaches the gate one hop away and that chain is load-bearing:
--   countries → trg_sync_geo_spine → geo_country_profiles
--             → trg_geo_country_recompute_safety_gated → safety_gated on content.
-- `location_is_high_risk()` reads geo_country_profiles, NOT countries, so a write that
-- did not mirror would leave the fail-safe inert. Verified in this migration's own
-- post-check below.

-- ── 4. Sentinel — a silent skip must never be possible again ────────────────────
-- Restates trust_safety_gate_status() to add ONE gate. The body is otherwise byte-for-byte
-- what was live on 2026-08-30; restating a shared stats function is a known merge-collision
-- surface, so the addition is deliberately a single self-contained UNION ALL block.
--
-- Threshold is 30 days, NOT "not updated today". The invariant being asserted is
-- STRUCTURAL — "every country is either covered by a live source or carries a recorded
-- decision" — not uptime. A one-night ILGA outage must not scream; a permanently skipped
-- country must. Zero-tolerance, no baseline allowance: the `stranded_human_approved`
-- pattern, where 14 rows hid under a 3,500-row floor for 40 days.
CREATE OR REPLACE FUNCTION public.trust_safety_gate_status()
 RETURNS TABLE(gate text, severity text, failing bigint, detail text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 'hotline_unverified'::text, 'critical'::text, count(*)::bigint,
         'crisis hotlines missing verified_at or older than 90 days'::text
  FROM cms_pages cp
  CROSS JOIN LATERAL jsonb_array_elements(cp.body_json->'hotlines') hl
  WHERE cp.slug = 'help'
    AND ( NOT (hl ? 'verified_at')
          OR hl->>'verified_at' = ''
          OR (hl->>'verified_at')::date < (now() - interval '90 days')::date )
  UNION ALL
  SELECT 'person_outing_guard', 'critical', count(*)::bigint,
         'public, living people asserting a positive LGBTI identity label without provenance'
  FROM personalities
  WHERE duplicate_of_id IS NULL AND visibility = 'public' AND is_living
    AND lgbti_connection IN ('community_member', 'activist', 'representation')
    AND wikidata_qid IS NULL
  UNION ALL
  SELECT 'crim_consistency', 'critical', count(*)::bigint,
         'criminalizing destinations shown with a non-low safety score (>=50)'
  FROM countries
  WHERE duplicate_of_id IS NULL
    AND (lgbti_criminalization->>'legal') = 'false' AND equality_score >= 50
  UNION ALL
  -- NEW (Phase 2): a country carrying neither live rights data nor a recorded decision.
  SELECT 'country_rights_unaccounted', 'critical', count(*)::bigint,
         'countries with no fresh rights data and no recorded enrichment_status.lgbti_rights disposition'
  FROM countries
  WHERE duplicate_of_id IS NULL
    AND enrichment_status->'lgbti_rights'->>'state' IS NULL
    AND (lgbti_data_last_updated IS NULL
         OR lgbti_data_last_updated < now() - interval '30 days')
  UNION ALL
  SELECT 'dup_integrity', 'critical', (
      (SELECT count(*) FROM venues v WHERE v.duplicate_of_id IS NOT NULL
         AND (NOT EXISTS (SELECT 1 FROM venues p WHERE p.id = v.duplicate_of_id)
              OR EXISTS (SELECT 1 FROM venues p WHERE p.id = v.duplicate_of_id AND p.duplicate_of_id IS NOT NULL)))
    + (SELECT count(*) FROM events e WHERE e.duplicate_of_id IS NOT NULL
         AND (NOT EXISTS (SELECT 1 FROM events p WHERE p.id = e.duplicate_of_id)
              OR EXISTS (SELECT 1 FROM events p WHERE p.id = e.duplicate_of_id AND p.duplicate_of_id IS NOT NULL)))
    + (SELECT count(*) FROM personalities x WHERE x.duplicate_of_id IS NOT NULL
         AND (NOT EXISTS (SELECT 1 FROM personalities p WHERE p.id = x.duplicate_of_id)
              OR EXISTS (SELECT 1 FROM personalities p WHERE p.id = x.duplicate_of_id AND p.duplicate_of_id IS NOT NULL)))
    + (SELECT count(*) FROM news_articles n WHERE n.duplicate_of_id IS NOT NULL
         AND (NOT EXISTS (SELECT 1 FROM news_articles p WHERE p.id = n.duplicate_of_id)
              OR EXISTS (SELECT 1 FROM news_articles p WHERE p.id = n.duplicate_of_id AND p.duplicate_of_id IS NOT NULL)))
    )::bigint,
    'dangling or chained duplicate_of_id pointers (venues/events/people/news)'
  UNION ALL
  SELECT 'hotline_unreachable', 'high', count(*)::bigint,
         'crisis-page entries with no phone and no contact channel'
  FROM cms_pages cp
  CROSS JOIN LATERAL jsonb_array_elements(cp.body_json->'hotlines') hl
  WHERE cp.slug = 'help'
    AND (NOT (hl ? 'phone') OR hl->>'phone' IS NULL OR hl->>'phone' = '')
    AND jsonb_array_length(COALESCE(hl->'channels', '[]'::jsonb)) = 0
  UNION ALL
  SELECT 'hotline_link_broken', 'high', count(*)::bigint,
         'crisis hotlines flagged link_status = broken'
  FROM cms_pages cp
  CROSS JOIN LATERAL jsonb_array_elements(cp.body_json->'hotlines') hl
  WHERE cp.slug = 'help' AND hl->>'link_status' = 'broken';
$function$;

-- ── 5. Post-checks — assert, do not hope ────────────────────────────────────────
-- A migration that "fixes" state and does not verify it is how the detect_stale_venues
-- threshold drifted for two weeks. These RAISE inside the transaction, so a failure
-- rolls the whole thing back rather than shipping a half-applied fail-safe.
DO $$
DECLARE
  v_dispositioned int;
  v_eh_gated      boolean;
  v_unaccounted   int;
BEGIN
  SELECT count(*) INTO v_dispositioned FROM public.countries
   WHERE code IN ('AQ','AX','BV','CC','CX','EH','HM','NF','SJ','TF','UM')
     AND enrichment_status->'lgbti_rights'->>'state' IS NOT NULL;
  IF v_dispositioned <> 11 THEN
    RAISE EXCEPTION 'expected 11 dispositioned countries, got %', v_dispositioned;
  END IF;

  -- The whole point of §3: the gate must actually fire, via the spine, not just the column.
  SELECT public.location_is_high_risk(id, NULL) INTO v_eh_gated
    FROM public.countries WHERE code = 'EH';
  IF NOT coalesce(v_eh_gated, false) THEN
    RAISE EXCEPTION 'EH fail-safe did not reach location_is_high_risk() — spine mirror broken';
  END IF;

  SELECT failing INTO v_unaccounted
    FROM public.trust_safety_gate_status() WHERE gate = 'country_rights_unaccounted';
  IF v_unaccounted <> 0 THEN
    RAISE EXCEPTION 'country_rights_unaccounted = % after disposition, expected 0', v_unaccounted;
  END IF;
END $$;
