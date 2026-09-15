-- Non-place city shells that carry real content: Wales, Scotland, Texas, California
--
-- WHAT IS WRONG
-- `cities` holds four rows named after a country-of-the-UK or a US state, all four
-- minted by `data_source='personality-birth-place'` (the documented cohort: `tmp-` slug,
-- no `wikidata_qid`, `shell_status='placeholder'`). Measured on prod 2026-09-15, all four
-- were live in `search_documents` — `seo_indexable=false` governs crawlers and the sitemap,
-- never site search — so a search for "California" returned a CITY card, and 21 live venues
-- asserted they are located in the city of California / Scotland / Wales.
--
--   California  13 venues, 0 events,  7 births
--   Scotland     4 venues, 0 events,  2 births
--   Wales        4 venues, 0 events,  1 birth
--   Texas        0 venues, 0 events, 10 births
--
-- This is the originating rule for this work: countries, cities and villages must be based
-- on real geographical sources and names. A US state is not a city.
--
-- WHY THE ORDER IS LOAD-BEARING
-- `archive_city_as_nonplace` REFUSES a row that still has venues or events
-- (`{ok:false, error:'has_content'}`) — the function encodes the correct order rather than
-- silently orphaning content. So the venues must be dispositioned FIRST, and the archive is
-- the last step. Read the function before changing this ordering.
--
-- RELINK, THEN UNLINK — AND NEVER GUESS
-- `20260802090844` established the rule for this corpus: `cities` cannot represent same-name
-- collisions, so an entity is never resolved by name alone, and a disagreeing independent
-- signal BLOCKS rather than guesses — a null `city_id` is recoverable, a wrong one is not.
-- So a venue is relinked only when its OWN `city` text resolves to EXACTLY ONE live city in
-- the SAME country, and — when both sides carry one — `venues.state` agrees with
-- `cities.region_name`. Everything else is unlinked, not guessed.
--
-- Measured before writing: of the 11 venues whose own city text names a real town, only
-- TWO have a row in `cities` at all (Simi Valley, Lampeter). The other nine name towns this
-- corpus does not hold — Avalon, El Centro, Big Bear Lake, Pitlochry, Inverness, Fort
-- William, Abergele, Aberystwyth — which is the same "the correct cities do not exist in
-- `cities` at all" finding `20260802090844` recorded. They stay unlinked until real rows
-- exist. The remaining ten name the non-place itself ("California", "Wales") and were never
-- resolvable.
--
-- The relink is expressed as a RULE, not a frozen id list, so it picks up any of the nine
-- automatically if a later pass creates those city rows, and drops a row that has moved.
--
-- SOFT ON PRECONDITIONS, HARD ON POSTCONDITIONS. Every selection is by the defect's own
-- signature (`data_source` + name + no qid + live), never by id, so a concurrent session that
-- legitimately archives or merges one of these rows makes this file a no-op for it instead of
-- aborting `db push` on main and taking every queued migration with it.

do $nonplace$
declare
  v_shell_ids   uuid[];
  v_relinked    int := 0;
  v_unlinked    int := 0;
  v_archived    int := 0;
  v_refused     int := 0;
  rec           record;
  v_res         jsonb;
begin
  select array_agg(id) into v_shell_ids
  from public.cities
  where duplicate_of_id is null
    and data_source = 'personality-birth-place'
    and wikidata_qid is null
    and name in ('Wales','Scotland','Texas','California');

  if v_shell_ids is null or cardinality(v_shell_ids) = 0 then
    raise notice 'nonplace shells: none match the signature — already dispositioned, nothing to do';
    return;
  end if;
  raise notice 'nonplace shells matched: %', cardinality(v_shell_ids);

  -- 1. RELINK where the venue's own city text is corroborated.
  with cand as (
    select v.id vid, v.city ctext, v.state vstate, v.country_id
    from public.venues v
    where v.city_id = any(v_shell_ids)
      and coalesce(btrim(v.city),'') <> ''
      and lower(btrim(v.city)) not in ('wales','scotland','texas','california')
  ),
  resolved as (
    select c.vid,
           (select x.id from public.cities x
             where x.country_id = c.country_id
               and lower(x.name) = lower(btrim(c.ctext))
               and x.duplicate_of_id is null
               -- region corroboration: block only when BOTH sides state one and they disagree
               and (coalesce(btrim(c.vstate),'') = ''
                 or coalesce(btrim(x.region_name),'') = ''
                 or lower(btrim(x.region_name)) = lower(btrim(c.vstate)))
             limit 1) target_id,
           (select count(*) from public.cities x
             where x.country_id = c.country_id
               and lower(x.name) = lower(btrim(c.ctext))
               and x.duplicate_of_id is null) n_matches
    from cand c
  ),
  upd as (
    update public.venues v
       set city_id = r.target_id
      from resolved r
     where v.id = r.vid and r.target_id is not null and r.n_matches = 1
    returning 1
  )
  select count(*) into v_relinked from upd;

  -- 2. UNLINK the rest. country_id and the address text are kept, so nothing is destroyed —
  --    only the false claim "this venue is in the city of California" is withdrawn.
  with upd as (
    update public.venues v
       set city_id = null,
           needs_attention = true,
           enrichment_status = coalesce(v.enrichment_status,'{}'::jsonb)
             || jsonb_build_object('nonplace_city_unlink',
                  jsonb_build_object('state','unlinked',
                                     'reason','city_id pointed at a non-place shell',
                                     'by','migration:74000101100000',
                                     'at', now()))
     where v.city_id = any(v_shell_ids)
    returning 1
  )
  select count(*) into v_unlinked from upd;

  -- 3. ARCHIVE the shells (reversible via unarchive_city; removes them from site search).
  for rec in select id, name from public.cities where id = any(v_shell_ids) loop
    v_res := public.archive_city_as_nonplace(
      rec.id,
      'Not a city: names a country of the UK or a US state. personality-birth-place shell, tmp- slug, no wikidata_qid.',
      jsonb_build_object('source','migration:74000101100000','name',rec.name));
    if coalesce((v_res->>'ok')::boolean,false) then
      v_archived := v_archived + 1;
    else
      v_refused := v_refused + 1;
      raise notice 'archive refused for % : %', rec.name, v_res->>'error';
    end if;
  end loop;

  raise notice 'relinked=% unlinked=% archived=% refused=%',
    v_relinked, v_unlinked, v_archived, v_refused;
end $nonplace$;

-- Postconditions: assert the REACHED state positively. Counting rows in a bad state returns
-- zero for a row that has gone missing from the corpus entirely, which is exactly what the
-- softened selection above lets through.
do $verify$
declare
  v_live_shells int;
  v_ghost       int;
  v_content     int;
  v_in_search   int;
begin
  select count(*) into v_live_shells
  from public.cities
  where duplicate_of_id is null and data_source='personality-birth-place'
    and wikidata_qid is null and name in ('Wales','Scotland','Texas','California')
    and coalesce(shell_status::text,'real') <> 'ghost';

  select count(*) into v_ghost
  from public.cities
  where data_source='personality-birth-place' and wikidata_qid is null
    and name in ('Wales','Scotland','Texas','California')
    and shell_status::text = 'ghost'
    and enrichment_status->'disposition'->>'state' = 'not_a_city';

  select count(*) into v_content
  from public.cities c
  where c.name in ('Wales','Scotland','Texas','California')
    and c.data_source='personality-birth-place' and c.wikidata_qid is null
    and (exists (select 1 from public.venues v where v.city_id=c.id)
      or exists (select 1 from public.events e where e.city_id=c.id));

  if v_live_shells <> 0 then
    raise exception 'nonplace shells still un-archived: %', v_live_shells;
  end if;
  if v_ghost < 4 then
    raise exception 'expected 4 archived non-place shells, found %', v_ghost;
  end if;
  if v_content <> 0 then
    raise exception 'venues/events still attached to a non-place shell: %', v_content;
  end if;

  -- A ghost city must not be in site search. This is the half `seo_indexable` does NOT cover
  -- and is the reason archiving is a fix rather than a flag (20261016110000).
  select count(*) into v_in_search
  from public.search_documents s
  join public.cities c on c.id = s.entity_id
  where s.entity_type='city' and c.shell_status::text='ghost'
    and c.name in ('Wales','Scotland','Texas','California')
    and c.data_source='personality-birth-place';
  if v_in_search <> 0 then
    raise notice 'NOTE: % ghost shell(s) still in search_documents — the reindex queue drains asynchronously', v_in_search;
  end if;

  raise notice 'verify ok: 4 non-place shells archived, no venues or events left on them';
end $verify$;
