-- The non-US half of the same defect: a city whose wikipedia_title names a
-- DIFFERENT COUNTRY, and which publishes that country's city's facts.
--
-- 99991789819768 and 20260919140930 both scoped to `countries.name = 'United
-- States'`, so a non-US row in the identical shape was never examined. Country
-- names are a closed vocabulary on both sides, which makes this comparable in
-- strength to the state-vs-state rule.
--
-- Corpus-wide the predicate matches THREE rows and only ONE is a defect. The
-- other two are excluded by slug with reasons, so a re-run cannot re-propose
-- them — the same discipline as the Q14767 / Q765811 exclusions:
--
--   sainte-anne (France) -> "Sainte-Anne, Guadeloupe".  NOT a defect. Guadeloupe
--       IS France, an overseas department, so the title is correct and postal
--       97180 is genuinely this commune's.
--   central (China)      -> "Central, Hong Kong".       NOT a defect. Central is
--       in Hong Kong; `countries` simply holds HK separately from China. A
--       filing nuance, not a wrong entity. (Same row already excluded by QID in
--       99991789819768 — the two exclusions agree, which is the point of
--       recording them.)
--
-- THE DEFECT: `leon` is León, Guanajuato, MEXICO (8 venues, indexable) carrying
-- Q15699 — León, SPAIN. Everything the Wikidata path wrote is the Spanish city's:
--   mayor          "José Antonio Diez Díaz"     (mayor of León, Spain)
--   postal_codes   24001–24010                  (Spanish)
--   area_codes     987                          (Spanish)
--   sister_cities  Voronezh, Xiangtan, Matanzas (León Spain's twinnings)
--   universities   University of León           (Spain's)
--
-- DESCRIPTION AND POPULATION ARE KEPT, AND THIS ROW IS WHY THE ORIGINAL RULE IS
-- RIGHT. The prose reads "León, officially León de Los Aldama … in the Mexican
-- state of Guanajuato" and the population 123,446 is Mexican — both came from a
-- different, correct source. A blanket retraction of description on every
-- wrong-QID row would have destroyed correct editorial prose here, which is
-- exactly what 99991789819768 declined to do and why 20260919140930 guarded its
-- description retraction on the prose naming the wrong place. That guard would
-- also spare this row: the description never says "Spain".
--
-- REVERSE: field_provenance.wikidata_repair_retracted carries every prior value.

do $$
declare v_n int; v_leak int;
begin
  perform set_config('app.actor','migration:city_wrong_country_title_leon',true);

  create temporary table _wc on commit drop as
  select ci.id, ci.slug, ci.wikidata_qid, ci.wikipedia_title
    from public.cities ci
    join public.countries co on co.id = ci.country_id and co.name <> 'United States'
   where ci.wikipedia_title like '%,%'
     and ci.duplicate_of_id is null
     and coalesce(ci.shell_status,'real') not in ('ghost','merged')
     and exists (
       select 1 from public.countries c2
        where c2.name = trim((string_to_array(ci.wikipedia_title,','))[array_length(string_to_array(ci.wikipedia_title,','),1)])
          and c2.id <> ci.country_id)
     -- hand-read and refused, see header
     and ci.slug not in ('sainte-anne', 'central');
  select count(*) into v_n from _wc;
  raise notice 'wrong-country rows matched (expect 1): %', v_n;

  update public.cities c
     set mayor = null, postal_codes = null, area_codes = null,
         sister_cities = null, universities = null, local_language = null,
         climate_type = null, airport_codes = null,
         wikidata_qid = null, wikipedia_title = null,
         field_provenance = coalesce(c.field_provenance,'{}'::jsonb) || jsonb_build_object(
           'wikidata_repair_retracted', jsonb_build_object(
             'mayor', to_jsonb(c.mayor), 'postal_codes', to_jsonb(c.postal_codes),
             'area_codes', to_jsonb(c.area_codes), 'sister_cities', to_jsonb(c.sister_cities),
             'universities', to_jsonb(c.universities),
             'from_qid', c.wikidata_qid, 'from_title', c.wikipedia_title,
             'reason', 'wikipedia_title named a city in a different country',
             'by', 'migration:city_wrong_country_title_leon', 'at', now())),
         updated_at = now()
    from _wc w
   where c.id = w.id;

  select count(*) into v_leak from _wc w join public.cities c on c.id = w.id
   where c.mayor is not null or c.postal_codes is not null;
  if v_leak > 0 then
    raise exception 'postcondition failed: % still publish another country''s facts', v_leak;
  end if;

  -- The description and population must SURVIVE: they are correct here, and a
  -- pass that took them would be the over-reach this file exists to argue against.
  if exists (select 1 from public.cities where slug = 'leon' and description is null) then
    raise exception 'over-reach: leon lost its (correct, Mexican) description';
  end if;
  if exists (select 1 from public.cities where slug = 'leon' and population is distinct from 123446) then
    raise exception 'over-reach: leon lost its (correct, Mexican) population';
  end if;

  -- Controls: the two refused rows must be untouched.
  if exists (select 1 from public.cities where slug = 'sainte-anne' and postal_codes is null) then
    raise exception 'over-reach: sainte-anne was repaired but is not a defect';
  end if;
end $$;
