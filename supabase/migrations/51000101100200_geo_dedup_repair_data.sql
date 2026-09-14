-- Geographic dedup data repair: merge what a real source proves, close what
-- proximity only guessed.
--
-- Two halves, in this order for a reason.
--
-- (1) MERGE the 25 qualifier duplicates. Each is "X" against "X, <that row's own
--     country or region>" -- the same name carrying a qualifier. Every one was
--     read by hand: the base row holds the content and a Wikidata id (Berlin
--     1012 venues / Q64, Madrid 429 / Q2807, Basel 340 / Q78) and the qualified
--     row holds ZERO venues and no id. A 26th pair, "Camden" against "Camden,
--     Australia", is deliberately NOT merged: neither side carries an id,
--     neither holds content, and Camden is equally the London borough. Preferring
--     a null to a guess is the rule, so that one is left for a human.
--
-- (2) CLOSE the 122 open `geo_only_2km` rows -- every one a proposal to merge two
--     differently-named places on distance alone, from the arm retired in
--     51000101100000. Among what it proposed: Ueberlingen <-> Wernigerode,
--     Le Cannet <-> Carbonne, Pirna <-> Baden-Baden, New York <-> Manhattan,
--     Stepney <-> Limehouse. Approving any of them destroys a real city.
--
-- ORDER IS LOAD-BEARING. `run_dedup_truth_sweep` treats `status='rejected'` as
-- permanent memory -- a rejected pair is never proposed again. Some of the 122
-- ARE the qualifier duplicates of half (1) (Berlin <-> "Berlin, Germany",
-- Vienna <-> "Vienna, Austria"), so closing first would bar the engine from ever
-- fixing them. Merging first makes the close harmless: those rows are already
-- resolved by the time it runs.
--
-- Closing writes `status='rejected'` and NOT a new status, for the reason this
-- repo has recorded before: the open-pair unique index covers open rows only, so
-- any other value is re-inserted as open on the next sweep and the work repeats
-- forever. Machine closes stay legible as `reviewer_id IS NULL` plus an
-- `auto-distinct:` note carrying the evidence.
--
-- Soft on preconditions, hard on postconditions: a pair already merged by the
-- nightly sweep between authoring and CI is skipped, not fatal. What is asserted
-- is the state reached.

do $repair$
declare
  rec       record;
  v_merged  int := 0;
  v_skipped int := 0;
  v_closed  int := 0;
  v_left    int;
  v_bad     int;
begin
  ------------------------------------------------------------------ (1) merge
  for rec in
    with live as (
      select c.id, c.name, c.country_id, c.region_name, c.wikidata_qid qid,
             c.latitude lat, c.longitude lng,
             public.dedup_despace(c.name) dsp,
             public.dedup_despace(regexp_replace(c.name, '\s*,\s*[^,]+$', '')) base,
             btrim(substring(c.name from ',\s*([^,]+)$')) tail,
             co.name cname, co.code ccode
      from public.cities c
      left join public.countries co on co.id = c.country_id
      where c.duplicate_of_id is null and c.shell_status is distinct from 'merged')
    select a.id keep_id, b.id drop_id, a.name keep_name, b.name drop_name
    from live a join live b
      on a.country_id = b.country_id and a.id <> b.id
     and b.base = a.dsp and b.base <> b.dsp
    where length(a.dsp) >= 3
      and a.qid is not null and b.qid is null
      and public.dedup_despace(b.tail) in (
            public.dedup_despace(a.cname), lower(a.ccode), public.dedup_despace(a.region_name))
      and coalesce(public.haversine_m(a.lat,a.lng,b.lat,b.lng) < 25000, true)
    order by a.name
  loop
    begin
      perform public.merge_cities(rec.keep_id, rec.drop_id, false);
      v_merged := v_merged + 1;
      raise notice 'merged % <- %', rec.keep_name, rec.drop_name;
    exception when others then
      v_skipped := v_skipped + 1;
      raise notice 'skipped % <- % : %', rec.keep_name, rec.drop_name, sqlerrm;
    end;
  end loop;

  -- (1b) a pair this migration just merged leaves its queue row dangling open.
  -- Two of the 25 were already hand-queued as `qualified_name_base_match`
  -- (Raleigh, Alicante), so resolve them as approved -- they were correct, and
  -- rejecting a pair that was in fact merged would be a false record.
  update public.dedup_review_queue q
     set status        = 'approved',
         reviewed_at   = now(),
         reviewer_note = 'auto-merged: qualifier duplicate resolved by migration 51000101100200; '
                      || 'the base row carries the Wikidata id and the content.'
    from public.cities d
   where d.id = q.drop_id
     and q.entity_type = 'city' and q.status = 'open'
     and q.reason <> 'geo_only_2km'
     and d.duplicate_of_id is not null;

  ------------------------------------------------------------------ (2) close
  update public.dedup_review_queue
     set status        = 'rejected',
         reviewed_at   = now(),
         reviewer_note = 'auto-distinct: proposed by the retired geo_only_2km arm, which paired '
                      || 'differently-named rows on distance alone. Distance between two names is '
                      || 'not evidence of identity, and a metre-scale reading here is the placeholder-'
                      || 'coordinate signature, not proximity. Re-open only on a real gazetteer '
                      || 'identifier (migration 51000101100000).'
   where entity_type = 'city' and status = 'open' and reason = 'geo_only_2km';
  get diagnostics v_closed = row_count;

  ------------------------------------------------------- postconditions
  select count(*) into v_left
  from public.dedup_review_queue
  where entity_type = 'city' and status = 'open' and reason = 'geo_only_2km';
  if v_left <> 0 then
    raise exception 'still % open geo_only_2km rows after the close', v_left;
  end if;

  -- no OPEN geographic pair may name two different places. The qualifier form
  -- ("X" vs "X, <qualifier>") is the same name and is excluded; anything else
  -- with a differing name key is exactly what must never be suggested.
  select count(*) into v_bad
  from public.dedup_review_queue q
  join public.cities ka on ka.id = q.keep_id
  join public.cities da on da.id = q.drop_id
  where q.entity_type = 'city' and q.status = 'open'
    and public.dedup_despace(ka.name) <> public.dedup_despace(da.name)
    and public.dedup_despace(regexp_replace(da.name, '\s*,\s*[^,]+$', '')) <> public.dedup_despace(ka.name)
    and public.dedup_despace(regexp_replace(ka.name, '\s*,\s*[^,]+$', '')) <> public.dedup_despace(da.name);
  if v_bad <> 0 then
    raise exception '% open city pairs still name two different places', v_bad;
  end if;

  select count(*) into v_left
  from public.dedup_review_queue q
  join public.cities d on d.id = q.drop_id
  where q.entity_type = 'city' and q.status = 'open' and d.duplicate_of_id is not null;
  if v_left <> 0 then
    raise exception '% open city pairs point at an already-merged row', v_left;
  end if;

  raise notice 'geo repair: merged=% skipped=% closed=%', v_merged, v_skipped, v_closed;
end
$repair$;
