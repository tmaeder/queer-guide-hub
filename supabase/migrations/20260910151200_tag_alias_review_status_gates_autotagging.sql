-- An unreviewed alias must not be an auto-tagging rule.
-- ============================================================================
-- `run_tag_assignment_reconcile()` builds its free-text -> tag_id lookup from
--   lower(name) | lower(slug) | lower(alias_name)
-- with NO filter on tag_aliases.review_status. 14,931 of the 15,244 alias rows
-- are alias_type='multilingual', review_status='auto' -- machine-imported
-- foreign-language labels, never seen by a human -- and 5,978 of those are bare
-- single English-looking words. Every one is therefore a live auto-tagging rule
-- keyed on an ordinary English string.
--
-- Measured damage on prod (2026-08-16), news_articles.tags[] -> unified_tags:
--
--   'culture'        -> Crops          2,609 articles   (FR culture = cultivation)
--   'london'         -> Big               79
--   'maga'           -> Enchantress       56            (IT maga = sorceress)
--   'sex'            -> Biological Sex    44
--   'drama'          -> Play              44
--   'infrastructure' -> Amenities         25
--   'fans'           -> Devotee           19
--   'covid-19'       -> Seafood           16
--   'eu'             -> Basque            13            (eu = Basque lang code)
--   'doma'           -> Domme              2            (DOMA = Defense of Marriage Act)
--   'cbt'            -> Cock & Ball Torture 1           (CBT = cognitive behavioural therapy)
--   'pan' / 'pain'   -> Buns               2            (ES pan / FR pain = bread)
--   ... 92 distinct alias-driven mappings in total.
--
-- This is the same defect class as the 'Pep' -> Amphetamine incident: an alias
-- that is an ordinary word in SOME language becomes an unconditional tagging
-- rule in English.
--
-- WHY THE PREVIOUS FIX DID NOT HOLD -------------------------------------------
-- 20260803035804 deleted the `crops` news rows behind the guard
--   not exists (... t.slug = any(n.tags))
-- which compares the SLUG ('crops') against news_articles.tags[]. The string
-- that actually produces those rows is 'culture', so the guard classified all
-- 2,609 as stale, deleted them, and the reconciler recreated them the same
-- night from the alias. The guard checked the wrong string.
--
-- Correspondingly: the fix is NOT to strip the string from news_articles.tags[].
-- 'culture' is a legitimate news tag on 2,609 articles; the ALIAS is the bug.
--
-- THE FIX ---------------------------------------------------------------------
-- Make review_status load-bearing: the reconciler trusts only 'approved'
-- aliases. This neutralises all 15,036 unreviewed rows at once rather than
-- adding a 3rd hand-maintained per-slug denylist (20260619120000 lines 102-106
-- and 20260803035804 were the first two, and both regrew).
--
-- Merge redirect trails are unaffected: merge_tag_concept() writes its alias as
-- ('synonym','approved'), and 20260619120000's curated seeds are 'approved' too.
--
-- Step 1 below promotes the auto-aliases that ARE correct (pure inflection,
-- translation, or abbreviation of the SAME concept, verified individually
-- against the live assignment list) so the good links survive the gate.
-- ============================================================================

-- 1) Promote the demonstrably-correct auto aliases ---------------------------
UPDATE public.tag_aliases a
SET review_status = 'approved'
FROM (VALUES
  -- morphology (plural/singular/spelling)
  ('event'),('festivals'),('prisons'),('piercing'),('vampire'),('drag-shows'),
  ('threesomes'),('agression'),('decolonisation'),
  -- same concept, different surface form
  ('asexual'),('demisexual'),('intersectionality'),('genderfluid'),
  ('gender-queer'),('bi'),('transperson'),('ex-gay'),('pinkwashing'),
  ('organizing'),('demonstration'),('suffrage'),('bias'),('punk-rock'),
  ('rock'),('lycra'),('tech'),('contraception'),('pharmaceuticals'),('voyage'),
  -- abbreviations that are unambiguous in this corpus
  ('ftm'),('srs'),('ffs'),('tdor'),('enm'),('chem-sex'),('vaginismus'),
  -- translations of the same concept
  ('homophobie'),('homophobe'),('homosexualidad'),('italia'),('matrimonio'),
  ('polyamorie'),('transfeindlichkeit'),
  -- venue-side vocabulary (these carry the most real links of any alias here:
  -- 'restaurant' alone accounts for 518 venue+news assignments)
  ('restaurant'),('gay-friendly'),('lgbt-friendly'),('lgbtq+'),('lgbt-film'),
  ('shisha-bar'),('jazz')
) AS ok(alias)
WHERE lower(a.alias_name) = ok.alias
  AND a.review_status IS DISTINCT FROM 'approved';

-- 2) The reconciler trusts only approved aliases ------------------------------
-- Body is byte-identical to 20260607144000 apart from the review_status
-- predicate on the alias arm of _canon (verified against the live prosrc).
CREATE OR REPLACE FUNCTION public.run_tag_assignment_reconcile()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_automation_id uuid;
  v_run_id        bigint;
  v_enabled       boolean;
  v_started_at    timestamptz := now();
  v_added         int := 0;
  v_tmp           int := 0;
  v_usage_changed int := 0;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'tag_assignment_reconcile';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'tag_assignment_reconcile', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF v_enabled IS DISTINCT FROM true THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  -- Canonical lookup: free-text key -> tag_id, preferring name > slug > alias.
  -- Aliases are trusted ONLY when review_status='approved'. An 'auto' alias is a
  -- machine-imported foreign-language label; treating it as an English tagging
  -- rule is what tagged 2,609 'culture' articles as Crops.
  CREATE TEMP TABLE _canon ON COMMIT DROP AS
  SELECT DISTINCT ON (k) k, tag_id FROM (
    SELECT lower(name) AS k, id AS tag_id, 1 AS pri FROM public.unified_tags
      WHERE status='active' AND merged_into_id IS NULL
    UNION ALL
    SELECT lower(slug), id, 2 FROM public.unified_tags
      WHERE status='active' AND merged_into_id IS NULL
    UNION ALL
    SELECT lower(alias_name), canonical_tag_id, 3 FROM public.tag_aliases a
      JOIN public.unified_tags t ON t.id=a.canonical_tag_id
      WHERE t.status='active' AND t.merged_into_id IS NULL
        AND a.review_status = 'approved'
  ) s
  WHERE k IS NOT NULL AND k <> ''
  -- tag_id is a TIEBREAKER, not a preference: 21 keys resolve to two different
  -- tags at the SAME priority because two active tags share a name -- 'pride' is
  -- both news-pride and occ-pride, 'violence' is news-violence and violence,
  -- 'restaurant' is restaurant and restaurant-venue, plus the mat-<x>/<x>
  -- material pairs. Without a tiebreaker DISTINCT ON picks arbitrarily, so this
  -- function flip-flopped between the twins on consecutive nightly runs and
  -- assigned the same articles to BOTH over time (news-pride 1,281 /
  -- occ-pride 1,114 for the 998 articles tagged 'pride'). Deterministic now;
  -- de-duplicating the twin tags themselves is a job for the dedup engine.
  ORDER BY k, pri, tag_id;
  CREATE INDEX ON _canon (k);

  -- venues
  INSERT INTO public.unified_tag_assignments (tag_id, entity_id, entity_type)
  SELECT DISTINCT c.tag_id, v.id, 'venues'
  FROM public.venues v
  CROSS JOIN LATERAL unnest(v.tags) AS tag
  JOIN _canon c ON c.k = lower(trim(tag))
  WHERE v.tags IS NOT NULL AND trim(tag) <> ''
  ON CONFLICT (tag_id, entity_id, entity_type) DO NOTHING;
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_added := v_added + v_tmp;

  -- news_articles
  INSERT INTO public.unified_tag_assignments (tag_id, entity_id, entity_type)
  SELECT DISTINCT c.tag_id, n.id, 'news'
  FROM public.news_articles n
  CROSS JOIN LATERAL unnest(n.tags) AS tag
  JOIN _canon c ON c.k = lower(trim(tag))
  WHERE n.tags IS NOT NULL AND trim(tag) <> ''
  ON CONFLICT (tag_id, entity_id, entity_type) DO NOTHING;
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_added := v_added + v_tmp;

  -- community_groups
  INSERT INTO public.unified_tag_assignments (tag_id, entity_id, entity_type)
  SELECT DISTINCT c.tag_id, g.id, 'community_group'
  FROM public.community_groups g
  CROSS JOIN LATERAL unnest(g.tags) AS tag
  JOIN _canon c ON c.k = lower(trim(tag))
  WHERE g.tags IS NOT NULL AND trim(tag) <> ''
  ON CONFLICT (tag_id, entity_id, entity_type) DO NOTHING;
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_added := v_added + v_tmp;

  -- Recompute real usage_count from content assignments (exclude tag-to-tag links).
  WITH counts AS (
    SELECT tag_id, count(*) AS n
    FROM public.unified_tag_assignments
    WHERE entity_type <> 'tag'
    GROUP BY tag_id
  )
  UPDATE public.unified_tags t
    SET usage_count = coalesce(c.n, 0)
  FROM (
    SELECT t2.id, c2.n FROM public.unified_tags t2
    LEFT JOIN counts c2 ON c2.tag_id = t2.id
  ) c
  WHERE t.id = c.id AND t.usage_count IS DISTINCT FROM coalesce(c.n, 0);
  GET DIAGNOSTICS v_usage_changed = ROW_COUNT;

  UPDATE public.admin_automation_runs
    SET finished_at=now(), items_changed=v_added,
        summary=jsonb_build_object('assignments_added',v_added,'usage_recomputed',v_usage_changed)
    WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('assignments_added',v_added,'usage_recomputed',v_usage_changed);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='error' WHERE id=v_automation_id;
  RAISE;
END; $fn$;
ALTER FUNCTION public.run_tag_assignment_reconcile() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_tag_assignment_reconcile() FROM PUBLIC;

-- 3) The same aliases were being minted as search synonyms --------------------
-- trg tag_alias_sync_search_synonym creates a one-way search_synonyms row for
-- EVERY alias insert with status='approved'. 15,201 of the 15,235 synonym rows
-- came from this path, including 'london'->'big', 'pan'->'buns',
-- 'cbt'->'cock & ball torture' and 'covid-19'->'seafood'.
--
-- These are NOT live today: workers/search-proxy/src/pgSynonyms.ts loads
-- `status=eq.active`, and the trigger writes 'approved'. All 6 genuinely active
-- rows are hand-curated (tag_alias_id IS NULL) and are left untouched below.
-- But the set is one status flip away from rewriting real user queries, so the
-- same review_status rule is applied here.
CREATE OR REPLACE FUNCTION public.sync_tag_alias_to_search_synonym()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
declare
  v_tag_name text;
begin
  -- Only a reviewed alias may become a query-rewrite rule.
  if new.review_status is distinct from 'approved' then return new; end if;

  select name into v_tag_name
    from public.unified_tags
   where id = new.canonical_tag_id
     and status = 'active'
     and merged_into_id is null;

  if v_tag_name is null then return new; end if;
  if new.alias_name is null or new.alias_name = '' then return new; end if;
  if lower(new.alias_name) = lower(v_tag_name) then return new; end if;

  insert into public.search_synonyms (
    terms, replacements, locale, indexes, is_one_way,
    status, source, tag_id, tag_alias_id, notes
  ) values (
    array[lower(new.alias_name)],
    array[lower(v_tag_name)],
    '*',
    '{}'::text[],
    true,
    'approved',
    'imported',
    new.canonical_tag_id,
    new.id,
    'auto-created from tag_aliases insert'
  )
  on conflict (tag_alias_id) where tag_alias_id is not null do nothing;

  return new;
end
$fn$;

DELETE FROM public.search_synonyms s
USING public.tag_aliases a
WHERE s.tag_alias_id = a.id
  AND s.status <> 'active'
  AND a.review_status IS DISTINCT FROM 'approved';

-- 4) Reversible snapshot of the assignments the untrusted aliases produced ----
CREATE TABLE IF NOT EXISTS public.tag_alias_autotag_backup_20260910 (
  tag_id       uuid NOT NULL,
  entity_id    uuid NOT NULL,
  entity_type  text NOT NULL,
  via_alias    text,
  backed_up_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tag_id, entity_id, entity_type)
);
ALTER TABLE public.tag_alias_autotag_backup_20260910 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tag_alias_autotag_backup_20260910 FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.tag_alias_autotag_backup_20260910 IS
  'Assignments deleted by 20260910151200 because only a non-approved tag_aliases row produced them. Rollback: INSERT INTO unified_tag_assignments (tag_id, entity_id, entity_type) SELECT tag_id, entity_id, entity_type FROM tag_alias_autotag_backup_20260910 ON CONFLICT DO NOTHING;';

-- What the reconciler can still derive after step 1+2.
CREATE TEMP TABLE _canon_new ON COMMIT DROP AS
SELECT DISTINCT ON (k) k, tag_id FROM (
  SELECT lower(name) AS k, id AS tag_id, 1 AS pri FROM public.unified_tags
    WHERE status='active' AND merged_into_id IS NULL
  UNION ALL
  SELECT lower(slug), id, 2 FROM public.unified_tags
    WHERE status='active' AND merged_into_id IS NULL
  UNION ALL
  SELECT lower(alias_name), canonical_tag_id, 3 FROM public.tag_aliases a
    JOIN public.unified_tags t ON t.id=a.canonical_tag_id
    WHERE t.status='active' AND t.merged_into_id IS NULL
      AND a.review_status = 'approved'
) s
WHERE k IS NOT NULL AND k <> ''
ORDER BY k, pri, tag_id;   -- same tiebreaker as _canon above; must match exactly
CREATE INDEX ON _canon_new (k);

-- Keys that lost their tag: reachable ONLY through a now-untrusted alias.
CREATE TEMP TABLE _untrusted ON COMMIT DROP AS
SELECT DISTINCT lower(a.alias_name) AS k, a.canonical_tag_id AS tag_id
FROM public.tag_aliases a
JOIN public.unified_tags t ON t.id = a.canonical_tag_id
WHERE t.status='active' AND t.merged_into_id IS NULL
  AND a.review_status IS DISTINCT FROM 'approved'
  AND NOT EXISTS (SELECT 1 FROM _canon_new c
                  WHERE c.k = lower(a.alias_name) AND c.tag_id = a.canonical_tag_id);
CREATE INDEX ON _untrusted (k);

-- Pairs those aliases produce, that nothing else can reproduce.
CREATE TEMP TABLE _doomed ON COMMIT DROP AS
SELECT DISTINCT u.tag_id, e.id AS entity_id, e.etype AS entity_type, u.k AS via_alias
FROM (
  SELECT id, 'news'::text AS etype, tags FROM public.news_articles WHERE tags IS NOT NULL
  UNION ALL
  SELECT id, 'venues', tags FROM public.venues WHERE tags IS NOT NULL
  UNION ALL
  SELECT id, 'community_group', tags FROM public.community_groups WHERE tags IS NOT NULL
) e
CROSS JOIN LATERAL unnest(e.tags) AS tg
JOIN _untrusted u ON u.k = lower(trim(tg))
WHERE NOT EXISTS (
  SELECT 1 FROM unnest(e.tags) AS tg2
  JOIN _canon_new c ON c.k = lower(trim(tg2))
  WHERE c.tag_id = u.tag_id
);

INSERT INTO public.tag_alias_autotag_backup_20260910 (tag_id, entity_id, entity_type, via_alias)
SELECT d.tag_id, d.entity_id, d.entity_type, d.via_alias
FROM _doomed d
WHERE EXISTS (
  SELECT 1 FROM public.unified_tag_assignments a
  WHERE a.tag_id=d.tag_id AND a.entity_id=d.entity_id AND a.entity_type=d.entity_type
)
ON CONFLICT DO NOTHING;

DELETE FROM public.unified_tag_assignments a
USING _doomed d
WHERE a.tag_id=d.tag_id AND a.entity_id=d.entity_id AND a.entity_type=d.entity_type;

-- 5) usage_count must reflect the deletions -----------------------------------
WITH counts AS (
  SELECT tag_id, count(*) AS n
  FROM public.unified_tag_assignments
  WHERE entity_type <> 'tag'
  GROUP BY tag_id
)
UPDATE public.unified_tags t
SET usage_count = coalesce(c.n, 0)
FROM (
  SELECT t2.id, c2.n FROM public.unified_tags t2
  LEFT JOIN counts c2 ON c2.tag_id = t2.id
) c
WHERE t.id = c.id AND t.usage_count IS DISTINCT FROM coalesce(c.n, 0);
