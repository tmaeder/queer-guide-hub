-- Merge 101 city rows that are the SAME real place filed under a second name.
--
-- WHY THE EXISTING SWEEP COULD NOT SEE THESE. `run_dedup_truth_sweep`'s city
-- arm keys on `dedup_despace(name)` — same country, identical key, coordinates
-- within 10 km. That arm is correct and has already merged 153 pairs. It is
-- structurally blind to this class, because an exonym never shares a key with
-- its counterpart: dedup_despace('Munich') is 'munich' and dedup_despace(
-- 'München') is 'munchen'. Measured on production 2026-09-28: exact, despaced
-- and unaccent-folded duplicates per country are ZERO, while 196 coordinate
-- pairs under 2 km survive. The gap is the whole finding.
--
-- The damage is a content split, not cosmetics. Munich carried 166 venues+events
-- and München 1; Copenhagen 149 / København 3; Lisbon 147 / Lisboa 26; Tel Aviv
-- 383 / תל־אביב–יפו 10; Athens 61 / Athen 7 / Αθήνα 17. Every one of those pairs
-- also split city completeness, the coverage radar and the city page's own rails.
--
-- THREE SHAPES, one merge each:
--   exonym          Munich/München, Venice/Venedig, Gothenburg/Göteborg
--   native script   Tokyo/東京, Seoul/서울특별시, Belgrade/Београд, Lviv/Львів
--   qualifier form  Linz/Linz an der Donau, Bacolod City/Bacolod, Toluca/Toluca de Lerdo
--
-- WHAT IS DELIBERATELY NOT HERE. Geographic proximity alone does not make two
-- rows one place, and the two classes it confuses are exactly the ones that must
-- never be merged: a district inside its city (Manhattan/New York, Mestre/
-- Venedig, Diez de Octubre/Havana, Stepney/Tower Hamlets) and an administrative
-- umbrella around it (Brighton and Hove, Grad Zagreb — merged, since Grad Zagreb
-- IS the city of Zagreb — but Calderdale, Vordingborg Kommune, Greater London are
-- not). Those stay for human review; the geo arm added in the companion migration
-- queues them and never auto-merges. This list was read pair by pair.
--
-- KEEP SIDE = the row that should carry the public name. merge_cities keeps the
-- survivor's name and files the dropped one in `city_aliases`, so nothing becomes
-- unsearchable — but a rename AFTERWARDS is not available, because
-- idx_cities_name_country_unique is TOTAL and still holds the dropped row's name.
-- The name is therefore decided here or never.
--
-- Choosing the better name was only affordable because of the scalar backfill at
-- the bottom of the loop. merge_cities moves children and copies NO scalar column,
-- so keeping the better-named row would otherwise discard the QID, description and
-- population the other row had earned. That is why three pairs (Marburg,
-- Greifswald, Pamplona) keep the short common name and inherit the official row's
-- facts, instead of publishing 'Universitäts- und Hansestadt Greifswald' as a city
-- name in order to keep Q4098.
--
-- QID TRANSFER IS OPT-IN PER PAIR. uq_cities_wikidata_qid is partial on
-- `duplicate_of_id IS NULL`, so once the dropped row is merged its QID leaves the
-- index and can move to the survivor. That is right when both rows denote the
-- same Wikidata entity (12 pairs) and WRONG when the dropped row's QID denotes
-- something else: Distrito de Cusco is Q2723621, the DISTRICT, not the city, and
-- Wimberly's Q31590491 is unverified. Those two carry transfer_qid = false and
-- lose the QID rather than publish a false identity claim; city-factual-backfill
-- re-resolves a null.
--
-- Cross-country merges are impossible here (every pair is same-country), so the
-- guard from 20260810110000 stays armed and is never bypassed.

do $$
declare
  r          record;
  v_country  uuid;
  v_keep     uuid;
  v_drop     uuid;
  n_merged   int := 0;
  n_skipped  int := 0;
  n_qid      int := 0;
begin
  for r in
    select * from (values
      ('AL','Tirana','Tiranë',true),
      ('AM','Yerevan','Երևան',true),
      ('AR','Comodoro Rivadavia','Municipio de Comodoro Rivadavia',true),
      ('AT','Vienna','Wien',true),
      ('AT','Linz','Linz an der Donau',true),
      ('BE','Ixelles','Ixelles - Elsene',true),
      ('BE','Saint-Gilles','Saint-Gilles - Sint-Gillis',true),
      ('BE','Ostend','Oostende',true),
      ('BG','Sliven','Sliwen',true),
      ('BH','Jidd Ḩafş','جِدحفص',true),
      ('BR','Belém','Belém, Pará',true),
      ('CA','Québec','Quebec City, Quebec',true),
      ('CH','Bern','Berne',true),
      ('CH','Geneva','Genève',true),
      -- name is a pasted Notion URL; the clean row carries 15 venues+events
      ('CH','Lyss','Lyss (CH) (https://www.notion.so/Lyss-CH-6045c2ad7cfc4095bd51eac41be74cfd?pvs=21)',true),
      ('CN','Guangzhou','Kanton',true),
      ('CO','Medellín','Perímetro Urbano Medellín',true),
      ('CO','Cartagena','Cartagena de Indias',true),
      ('CZ','Brno','Brünn',true),
      ('CZ','Brno','Brünn/Brno',true),
      ('DE','Munich','München',true),
      ('DE','Ulm','Ulm an der Donau',true),
      ('DE','Marburg','Marburg an der Lahn',true),
      ('DE','Offenbach','Offenbach am Main',true),
      -- coordinate-less shell beside the real Frankfurt row (87 venues): invisible
      -- to every proximity check, which is why it survived this long
      ('DE','Frankfurt','Frankfurt am Main',true),
      ('DE','Braunschweig','Brunswick',true),
      ('DE','Freiburg','Freiburg im Breisgau',true),
      -- 'Hanover' also carries Frankfurt's coordinates; merging retires that row
      ('DE','Hannover','Hanover',true),
      ('DE','Mülheim','Mülheim an der Ruhr',true),
      ('DE','Greifswald','Universitäts- und Hansestadt Greifswald',true),
      ('DE','Wuppertal-Elberfeld','Elberfeld',true),
      -- 'Hamburg-Altona' / 'Altona, Hamburg' is deliberately NOT here. Both are
      -- Hamburg district shells, and 20260929130000 (PR #3049) dispositions all
      -- three Altona rows into Hamburg itself by uuid, which is the correct
      -- disposition rather than merging two shells into each other. Merging them
      -- here first would also make that migration raise 'drop city already
      -- merged' and abort the push, since this file sorts below it.
      ('DK','Copenhagen','København',true),
      -- Frederiksberg city and Frederiksberg Kommune are coextensive
      ('DK','Frederiksberg','Frederiksberg Kommune',true),
      ('ES','San Sebastián','Donostia-San Sebastián',true),
      ('ES','Pamplona','Pamplona / Iruña',true),
      ('ES','Seville','Sevilla',true),
      ('ES','Elche','Elx / Elche',true),
      ('ES','Castelló de la Plana','Castellón de la Plana',true),

      ('FR','Nice','Nizza',true),
      ('FR','Strasbourg','Strassburg',true),
      -- the commune was renamed Montreuil; Montreuil-sous-Bois is the old form
      ('FR','Montreuil','Montreuil-sous-Bois',true),
      ('GB','Bebington','Bebington, Merseyside',true),
      -- a landmark filed as a city
      ('GB','Caernarfon','Caernarfon Castle',true),
      ('GE','Tbilisi','თბილისი',true),
      ('GR','Athens','Athen',true),
      ('GR','Athens','Αθήνα',true),
      ('GR','Piraeus','Piräus',true),
      ('GT','Guatemala City','Guatemala-Stadt',true),
      ('GT','Guatemala City','Ciudad de Guatemala',true),
      -- Grad Zagreb is the city of Zagreb, not a county around it
      ('HR','Zagreb','Grad Zagreb',true),
      ('ID','Medan','Kota Medan',true),
      ('ID','Bandung','Kota Bandung',true),
      ('IL','Tel Aviv','תל־אביב–יפו',true),
      ('IN','New Delhi','Neu-Delhi',true),
      ('IN','Bengaluru','Bangalore',true),
      ('IR','Tehran','Teheran',true),
      ('IT','Milan','Mailand',true),
      ('IT','Venice','Venedig',true),
      ('IT','Venice','Venezia',true),
      ('IT','Turin','Torino',true),
      ('IT','Trieste','Triest',true),
      ('IT','Reggio Calabria','Reggio di Calabria',true),
      ('IT','Sassari','Tàttari/Sassari',true),
      ('JP','Tokyo','東京',true),
      ('KR','Seoul','서울특별시',true),
      ('KW','Kuwait City','Kuwait-Stadt',true),
      ('LA','Vientiane','ວຽງຈັນ',true),
      ('LU','Luxembourg','Luxemburg-Stadt',true),
      ('MU','Grand Baie VCA','Grand Baie VCA, East',true),
      ('MX','Santiago de Querétaro','Querétaro',true),
      ('MX','Santiago de Querétaro','Querétaro City',true),
      ('MX','Toluca','Toluca de Lerdo',true),
      ('MX','Culiacán Rosales','Culiacán Rosales, Sinaloa',true),

      ('MX','Chihuahua','Chihuahua City',true),
      ('NL','The Hague','Den Haag',true),
      ('PA','Panama City','Panamá',true),
      -- Q2723621 is the DISTRICT of Cusco, not the city: no transfer
      ('PE','Cuzco','Distrito de Cusco',false),
      ('PH','Bacolod City','Bacolod',true),
      ('PH','Bacolod City','Bacolod, Negros Occidental',true),
      ('PH','Makati City','Makati',true),
      ('PH','Zamboanga','Zamboanga City',true),
      ('PL','Toruń','Thorn',true),
      ('PL','Poznań','Posen',true),
      ('PL','Warsaw','Warszawa',true),
      ('PT','Lisbon','Lisboa',true),
      ('RS','Belgrade','Београд',true),
      ('RU','Yaroslavl','Jaroslawl',true),
      ('RU','Rostov-on-Don','Rostow am Don',true),
      ('RU','Volgograd','Wolgograd',true),
      ('RU','Irkutsk','Иркутск',true),
      ('SE','Gothenburg','Göteborg',true),
      ('SG','Singapore','Singapur',true),
      -- a row named after the COUNTRY, sitting on Tunis' coordinates
      ('TN','Tunis','Tunesien',true),
      ('TW','Taipei','臺北市',true),
      ('TW','Hualien City','Hualien',true),
      ('UA','Lviv','Львів',true),
      ('AE','Abu Dhabi','أبو ظبي',true),
      -- misspelling; Q31590491 unverified against the correct row
      ('US','Wimberley','Wimberly',false),
      ('US','Corning','City of Corning',true),
      ('VI','Saint Thomas','St. Thomas',true),
      ('ZA','Cape Town','Kapstadt',true)
    ) as p(cc, keep_name, drop_name, transfer_qid)
  loop
    select id into v_country from public.countries where code = r.cc;
    if v_country is null then
      raise notice 'city merge skipped: country % not found (% <- %)', r.cc, r.keep_name, r.drop_name;
      n_skipped := n_skipped + 1;
      continue;
    end if;

    select id into v_keep from public.cities
     where country_id = v_country and lower(name) = lower(r.keep_name) and duplicate_of_id is null;
    select id into v_drop from public.cities
     where country_id = v_country and lower(name) = lower(r.drop_name) and duplicate_of_id is null;

    -- A missing or already-merged side is not an error: this migration is
    -- replayable, and the nightly sweep may have reached a pair first.
    if v_keep is null or v_drop is null or v_keep = v_drop then
      raise notice 'city merge skipped: % <- % [%] (keep=% drop=%)',
        r.keep_name, r.drop_name, r.cc, v_keep, v_drop;
      n_skipped := n_skipped + 1;
      continue;
    end if;

    perform public.merge_cities(v_keep, v_drop);
    n_merged := n_merged + 1;

    -- merge_cities moves children but copies no scalar column. The dropped row
    -- describes the SAME city, so anything the survivor lacks is a free repair --
    -- and never an overwrite: every assignment is guarded on the target being null.
    update public.cities k set
      wikidata_qid    = case when r.transfer_qid then coalesce(k.wikidata_qid, d.wikidata_qid) else k.wikidata_qid end,
      wikipedia_title = coalesce(k.wikipedia_title, d.wikipedia_title),
      description     = coalesce(k.description,     d.description),
      population      = coalesce(k.population,      d.population),
      timezone        = coalesce(k.timezone,        d.timezone),
      region_name     = coalesce(k.region_name,     d.region_name),
      image_url       = coalesce(k.image_url,       d.image_url),
      latitude        = coalesce(k.latitude,        d.latitude),
      longitude       = coalesce(k.longitude,       d.longitude),
      updated_at      = now()
    from public.cities d
    where k.id = v_keep and d.id = v_drop
      and (k.wikidata_qid is null or k.wikipedia_title is null or k.description is null
        or k.population is null or k.timezone is null or k.region_name is null
        or k.image_url is null or k.latitude is null or k.longitude is null);

    if r.transfer_qid then
      n_qid := n_qid + 1;
    end if;
  end loop;

  raise notice 'city exonym merges: merged=% skipped=% qid_eligible=%', n_merged, n_skipped, n_qid;
end $$;
