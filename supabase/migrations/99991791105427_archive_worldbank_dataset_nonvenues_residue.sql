-- World Bank data products mis-ingested as venues: the 21 rows the 2026-06-08 pass missed.
--
-- 20260608140001_archive_worldbank_dataset_nonvenues.sql archived this cohort by
--   data_source = 'unknown'
--   AND (website ilike '%worldbank.org%' OR description ilike '%world bank%' OR ...)
-- and 54 rows matched. The rows that did NOT match are the ones carrying no website and no
-- literal "World Bank" anywhere in their prose -- "GDP ranking", "Doing Business",
-- "Enterprise Surveys", "Wage Bill and Pay Compression", "WDR2013 Survey on Good Jobs".
-- A predicate keyed on a producer's self-identification misses every row that fails to
-- identify itself, and those rows are indistinguishable from a clean corpus afterwards.
--
-- WHAT THIS IS NOT: a regrowth. The producer minted all 75 rows in a single five-second
-- window and has been dormant since (see PRODUCER below). These 21 were never dispositioned.
--
-- SELECTION -- neither description text nor provenance isolates this cohort:
--   * A description regex ('%dataset %', '%This dataset%', '%provides data from%',
--     '%country level data%', '%fiscal years ended%') finds 51 rows, but 47 of those are
--     ALREADY archived by the 2026-06-08 pass and only 4 are live. Read as "51 live
--     non-venues" it conflates finished work with the real residue.
--   * venue_sources.source_slug = 'unknown' is not a World Bank marker at all: it covers
--     5,484 approved venues from the same 2026-04-26 batch, nearly all of them real places.
--     Keying on it would have archived the batch.
-- What does isolate it is the World Bank data-topic taxonomy, carried verbatim in
-- venue_sources.payload->'raw'->>'tags' ("Urban Development", "Labor & Social Protection",
-- "Economic Policy & External Debt", "Agriculture & Rural Development", ...). That returns
-- 75 rows: 54 archived in 2026-06 and 21 still live -- five times what the description
-- regex sees.
--
-- ALL 21 WERE READ BY HAND. Every one is a World Bank dataset, report, survey or data
-- portal; none is a physical place. All 21 carry category 'other', quality_score 0, zero
-- events, zero guide_picks, zero images and zero personal visits. A topic tag is a
-- signature, not a disposition, which is why the ids below are frozen: a human read these
-- 21, not a predicate.
--   * The five with a website point at data portals -- doingbusiness.org/Data,
--     enterprisesurveys.org/CustomQuery, beeps.prognoz.com, horn.rcmrd.org/data/search,
--     sedlac.econo.unlp.edu.ar. None is a venue site.
--   * The three with coordinates are name-collision geocoding artifacts: "Doing Business"
--     in Ganta, Liberia; "Enterprise Surveys" on the Gold Coast, Australia;
--     "Socio-Economic Database for Latin America and the Caribbean" in Port of Spain.
--     "Open Data for the Horn" was filed in Burton-on-Trent, England. Two more had their
--     city-centroid coordinates already nulled by centroid_repair in 2026-08.
--
-- PRODUCER -- dormant, measured rather than assumed. All 75 rows were minted in one
-- five-second window, 2026-04-26 07:58:46 to 07:58:51, from a feed whose payload records
-- source_name 'unknown' and venue_type 'mixed'. It has minted ZERO rows in the trailing
-- 90 days and zero in the trailing 7. There is no running path to seal, so this migration
-- seals nothing and claims nothing about sealing; a one-shot repair cannot seal a producer
-- and pretending otherwise is worse than saying it is dormant.
--
-- REVERSIBLE. Archives through public.decide_venue_nonvenue(id, true, note) instead of
-- restating its UPDATE, so the restore snapshot lands in exactly the shape
-- public.restore_venue_from_nonvenue() reads -- one implementation of the archive
-- semantics. No hard DELETE: venues.id has FK dependants and the standing convention for a
-- non-entity row is reversible archival (the 2026-06-08 pass, archive_city_as_nonplace).
--
-- Soft on preconditions, hard on the goal: a row a concurrent session already archived or
-- repurposed is reported and skipped, never a reason to abort -- db push stops at the first
-- failing file and takes every migration queued behind it, so an exact-match premise here
-- is a repo-wide blast radius rather than protection.

do $wb$
declare
  -- One copy of the frozen list, used by the disposition, the eviction and the verify.
  v_rows jsonb := '[
    {"id":"3b69184a-260d-4713-b537-fa9c87581c4c","name":"African Cities Diagnostic"},
    {"id":"aa6e3986-a1e5-4169-a743-6be1528a4218","name":"AidFlows"},
    {"id":"808a1e71-297e-4595-b11b-15853028754a","name":"Bolivia Agricultural Public Expenditure Review"},
    {"id":"5c4d821b-1333-4861-8887-70b2ab3a39c9","name":"Business Environment and Enterprise Performance Survey"},
    {"id":"1645f47c-dfcc-402a-8118-0ea70660b888","name":"Climate Change Data"},
    {"id":"5cd95040-20cf-4390-838f-e8bc7ac67503","name":"Climate Change Knowledge Portal:  Ensemble Projections"},
    {"id":"ecdb6cde-a8d7-4f0c-95bc-27accead755f","name":"Climate Change Knowledge Portal: Historical Data"},
    {"id":"fa577ade-c5bd-4e4d-b157-fccdaaa59ed9","name":"Doing Business"},
    {"id":"8fb9d5bb-d785-4cd5-a422-8986a44212b6","name":"Enterprise Surveys"},
    {"id":"9b230730-c556-4094-811c-91c06364bc99","name":"GDP ranking"},
    {"id":"ed9de57a-f562-44d2-945f-2688e71a611e","name":"GDP ranking, PPP based"},
    {"id":"be9fe000-f10e-4e6a-9310-2c5a60e3cf0d","name":"Open Data for the Horn"},
    {"id":"30d936f6-038c-4ab4-be29-a8db50227b6c","name":"Rural Access Index (RAI)"},
    {"id":"9d09838c-9bb5-4e6f-b163-5296dae99d5d","name":"Socio-Economic Database for Latin America and the Caribbean"},
    {"id":"f15b5322-a9a5-4d88-a703-57574a6d4c8a","name":"The Changing Wealth of Nations"},
    {"id":"ba31c958-7f57-41ba-8c53-1ee738057c66","name":"Wage Bill and Pay Compression"},
    {"id":"d1f501fb-3d1d-4f50-96ff-edd68d688520","name":"WDR2013 Occupational Wages around the World"},
    {"id":"83ac2f8f-dfc6-4249-a242-c116647b145e","name":"WDR2013 Survey on Good Jobs"},
    {"id":"48de26de-5c0b-41ad-ad91-6e2e301ce667","name":"World Development Report 2011"},
    {"id":"3586c1ac-a9c0-4abe-bff0-eb5758526363","name":"World Development Report 2013 on Jobs Statistical Tables"},
    {"id":"7454ebce-c73f-477c-9132-ba5e6f8d51a2","name":"World Development Report 2014"}
  ]'::jsonb;

  v_expected  integer := 21;
  v_ids       uuid[];
  r           record;
  v_res       jsonb;
  v_archived  integer := 0;
  v_already   integer := 0;
  v_drifted   integer := 0;
  v_missing   integer := 0;
  v_failed    integer := 0;
  v_notes     text[]  := '{}';

  v_evicted      integer := 0;
  v_present      integer;
  v_control_docs integer;
  v_has_filter   boolean;
  v_unfinished   integer;
  v_indexable    integer;
  v_restorable   integer;
  v_in_search    integer;
  v_now_archived integer;
begin
  select array_agg((e->>'id')::uuid) into v_ids from jsonb_array_elements(v_rows) e;

  if jsonb_array_length(v_rows) <> v_expected then
    raise exception 'worldbank residue: frozen list holds % entries, expected %',
      jsonb_array_length(v_rows), v_expected;
  end if;

  ---------------------------------------------------------------------------
  -- 1) Disposition.
  ---------------------------------------------------------------------------
  for r in
    select (e->>'id')::uuid as id, e->>'name' as name
    from jsonb_array_elements(v_rows) e
    order by e->>'name'
  loop
    if not exists (select 1 from public.venues v where v.id = r.id) then
      v_missing := v_missing + 1;
      v_notes := v_notes || format('missing: %s (%s)', r.name, r.id);
      continue;
    end if;

    -- Already archived. Calling decide_venue_nonvenue again would snapshot
    -- review_status='archived' / seo_indexable=false AS the restore target, turning
    -- restore_venue_from_nonvenue into a no-op and destroying the only record of the
    -- row's pre-archive state. Skip, never re-archive.
    if exists (
      select 1 from public.venues v
      where v.id = r.id and v.review_status = 'archived'
    ) then
      v_already := v_already + 1;
      continue;
    end if;

    -- Verify what is about to be overwritten is the row that was read. A renamed row is
    -- not this cohort's any more and is a human's decision to inspect, not ours to archive.
    if not exists (
      select 1 from public.venues v where v.id = r.id and v.name = r.name
    ) then
      v_drifted := v_drifted + 1;
      v_notes := v_notes || format('name drift, skipped: %s (%s)', r.name, r.id);
      continue;
    end if;

    v_res := public.decide_venue_nonvenue(
      r.id,
      true,
      'World Bank data product mis-ingested as a venue: a dataset, report, survey or data '
      || 'portal, not a physical place. Residue of the 2026-06-08 worldbank pass, whose '
      || 'predicate required a worldbank.org website or the literal phrase "World Bank" in '
      || 'the description. Reversible via restore_venue_from_nonvenue(). '
      || 'Batch: worldbank-open-data-residue-2026-10-03.');

    if coalesce((v_res->>'ok')::boolean, false) then
      v_archived := v_archived + 1;
    else
      -- A failure must never be indistinguishable from a skip.
      v_failed := v_failed + 1;
      v_notes := v_notes || format('failed: %s -> %s', r.name, v_res::text);
    end if;
  end loop;

  raise notice 'worldbank residue: archived=% already_archived=% name_drift=% missing=% failed=%',
    v_archived, v_already, v_drifted, v_missing, v_failed;
  if array_length(v_notes, 1) > 0 then
    raise notice 'worldbank residue notes: %', array_to_string(v_notes, ' | ');
  end if;

  ---------------------------------------------------------------------------
  -- 2) Search eviction.
  -- search_documents_index_venues already declines to re-insert an archived row (it
  -- carries "review_status is distinct from 'archived'"), so this is self-maintaining
  -- rather than a one-time sweep. But trg_search_documents_venue only ENQUEUES into
  -- search_reindex_queue, and search_reindex_drain claims it on a cron -- so the stale
  -- doc is still being served until the drain runs. Delete it here so the postcondition
  -- below asserts an end state instead of an intention. Idempotent: the drain will
  -- re-claim each row, delete nothing, and the indexer will decline to re-add it.
  -- Scoped to this cohort's ids: other archived venues are not this migration's to touch.
  ---------------------------------------------------------------------------
  delete from public.search_documents sd
  using public.venues v
  where sd.entity_type = 'venue'
    and sd.entity_id = v.id
    and v.id = any(v_ids)
    and v.review_status = 'archived';
  get diagnostics v_evicted = row_count;
  raise notice 'worldbank residue: evicted % search documents', v_evicted;

  ---------------------------------------------------------------------------
  -- 3) Postconditions. Positive controls first: every "count is zero" assertion below is
  --    equally satisfied by a probe that cannot see any rows at all.
  ---------------------------------------------------------------------------

  -- Control A: the frozen ids resolve to real venues. Without this, a typo'd uuid matches
  -- nothing and every assertion that follows passes vacuously.
  select count(*) into v_present from public.venues where id = any(v_ids);
  if v_present < 1 then
    raise exception 'worldbank residue: the frozen id list resolves to no venues at all; the probe is not measuring this corpus';
  end if;
  if v_present <> v_expected then
    -- Reported, not fatal: a row deleted outside this migration is a fact to surface.
    raise notice 'worldbank residue: % of % frozen ids still exist as venues',
      v_present, v_expected;
  end if;

  -- Control B: the search probe can see venue documents. "0 of ours in search_documents"
  -- also passes against an empty table, a renamed column or a broken join.
  select count(*) into v_control_docs
  from public.search_documents where entity_type = 'venue';
  if v_control_docs < 10000 then
    raise exception 'worldbank residue: venue search index reads only % documents; the probe is not measuring a populated index', v_control_docs;
  end if;

  -- Control C: the eviction stays self-maintaining. If a later CREATE OR REPLACE drops the
  -- archived predicate from the indexer, the drain puts all 21 straight back and the DELETE
  -- above degrades into a cosmetic one-off.
  --
  -- COMMENTS ARE STRIPPED FIRST, and for this check that is load-bearing rather than
  -- hygiene. pg_get_functiondef() returns the body INCLUDING its own comments, and this is a
  -- PRESENCE check, which is the direction that fails SILENTLY: the moment someone adds a
  -- comment to the indexer mentioning the archived predicate, this control passes while the
  -- predicate itself is gone and all 21 rows are back in search. Measured on prod today the
  -- live body carries zero `--` comments, so the unstripped form was correct and fragile —
  -- a distinction no green run can show. Guarded by scripts/check-functiondef-asserts.mjs.
  select position('review_status is distinct from ''archived''' in
                  regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')) > 0
    into v_has_filter
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'search_documents_index_venues';
  if not coalesce(v_has_filter, false) then
    raise exception 'worldbank residue: search_documents_index_venues no longer excludes archived venues; archiving this cohort would not hold';
  end if;

  -- The goal, stated positively: no row that is still the row we read remains unarchived.
  -- Scoped to rows whose name still matches, so a legitimate concurrent rename is excluded
  -- from the work AND from the assertion rather than blocking the queue.
  select count(*) into v_unfinished
  from jsonb_array_elements(v_rows) e
  join public.venues v on v.id = (e->>'id')::uuid
  where v.name = e->>'name'
    and v.review_status is distinct from 'archived';
  if v_unfinished <> 0 then
    raise exception 'worldbank residue: % rows are still the row that was read and are not archived', v_unfinished;
  end if;

  select count(*) filter (where v.review_status = 'archived'),
         count(*) filter (where v.review_status = 'archived' and v.seo_indexable),
         count(*) filter (where v.review_status = 'archived'
                            and v.enrichment_status->'nonvenue_candidate'->'archived' ? 'review_status')
    into v_now_archived, v_indexable, v_restorable
  from public.venues v where v.id = any(v_ids);

  select count(*) into v_in_search
  from public.search_documents
  where entity_type = 'venue' and entity_id = any(v_ids);

  if v_now_archived < 1 then
    raise exception 'worldbank residue: no row in the cohort is archived; nothing happened';
  end if;
  if v_indexable <> 0 then
    raise exception 'worldbank residue: % archived rows are still seo_indexable', v_indexable;
  end if;
  if v_in_search <> 0 then
    raise exception 'worldbank residue: % cohort rows are still in search_documents',
      v_in_search;
  end if;

  -- Reversibility is the point of archiving rather than deleting, so it is asserted, not
  -- assumed: every archived row must carry the snapshot restore_venue_from_nonvenue reads.
  if v_restorable <> v_now_archived then
    raise exception 'worldbank residue: only % of % archived rows carry a restore snapshot that restore_venue_from_nonvenue can read', v_restorable, v_now_archived;
  end if;

  raise notice 'worldbank residue verified: % archived, 0 indexable, 0 in search, % restorable',
    v_now_archived, v_restorable;
end $wb$;
