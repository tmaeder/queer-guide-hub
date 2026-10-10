-- Zürich: archive six party series that were ingested as venues.
--
-- The Zürich duplicate audit found a cluster of rows at "Spitalgasse 5, Zürich" --
-- the address of Heaven Club -- whose names are recurring club nights, not places:
-- "2000-er", "AVALON", "BALKAN GAY NIGHT", "BERLIN CALLING",
-- "BOYAHKASHA! BOOTYLICIOUS", "FRIYEAH!". All six were read by hand. Each carries
-- category 'other', no description, zero events, zero guide picks, zero merged
-- children, and one venue_sources row from the 2026-04-26 'unknown' import batch
-- (source_entity_id 'unknown:<slug>:'). A seventh, "NIGHT PRIDE", was already
-- archived by an earlier pass and is not touched.
--
-- The place these nights happen at already exists as a venue (Heaven Club,
-- 6bada896), so nothing is lost: the rows only ever duplicated the club as six
-- name-only pages, each live, approved and seo_indexable.
--
-- REVERSIBLE. Archives through public.decide_venue_nonvenue(id, true, note) so the
-- restore snapshot lands in the shape public.restore_venue_from_nonvenue() reads.
-- No hard DELETE.
--
-- Soft on preconditions, hard on the goal: a row already archived, renamed or
-- deleted since it was read is reported and skipped, never a reason to abort.

do $party$
declare
  v_rows jsonb := '[
    {"id":"75a2ae0e-77ee-43d2-b302-51b37e52091e","name":"2000-er"},
    {"id":"93f62f60-5b01-45d7-846f-da714d14d745","name":"AVALON"},
    {"id":"865e5e57-b16a-4497-8fc1-a1aa9d22cd72","name":"BALKAN GAY NIGHT"},
    {"id":"4366abd0-05ac-424b-8229-854e7b36c0e0","name":"BERLIN CALLING"},
    {"id":"59fcf6f3-90db-4e0d-b16c-4a3c213aa932","name":"BOYAHKASHA! BOOTYLICIOUS"},
    {"id":"125243c6-bd77-43a0-9229-11b0b5325c71","name":"FRIYEAH!"}
  ]'::jsonb;

  v_ids        uuid[];
  r            record;
  v_res        jsonb;
  v_archived   int := 0;
  v_already    int := 0;
  v_drifted    int := 0;
  v_missing    int := 0;
  v_failed     int := 0;
  v_evicted    int := 0;
  v_present    int;
  v_unfinished int;
  v_indexable  int;
  v_restorable int;
  v_archived_n int;
  v_in_search  int;
  v_has_filter boolean;
begin
  select array_agg((e->>'id')::uuid) into v_ids from jsonb_array_elements(v_rows) e;

  -- 1) Disposition.
  for r in
    select (e->>'id')::uuid as id, e->>'name' as name from jsonb_array_elements(v_rows) e
  loop
    if not exists (select 1 from public.venues v where v.id = r.id) then
      v_missing := v_missing + 1;
      raise notice 'missing: % (%)', r.name, r.id;
      continue;
    end if;

    -- Re-archiving would snapshot the archived state as the restore target and
    -- make restore_venue_from_nonvenue a no-op. Skip.
    if exists (select 1 from public.venues v where v.id = r.id and v.review_status = 'archived') then
      v_already := v_already + 1;
      continue;
    end if;

    if not exists (select 1 from public.venues v where v.id = r.id and v.name = r.name) then
      v_drifted := v_drifted + 1;
      raise notice 'name drift, skipped: % (%)', r.name, r.id;
      continue;
    end if;

    v_res := public.decide_venue_nonvenue(
      r.id,
      true,
      'Party series ingested as a venue: a recurring club night at Heaven Club, '
      || 'Spitalgasse 5, Zürich, not a place. Reversible via restore_venue_from_nonvenue(). '
      || 'Batch: zuerich-party-series-2026-10-06.');

    if coalesce((v_res->>'ok')::boolean, false) then
      v_archived := v_archived + 1;
    else
      v_failed := v_failed + 1;
      raise notice 'failed: % -> %', r.name, v_res::text;
    end if;
  end loop;

  raise notice 'zuerich party series: archived=% already=% drift=% missing=% failed=%',
    v_archived, v_already, v_drifted, v_missing, v_failed;

  -- 2) Search eviction. The indexer already refuses archived rows, but the sync
  --    only enqueues; delete now so the postcondition asserts an end state.
  delete from public.search_documents sd
  using public.venues v
  where sd.entity_type = 'venue'
    and sd.entity_id = v.id
    and v.id = any(v_ids)
    and v.review_status = 'archived';
  get diagnostics v_evicted = row_count;
  raise notice 'zuerich party series: evicted % search documents', v_evicted;

  -- 3) Postconditions. Positive control first: a typo'd id list would make every
  --    zero-count assertion below pass vacuously.
  select count(*) into v_present from public.venues where id = any(v_ids);
  if v_present < 1 then
    raise exception 'party series: frozen id list resolves to no venues';
  end if;

  -- The indexer must keep excluding archived venues, or the drain re-adds them.
  select position('review_status is distinct from ''archived''' in
                  regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')) > 0
    into v_has_filter
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'search_documents_index_venues';
  if not coalesce(v_has_filter, false) then
    raise exception 'party series: search_documents_index_venues no longer excludes archived venues';
  end if;

  select count(*) into v_unfinished
  from jsonb_array_elements(v_rows) e
  join public.venues v on v.id = (e->>'id')::uuid
  where v.name = e->>'name'
    and v.review_status is distinct from 'archived';
  if v_unfinished <> 0 then
    raise exception 'party series: % rows are still the row that was read and are not archived', v_unfinished;
  end if;

  select count(*) filter (where v.review_status = 'archived'),
         count(*) filter (where v.review_status = 'archived' and v.seo_indexable),
         count(*) filter (where v.review_status = 'archived'
                            and v.enrichment_status->'nonvenue_candidate'->'archived' ? 'review_status')
    into v_archived_n, v_indexable, v_restorable
  from public.venues v where v.id = any(v_ids);

  select count(*) into v_in_search
  from public.search_documents
  where entity_type = 'venue' and entity_id = any(v_ids);

  if v_archived_n < 1 then
    raise exception 'party series: no row in the cohort is archived; nothing happened';
  end if;
  if v_indexable <> 0 then
    raise exception 'party series: % archived rows are still seo_indexable', v_indexable;
  end if;
  if v_in_search <> 0 then
    raise exception 'party series: % cohort rows are still in search_documents', v_in_search;
  end if;
  if v_restorable <> v_archived_n then
    raise exception 'party series: % of % archived rows lack a restore snapshot',
      v_archived_n - v_restorable, v_archived_n;
  end if;
end
$party$;
