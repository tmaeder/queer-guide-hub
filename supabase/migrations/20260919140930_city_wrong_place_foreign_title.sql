-- Residue of 99991789819768: US city rows whose wikipedia_title names a place
-- OUTSIDE their own state — including foreign ones.
--
-- FOUND BY THE E2E, NOT BY READING. `e2e/city-wrong-entity-facts.spec.ts` asserted
-- /city/saint-paul no longer publishes "Joseph Sinimalé" and it still did. The
-- earlier migration's part 2 required the title qualifier to be a US STATE, so a
-- US row whose title names Réunion, Slovakia or Uruguay fell outside the predicate
-- entirely. That migration's header cited Saint Paul as an example of what it
-- repaired; it did not. The header was wrong and this file is the correction.
--
-- WHAT WAS STILL LIVE (15 rows, all indexable):
--   Saint Paul, Minnesota  -> Saint-Paul, RÉUNION     mayor "Joseph Sinimalé", 6 Réunion postcodes
--   Santa Cruz, California -> Santa Cruz, LAGUNA (PH) mayor "Ariel Magcalas", postal 4009
--   Martin, Tennessee      -> Martin, SLOVAKIA        mayor "Ján Danko", postal 036 01
--   San Carlos, California -> San Carlos, URUGUAY
--   Nelson, Wisconsin      -> Nelson, LANCASHIRE      postal BB9
--   Waterloo, Iowa         -> Waterloo, ONTARIO       Canadian postcodes
--   Santa Ana, California  -> Santa Ana, EL SALVADOR
--   plus Belmont/Bas-Rhin, Chantilly/Oise, Clifton/Cumbria, Houghton/Hampshire,
--        Oakley/Hampshire, Saint Joseph/Martinique, Woodhaven/Queens, Regina/Saskatchewan
--
-- THE PREDICATE TESTS THE **LAST** COMMA SEGMENT, NOT THE SECOND, AND THAT IS THE
-- WHOLE CORRECTION. Splitting on the second segment reports `El Sobrante, Contra
-- Costa County, California`, `Hamilton Township, Mercer County, New Jersey` and
-- `Springfield Township, Delaware County, Pennsylvania` as defects — they are
-- CORRECT Wikipedia titles that merely carry a county between the name and the
-- state. Measured: the second-segment form flags 17 rows of which 3 are false
-- positives; the last-segment form flags 15 and none is. A three-part title ends
-- in its state, so the last segment is the only part that can be compared with
-- `region_name` at all.
--
-- DESCRIPTION IS RETRACTED HERE, WHICH 99991789819768 DELIBERATELY DID NOT DO.
-- That file left `description` alone because it is usually sourced elsewhere and
-- is mostly correct even on a wrong-QID row — a painting has no population, so it
-- cannot have supplied Dresden's. This cohort is the exception and it is PROVEN
-- per row rather than assumed: the retraction is guarded on the description
-- actually containing the wrong place's name, so /city/saint-paul (whose prose
-- opens "the second-largest commune in the French overseas department of Réunion")
-- is cleared while `saint-joseph-us-vfst6`, whose description never says
-- Martinique, keeps its prose. 14 of 15 match; the 15th is spared by the guard.
--
-- Dry-run on prod in a rolled-back transaction before applying: matched 15,
-- facts retracted 15, descriptions retracted 14, control 991 cities still
-- publishing a mayor.
--
-- REVERSE: field_provenance.wikidata_repair_retracted and .description_retracted
-- carry every prior value.

do $$
declare v_facts int; v_descr int; v_leak int; v_matched int;
begin
  perform set_config('app.actor','migration:city_wrong_place_foreign_title',true);

  create temporary table _wp on commit drop as
  with states(s) as (values ('Alabama'),('Alaska'),('Arizona'),('Arkansas'),('California'),('Colorado'),
   ('Connecticut'),('Delaware'),('Florida'),('Georgia'),('Hawaii'),('Idaho'),('Illinois'),('Indiana'),
   ('Iowa'),('Kansas'),('Kentucky'),('Louisiana'),('Maine'),('Maryland'),('Massachusetts'),('Michigan'),
   ('Minnesota'),('Mississippi'),('Missouri'),('Montana'),('Nebraska'),('Nevada'),('New Hampshire'),
   ('New Jersey'),('New Mexico'),('New York'),('North Carolina'),('North Dakota'),('Ohio'),('Oklahoma'),
   ('Oregon'),('Pennsylvania'),('Rhode Island'),('South Carolina'),('South Dakota'),('Tennessee'),
   ('Texas'),('Utah'),('Vermont'),('Virginia'),('Washington'),('West Virginia'),('Wisconsin'),('Wyoming'),
   ('District of Columbia'))
  select ci.id, ci.slug, ci.wikidata_qid, ci.wikipedia_title,
         trim((string_to_array(ci.wikipedia_title,','))[array_length(string_to_array(ci.wikipedia_title,','),1)]) as last_seg
    from public.cities ci
    join public.countries co on co.id=ci.country_id and co.name='United States'
   where ci.wikipedia_title like '%,%' and ci.duplicate_of_id is null
     and coalesce(ci.shell_status,'real') not in ('ghost','merged')
     and ci.region_name in (select s from states)
     and trim((string_to_array(ci.wikipedia_title,','))[array_length(string_to_array(ci.wikipedia_title,','),1)]) <> ci.region_name
     and (ci.mayor is not null or ci.postal_codes is not null or ci.area_codes is not null
          or ci.sister_cities is not null or ci.universities is not null);
  select count(*) into v_matched from _wp;
  raise notice 'wrong-place rows matched: %', v_matched;

  update public.cities c
     set postal_codes=null, area_codes=null, mayor=null, sister_cities=null, universities=null,
         local_language=null, climate_type=null, airport_codes=null,
         wikidata_qid=null, wikipedia_title=null,
         field_provenance = coalesce(c.field_provenance,'{}'::jsonb) || jsonb_build_object(
           'wikidata_repair_retracted', jsonb_build_object(
             'postal_codes',to_jsonb(c.postal_codes),'area_codes',to_jsonb(c.area_codes),
             'mayor',to_jsonb(c.mayor),'sister_cities',to_jsonb(c.sister_cities),
             'universities',to_jsonb(c.universities),'from_qid',c.wikidata_qid,
             'from_title',c.wikipedia_title,
             'reason','wikipedia_title named a place outside the row''s own US state',
             'by','migration:city_wrong_place_foreign_title','at',now())),
         updated_at=now()
    from _wp w where c.id=w.id;
  get diagnostics v_facts = row_count;
  raise notice 'fact rows retracted: %', v_facts;

  -- Guarded: only where the prose provably names the wrong place.
  update public.cities c
     set description = null,
         field_provenance = coalesce(c.field_provenance,'{}'::jsonb) || jsonb_build_object(
           'description_retracted', jsonb_build_object(
             'was', c.description, 'named', w.last_seg,
             'by','migration:city_wrong_place_foreign_title','at',now())),
         updated_at=now()
    from _wp w
   where c.id=w.id and c.description is not null and c.description ilike '%'||w.last_seg||'%';
  get diagnostics v_descr = row_count;
  raise notice 'descriptions retracted: %', v_descr;

  select count(*) into v_leak from _wp w join public.cities c on c.id=w.id
   where c.mayor is not null or c.postal_codes is not null;
  if v_leak>0 then raise exception 'postcondition failed: % still publish wrong facts', v_leak; end if;

  -- Control: the corpus must still publish mayors, or the predicate over-reached.
  if (select count(*) from public.cities where mayor is not null and duplicate_of_id is null) < 500 then
    raise exception 'control failed: the corpus lost its mayors';
  end if;
end $$;
