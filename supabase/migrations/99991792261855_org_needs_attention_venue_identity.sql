-- organizations.needs_attention: stop flagging venue-identity orgs; retire a
-- duplicate podcast source.
--
-- (1) needs_attention was true on 79,112 of 100,039 organizations (79.1%),
-- measured 2026-10-17. 20370801100000 brought the same flag down from 88.3% by
-- dropping its email arm and recorded the goal: a flag set on most of a table
-- is indistinguishable from no signal. It crept back up, and the email arm is
-- not why — the table grew from ~6.5k to ~100k rows under it.
--
-- 96,289 of the 100,039 are VENUE-IDENTITY organizations: rows the business
-- spine backfill (org_spine_backfill, org_mint) minted so every venue has an
-- organization above it, carrying roles = {venue} and a primary_venue_id and
-- nothing else of their own. 77,093 of them are flagged. Their completeness is
-- low by construction — description, website, phone, logo live on the VENUE,
-- which is the detail record per the spine plan ("org is link-only, no field
-- canonicalization yet"). So the flag on the org says nothing the venue's own
-- needs_attention does not already say, and it says it 77,093 times on the
-- admin business console, which filters on it (useBusinessSpine.ts).
--
-- Excluding them leaves 2,019 flagged — the organizations that ARE parties in
-- their own right (publishers, sellers, support orgs, brands) and are thin.
-- That is the population the flag exists for.
--
-- The exclusion is keyed on structure, not on name or source: roles exactly
-- {venue} AND primary_venue_id set. An org that gains a second role (a venue
-- that is also a seller) or loses its venue link is scored like any other.
-- completeness_score is unchanged for every row — only the flag moves.
--
-- venue_identity is computed with coalesce(..., false): roles can be NULL, and
-- NOT NULL is NULL, which would write needs_attention = NULL rather than false.
--
-- No inline repair. The nightly org_quality_recompute (02:50) applies it, and
-- an inline 77k-row UPDATE inside db push buys a few hours at the cost of a
-- long transaction holding row locks the business console reads through.
--
-- (2) Two news_sources rows point at the same JOY 94.9 "Hide & Seek" podcast:
-- 81f781ea (…/hideandseek/feed/, 107 articles) and 923814a7
-- (…/hideandseek/feed/podcast, 0 articles). Both feeds return the identical
-- 101 episodes, so the second commits nothing — every item dedups against the
-- first — while still being fetched hourly and reading as a healthy source
-- with zero output. Retired with is_active = false (a human retirement), not
-- auto_paused, which the source-health machinery unpauses on its own.

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
  -- needs_attention is the score, and only for organizations that are parties
  -- in their own right. A venue-identity org (roles exactly {venue}, linked to
  -- its venue) is a spine link whose detail lives on the venue, which carries
  -- its own needs_attention; flagging both double-counts every thin venue.
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
      )::smallint AS new_completeness,
      COALESCE(o.roles = ARRAY['venue']::text[] AND o.primary_venue_id IS NOT NULL, false)
        AS venue_identity
    FROM public.organizations o
  )
  UPDATE public.organizations o
     SET completeness_score = s.new_completeness,
         needs_attention    = (s.new_completeness < 40 AND NOT s.venue_identity)
    FROM scored s
   WHERE o.id = s.id
     AND (o.completeness_score IS DISTINCT FROM s.new_completeness
       OR o.needs_attention IS DISTINCT FROM (s.new_completeness < 40 AND NOT s.venue_identity));
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
  'completeness < 40 AND NOT a venue-identity org (roles exactly {venue} with a '
  'primary_venue_id — its detail lives on the venue, which has its own flag). Diff-guarded. '
  'A missing contact field is priced into the score and is never independently a flag '
  '(20370801100000); venue-identity orgs were 77k of 79k flags (99991792261855).';

UPDATE public.news_sources
   SET is_active = false
 WHERE id = '923814a7-e5b7-49b6-a61a-a57a91348962'
   AND url = 'https://joy.org.au/hideandseek/feed/podcast'
   AND is_active;

DO $verify$
DECLARE
  v_src        text;
  v_total      int;
  v_flagged    int;
  v_violations int;
  v_survivor   boolean;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc
   WHERE oid = 'public.run_org_quality_recompute(boolean)'::regprocedure;
  IF position('NOT s.venue_identity' in v_src) = 0 THEN
    RAISE EXCEPTION 'run_org_quality_recompute does not exclude venue-identity organizations';
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE needs_attention),
         count(*) FILTER (WHERE needs_attention AND completeness_score >= 40)
    INTO v_total, v_flagged, v_violations
  FROM public.organizations;

  -- REPORTED, NOT ASSERTED. This migration writes no organizations row: the
  -- new rule lands at the next 02:50 run. So these counts describe whatever
  -- the previous run (or any other writer) left behind, and RAISEing on them
  -- makes db push depend on data this file never touches. The first apply
  -- aborted exactly that way on 2 rows scoring >= 40, blocking every queued
  -- migration repo-wide. The function body, which this file DOES change, is
  -- asserted above; the rule's effect is checked by the repo test.
  RAISE NOTICE 'org needs_attention: % flagged of %, % flagged while scoring >= 40 (applied by the next recompute)',
    v_flagged, v_total, v_violations;

  -- The working source is reported, not asserted: an editor may legitimately
  -- retire it later, and that must not abort db push for the whole repo.
  SELECT is_active INTO v_survivor FROM public.news_sources
   WHERE id = '81f781ea-a0ab-48a9-8d92-cf781df5c42d';
  RAISE NOTICE 'Hide and Seek 81f781ea active: %', v_survivor;
  IF EXISTS (SELECT 1 FROM public.news_sources
              WHERE id = '923814a7-e5b7-49b6-a61a-a57a91348962' AND is_active) THEN
    RAISE EXCEPTION 'the duplicate Hide & Seek source 923814a7 is still active';
  END IF;
END
$verify$;
