-- ============================================================
-- organizations.needs_attention was true on 88.3% of rows — the same
-- "flag so common it is indistinguishable from no signal" failure that
-- 20260820191944 fixed for venues (99.5% flagged there).
--
-- The rule shipped in 20260716214000 as:
--     needs_attention = (completeness < 40 OR email_missing)
--
-- The second arm flags a row no matter how complete it otherwise is, and an
-- organization directory sourced from ILGA/Wikipedia legitimately has no
-- public email for most rows. Measured on prod 2026-09-10:
--
--   organizations                                    6,497
--   with an email                                      759  (11.7%)
--   needs_attention = true                           5,738  (88.3%)
--     ├─ completeness < 40                           2,522
--     └─ flagged ONLY for the missing email          3,216  (56% of all flags)
--
-- So the majority of flags carried no information beyond "this org has no
-- email address", which is the normal state of this table. The flag has two
-- live readers — the `needs_attention` filter in src/hooks/useBusinessSpine.ts
-- and the badge in AdminBusiness.tsx — and at 88% it filters nothing.
--
-- The arm is DOUBLE-COUNTING: email already contributes 15 of the 100
-- completeness points, so a missing email already lowers the score. Folding it
-- back in as a hard flag counts the same fact twice, once weighted and once
-- absolute. Dropping the arm is the whole fix; nothing about the weighted
-- score changes, and no other signal is ORed in to replace it.
--
-- What survives is meaningful and was cross-tabbed before this migration was
-- written: all 2,522 rows scoring < 40 are missing BOTH description AND
-- website (the score's structure makes that near-tautological — name is NOT
-- NULL and roles/tags/city_id together only reach 35), and none of them is a
-- duplicate (duplicate_of_id: 0), defunct (0) or non-active (0). The remaining
-- 38.8% is a live, thin-record enrichment backlog, not a mislabelled corpus.
--
-- Cost of the repair pass, measured in a rolled-back transaction on prod:
-- 3,216 rows written, whole-table UPDATE in ~1.4s round trip. It is safe
-- unbatched because trg_search_documents_organization only ENQUEUES into
-- search_reindex_queue (one cheap insert per row, drained 1,000/min) — the
-- 300-row event batch caps predate that decoupling. The one real side effect
-- is trg_organizations_touch bumping updated_at on those 3,216 rows, which
-- re-pushes them through twenty-sync {recent} mode once.
-- ============================================================

CREATE OR REPLACE FUNCTION public.run_org_quality_recompute(p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_automation_id uuid;
  v_run_id        bigint;
  v_enabled       boolean;
  v_started_at    timestamptz := now();
  v_orgs          int := 0;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'org_quality_recompute';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'org_quality_recompute', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF (v_enabled IS DISTINCT FROM true) AND NOT p_force THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  -- Weighted filled-field coverage (sums to 100):
  --   name 20 | description 15 | website 15 | email 15 | phone 10 |
  --   logo_url 10 | city_id 5 | roles 5 | tags 5
  --
  -- needs_attention is the score and ONLY the score. A contact channel this
  -- corpus mostly does not have is already priced into the score above; it
  -- must not also be a hard flag.
  WITH scored AS (
    SELECT o.id,
      ( (NULLIF(trim(o.name), '')        IS NOT NULL)::int * 20
      + (NULLIF(trim(o.description), '') IS NOT NULL)::int * 15
      + (NULLIF(trim(o.website), '')     IS NOT NULL)::int * 15
      + (NULLIF(trim(o.email), '')       IS NOT NULL)::int * 15
      + (NULLIF(trim(o.phone), '')       IS NOT NULL)::int * 10
      + (NULLIF(trim(o.logo_url), '')    IS NOT NULL)::int * 10
      + (o.city_id IS NOT NULL)::int * 5
      + (COALESCE(cardinality(o.roles), 0) > 0)::int * 5
      + (COALESCE(cardinality(o.tags), 0) > 0)::int * 5
      )::smallint AS new_completeness
    FROM public.organizations o
  )
  UPDATE public.organizations o
     SET completeness_score = s.new_completeness,
         needs_attention    = (s.new_completeness < 40)
    FROM scored s
   WHERE o.id = s.id
     AND (o.completeness_score IS DISTINCT FROM s.new_completeness
       OR o.needs_attention IS DISTINCT FROM (s.new_completeness < 40));
  GET DIAGNOSTICS v_orgs = ROW_COUNT;

  UPDATE public.admin_automation_runs
    SET finished_at=now(), items_examined=v_orgs, items_changed=v_orgs,
        summary=jsonb_build_object('organizations_updated', v_orgs)
    WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('organizations_updated', v_orgs);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='error' WHERE id=v_automation_id;
  RAISE;
END; $$;

COMMENT ON FUNCTION public.run_org_quality_recompute(boolean) IS
  'Nightly organizations quality recompute: completeness_score = weighted filled-field % '
  '(name/description/website/email/phone/logo_url/city_id/roles/tags), needs_attention = '
  'completeness < 40. Diff-guarded — only changed rows are written. A missing contact '
  'field is priced into the score and is never independently a flag: the original rule '
  'ORed in "email is null", which flagged 88.3% of the table (20370801100000).';

-- ── repair the standing flags ──────────────────────────────────────────────
-- Runs the fixed function itself rather than restating its UPDATE, so the
-- repair and the recurring job can never drift apart. Diff-guarded, so this is
-- a provable no-op on re-apply.
DO $repair$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.run_org_quality_recompute(true);
  RAISE NOTICE 'org needs_attention repair: %', v_result;
END
$repair$;

-- ── postcondition ──────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_total      int;
  v_flagged    int;
  v_violations int;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE needs_attention),
         count(*) FILTER (WHERE needs_attention AND completeness_score >= 40)
    INTO v_total, v_flagged, v_violations
  FROM public.organizations;

  IF v_violations > 0 THEN
    RAISE EXCEPTION 'org needs_attention still flags % row(s) scoring >= 40 — the email arm survived somewhere', v_violations;
  END IF;

  -- Positive control: a rule that flags NOTHING is broken in the other
  -- direction and would pass a violations-only check silently.
  IF v_flagged = 0 THEN
    RAISE EXCEPTION 'org needs_attention flags nothing across % organizations', v_total;
  END IF;

  RAISE NOTICE 'org needs_attention: % of % flagged (%%%)',
    v_flagged, v_total, round(100.0 * v_flagged / v_total, 1);
END
$verify$;
