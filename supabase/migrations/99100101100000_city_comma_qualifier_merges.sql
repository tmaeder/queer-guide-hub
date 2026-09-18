-- Merge the seven comma-qualified city rows that a REAL second signal corroborates.
--
-- The standing requirement is that country/city/village dedup rests on real
-- geographical sources and names and never merges two different places. The
-- backlog recorded in CLAUDE.md read "~359 comma-qualified names and exonym
-- duplicates need merge_cities". Re-measured here, that is wrong by roughly
-- fifty times, and the correction matters more than the merges:
--
--   330  live comma-qualified rows
--    35  of those have ANY same-country twin under the bare head name
--     0  corroborated by a shared wikidata_qid
--     7  corroborated by proximity (< 10 km)   <- this migration
--     6  twin exists and is a DIFFERENT place (10 km .. 3,976 km)
--    22  twin exists but one side has no coordinates, so nothing corroborates
--
-- So the mergeable set is 7, not 359, and a pass that merged "comma-qualified
-- rows with a same-name twin" would have merged 6 different places and 22
-- unverifiable pairs -- exactly what the requirement forbids.
--
-- WHY THE OBVIOUS HEURISTIC FOR THE 22 IS REFUSED. It is tempting to say that
-- when the qualifier names a region of the row's own country ("Antwerp,
-- Flanders" in BE beside "Antwerp" in BE) the pair is the same place. Group B
-- refutes that from inside this very cohort: "Schwerin, Brandenburg" sits
-- beside "Schwerin" in DE and the two are 431 km apart, because there really is
-- a Schwerin in Brandenburg as well as the Mecklenburg capital. That row also
-- carries Q1709 -- the Mecklenburg city -- so it is a WRONG IDENTIFIER, not a
-- duplicate, and it is left alone here for that reason. Region agreement is not
-- a second signal; coordinates and shared identifiers are. The 22 stay until
-- city_qid_gap_link supplies an identifier for them.
--
-- The seven are safe to merge beyond the distance: every qualified row holds
-- ZERO venues and ZERO events while its twin holds the content and usually the
-- QID, so the merge moves a redirect and loses no editorial work.
--
-- SOFT ON PRECONDITIONS, HARD ON POSTCONDITIONS. The pairs are named
-- explicitly so no row this file's author did not read can be merged, but each
-- is re-resolved and re-checked against the < 10 km rule at apply time: a pair
-- another session has already merged, or one whose coordinates have moved, is
-- SKIPPED and reported rather than aborting. An abort here would take every
-- migration queued behind it on main.
--
-- Reversible: merge_cities stamps details.moved + schema 1 (29000101100000), so
-- unmerge_cities(audit_id) replays all 33 child relations. Verified by dry run
-- on prod in a transaction forced to roll back: 7 merged, every audit schema=1,
-- comma-qualified live 330 -> 323, nothing committed.
do $$
declare
  r record;
  v_merged int := 0;
  v_skipped text := '';
  v_km numeric;
  v_bad int;
begin
  perform set_config('app.actor', 'migration:city_comma_qualifier_merges', true);

  for r in
    with pairs(drop_name, keep_name, cc) as (values
      ('Brasília, Distrito Federal',      'Brasília',      'BR'),
      ('Cebu City, Cebu',                 'Cebu City',     'PH'),
      ('Davao City, Davao del Sur',       'Davao City',    'PH'),
      ('Dublin, Republic of Ireland',     'Dublin',        'IE'),
      ('Immenstadt, Allgäu',              'Immenstadt',    'DE'),
      ('Salvador, Bahia',                 'Salvador',      'BR'),
      ('Vancouver, British Colombia',     'Vancouver',     'CA')
    )
    select p.drop_name, p.keep_name,
           d.id as drop_id, k.id as keep_id,
           d.latitude as dlat, d.longitude as dlon,
           k.latitude as klat, k.longitude as klon
      from pairs p
      left join countries co on co.code = p.cc
      left join cities d on d.name = p.drop_name and d.country_id = co.id and d.duplicate_of_id is null
      left join cities k on k.name = p.keep_name and k.country_id = co.id and k.duplicate_of_id is null
  loop
    if r.drop_id is null or r.keep_id is null then
      v_skipped := v_skipped || format(E'\n  skipped (row absent or already merged): %s -> %s',
                                       r.drop_name, r.keep_name);
      continue;
    end if;

    if r.dlat is null or r.klat is null then
      v_skipped := v_skipped || format(E'\n  skipped (coordinates gone, cannot corroborate): %s -> %s',
                                       r.drop_name, r.keep_name);
      continue;
    end if;

    v_km := haversine_m(r.dlat::numeric, r.dlon::numeric, r.klat::numeric, r.klon::numeric) / 1000;
    if v_km >= 10 then
      v_skipped := v_skipped || format(E'\n  skipped (now %s km apart, over the 10 km gate): %s -> %s',
                                       round(v_km, 1), r.drop_name, r.keep_name);
      continue;
    end if;

    perform merge_cities(r.keep_id, r.drop_id, false);
    v_merged := v_merged + 1;
  end loop;

  raise notice 'comma-qualifier merges: % merged%', v_merged,
    coalesce(nullif(v_skipped, ''), ' (none skipped)');

  -- Postcondition 1: none of the seven is still live as an unmerged duplicate
  -- next to its twin inside the gate. Counts the REACHED state, so a slug that
  -- has gone missing from the corpus entirely cannot satisfy it by absence.
  select count(*) into v_bad
    from (values
      ('Brasília, Distrito Federal','Brasília','BR'),
      ('Cebu City, Cebu','Cebu City','PH'),
      ('Davao City, Davao del Sur','Davao City','PH'),
      ('Dublin, Republic of Ireland','Dublin','IE'),
      ('Immenstadt, Allgäu','Immenstadt','DE'),
      ('Salvador, Bahia','Salvador','BR'),
      ('Vancouver, British Colombia','Vancouver','CA')
    ) p(drop_name, keep_name, cc)
    join countries co on co.code = p.cc
    join cities d on d.name = p.drop_name and d.country_id = co.id and d.duplicate_of_id is null
    join cities k on k.name = p.keep_name and k.country_id = co.id and k.duplicate_of_id is null
   where d.latitude is not null and k.latitude is not null
     and haversine_m(d.latitude::numeric, d.longitude::numeric,
                     k.latitude::numeric, k.longitude::numeric) < 10000;
  if v_bad <> 0 then
    raise exception 'postcondition failed: % corroborated comma-qualified duplicates still unmerged', v_bad;
  end if;

  -- Postcondition 2 (the mirror): the six pairs that are DIFFERENT places must
  -- still be live and unmerged. "The seven are gone" is equally satisfied by a
  -- sweep that took everything, so this is what distinguishes the two.
  select count(*) into v_bad
    from (values
      ('Sandusky, Ohio'),('Dearborn, Michigan'),('Hudson, Wisconsin'),
      ('Norwalk, California'),('Schwerin, Brandenburg'),('Aguascalientes, Aguascalientes')
    ) p(nm)
    join cities c on c.name = p.nm
   where c.duplicate_of_id is not null;
  if v_bad <> 0 then
    raise exception 'postcondition failed: % rows that are DIFFERENT places were merged', v_bad;
  end if;

  -- Postcondition 3: every merge this file made is reversible.
  select count(*) into v_bad
    from city_merge_audit a
   where a.created_at > now() - interval '5 minutes'
     and coalesce(a.details->>'schema','') <> '1';
  if v_bad <> 0 then
    raise exception 'postcondition failed: % merges recorded without schema 1 (not reversible)', v_bad;
  end if;
end $$;
