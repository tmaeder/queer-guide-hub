-- Comma-qualified birth-place city shells: disposition of the reachable cohort.
--
-- The personality-birth-place producer minted a cities row per distinct
-- birth-place string, e.g. "Loschwitz, Dresden", "Kapstadt, Südafrika",
-- "Gleiwitz, Oberschlesien". 304 such rows were live placeholders (no venues,
-- no events, deindexed, but present in site search). Their qualifiers are
-- German Landkreise, historic provinces and parent cities, which
-- geo_split_place_name() recognises for only 49 of them, so the name-split
-- trigger never reached them. This file disposes of 214, each classified BY
-- HAND (list below, one row per shell):
--
--   D  district/locality of an existing city  -> repoint people, archive shell
--   T  the same place as an existing city row (exonym, qualifier, twin)
--                                              -> repoint people, archive shell
--   R  a real town with no row of its own      -> rename in place to the bare
--      name (endonym for the German exonyms of Polish/Russian towns), fill
--      region_name / country_id, keep the old string as a city_aliases row
--   X  not a settlement at all                 -> archive, NULL the city link
--
-- Rules that keep this safe:
--   * Targets are resolved at APPLY time by name within the target country. A
--     live row wins; a merged row resolves to its terminal survivor (e.g.
--     "New York City" -> "New York"). An R row whose target name already
--     exists is handled as T, never as a second row with the same name.
--   * A D/T target that cannot be resolved is SKIPPED, not guessed.
--   * Nothing is merged: a district merged into its parent grows
--     place_merge_name_signals().merged_uncorroborated, and these tmp- shells
--     carry no slug worth redirecting. Archiving is reversible
--     (unarchive_city).
--   * personalities.birth_place / death_place TEXT is never written.
--   * trg_personalities_auto_approve rewrites review_status on a city_id
--     change; the prior value is restored.
--   * A rename that trips a unique index (canonical_key, name+country) is
--     caught per row and skipped.
--
-- Deliberately NOT in the list (~89 rows), each needing evidence this pass
-- does not have: villages whose parent is ambiguous or absent from cities
-- (Birkholz, Breitenstein, Kelz, Heiersdorf, ...), exonyms whose endonym is
-- uncertain (Luschitz, Mürau, Schachwitz, Seifen), parent cities missing from
-- the table (Viersen, Annaberg-Buchholz, Sebnitz, Bielsko-Biała), US rows
-- whose bare name is a different place hundreds of km away (Dearborn, Hudson,
-- Norwalk, Sandusky -- the Schwerin rule), "Hickory, North Carolina" which is a
-- merge survivor carrying content, and "Saint-Denis, Île-de-France" whose
-- name collides with the Réunion row.

do $fix$
declare
  v_list constant text := $list$
Avellaneda, Argentinien|AR|T|Avellaneda|AR
Gálvez, Santa Fe, Argentinien|AR|R|Gálvez|AR|Santa Fe
La Falda, Córdoba, Argentinien|AR|T|La Falda|AR
Tucumán, Argentinien|AR|T|Tucumán|AR
Amstetten, Niederösterreich|AT|T|Amstetten|AT
Fischamend, Wien|AT|R|Fischamend|AT|Lower Austria
Lauterach, Vorarlberg|AT|R|Lauterach|AT|Vorarlberg
Mondsee, Salzkammergut|AT|R|Mondsee|AT|Upper Austria
Sankt Florian, Linz|AT|R|Sankt Florian|AT|Upper Austria
Camden, Australia|AU|T|Camden|AU
Antwerp, Flanders|BE|T|Antwerp|BE
City of Brussels, Brussels|BE|T|Brussels|BE
Ghent, Flanders|BE|T|Ghent|BE
Liège, Wallonia|BE|T|Liège|BE
Mons, Wallonia|BE|T|Mons|BE
Mouscron, Wallonia|BE|T|Mouscron|BE
Zele, Flandern|BE|T|Zele|BE
Brighouse, United Kingdom|CA|R|Brighouse|GB|West Yorkshire
South London, United Kingdom|CA|D|London|GB
Entre Ríos, Argentina|CL|X
Hongtongying, Peking, China|CN|D|Beijing|CN
Rugao, Jiangsu|CN|R|Rugao|CN|Jiangsu
Shenyang, Liaoning, China|CN|T|Shenyang|CN
El Dovio, Valle del Cauca, Kolumbien|CO|R|El Dovio|CO|Valle del Cauca
Villavicencio, Kolumbien|CO|T|Villavicencio|CO
Mindelo, São Vicente|CV|R|Mindelo|CV|São Vicente
Podersam, Saaz|CZ|R|Podbořany|CZ|Ústí nad Labem Region
Arnstadt, Thüringen|DE|R|Arnstadt|DE|Thuringia
Battenberg, Eder|DE|R|Battenberg|DE|Hesse
Bierstadt, Wiesbaden|DE|D|Wiesbaden|DE
Blomberg, Lippe|DE|R|Blomberg|DE|North Rhine-Westphalia
Brackwede, Bielefeld|DE|D|Bielefeld|DE
Brambauer, Dortmund|DE|D|Lünen|DE
Bredstedt, Husum|DE|R|Bredstedt|DE|Schleswig-Holstein
Brüel, Mecklenburg|DE|R|Brüel|DE|Mecklenburg-Vorpommern
Brünninghausen, Dortmund|DE|D|Dortmund|DE
Buer, Gelsenkirchen|DE|D|Gelsenkirchen|DE
Burg, Magdeburg|DE|T|Burg|DE
Dassow, Mecklenburg|DE|R|Dassow|DE|Mecklenburg-Vorpommern
Demmin, Vorpommern|DE|R|Demmin|DE|Mecklenburg-Vorpommern
Dielheim, Heidelberg|DE|R|Dielheim|DE|Baden-Württemberg
Dinklage, Vechta|DE|R|Dinklage|DE|Lower Saxony
Einbeck, Hildesheim|DE|R|Einbeck|DE|Lower Saxony
Eitelsbach, heute Trier|DE|D|Trier|DE
Frankenberg, Chemnitz|DE|R|Frankenberg|DE|Saxony
Friedberg, Hessen|DE|R|Friedberg|DE|Hesse
Gehofen, Thüringen|DE|R|Gehofen|DE|Thuringia
Greiz, Vogtland|DE|R|Greiz|DE|Thuringia
Groß Wittensee, Eckernförde|DE|R|Groß Wittensee|DE|Schleswig-Holstein
Grosselfingen, Hohenzollern|DE|R|Grosselfingen|DE|Baden-Württemberg
Hamborn, Duisburg|DE|D|Duisburg|DE
Hamme, Bochum|DE|D|Bochum|DE
Hennstedt, Dithmarschen|DE|R|Hennstedt|DE|Schleswig-Holstein
Heppens, Wilhelmshaven|DE|D|Wilhelmshaven|DE
Höhscheid, Rheinland|DE|D|Solingen|DE
Horneburg, Stade|DE|R|Horneburg|DE|Lower Saxony
Hötensleben, Neuhaldensleben|DE|R|Hötensleben|DE|Saxony-Anhalt
Klingenmünster, Bergzabern|DE|R|Klingenmünster|DE|Rhineland-Palatinate
Kröpelin, Rostock|DE|R|Kröpelin|DE|Mecklenburg-Vorpommern
Ladenburg, Mannheim|DE|R|Ladenburg|DE|Baden-Württemberg
Laer, Bochum|DE|D|Bochum|DE
Lehe, Bremerhaven|DE|D|Bremerhaven|DE
Lehesten, Thüringen|DE|R|Lehesten|DE|Thuringia
Loschwitz, Dresden|DE|D|Dresden|DE
Lüttringhausen, Remscheid|DE|D|Remscheid|DE
Meerane, Chemnitz|DE|R|Meerane|DE|Saxony
Neheim-Hüsten, Arnsberg|DE|D|Arnsberg|DE
Parchim, Mecklenburg|DE|R|Parchim|DE|Mecklenburg-Vorpommern
Polch, Mayen|DE|T|Polch|DE
Rehau, Hof|DE|R|Rehau|DE|Bavaria
Remscheid, Deutschland|DE|T|Remscheid|DE
Riemke, Bochum|DE|D|Bochum|DE
Röbel, Müritz|DE|R|Röbel|DE|Mecklenburg-Vorpommern
Rubitz, Gera|DE|D|Gera|DE
Schlepzig, Spreewald|DE|R|Schlepzig|DE|Brandenburg
Schloss Nymphenburg, München|DE|D|Munich|DE
Stötteritz, Leipzig|DE|D|Leipzig|DE
Tostedt, Harburg|DE|R|Tostedt|DE|Lower Saxony
Trausnitz, Oberpfalz|DE|R|Trausnitz|DE|Bavaria
Völpke, Magdeburg|DE|R|Völpke|DE|Saxony-Anhalt
Waldenburg, Zwickau|DE|R|Waldenburg|DE|Saxony
Wasungen, Meiningen|DE|R|Wasungen|DE|Thuringia
Westerfeld, heute Aurich|DE|D|Aurich|DE
Wiescherhöfen, Hamm|DE|D|Hamm|DE
Woldegk, Neubrandenburg|DE|R|Woldegk|DE|Mecklenburg-Vorpommern
Wolgast, Vorpommern|DE|R|Wolgast|DE|Mecklenburg-Vorpommern
Wolgast, Pommern|DE|T|Wolgast|DE
Wusterhausen, Dosse|DE|R|Wusterhausen|DE|Brandenburg
Zörbig, Bitterfeld|DE|R|Zörbig|DE|Saxony-Anhalt
Algier, Algerien|DZ|T|Algiers|DZ
Badajoz, Extremadura|ES|T|Badajoz|ES
City of Brussels, Belgium|ES|T|Brussels|BE
Sanlúcar de Barrameda, Andalusien|ES|T|Sanlúcar de Barrameda|ES
Castres, Tarn|FR|R|Castres|FR|Occitanie
Condom, Gers|FR|R|Condom|FR|Occitanie
Perpignan, Occitanie|FR|T|Perpignan|FR
Straßburg, Elsaß|FR|T|Strasbourg|FR
Aldershot, Hampshire, England|GB|T|Aldershot|GB
Ayr, Schottland|GB|T|Ayr|GB
Bettws, Bridgend|GB|R|Bettws|GB|Wales
Blackburn, Lancashire|GB|R|Blackburn|GB|Lancashire
Bodmin, Cornwall|GB|R|Bodmin|GB|Cornwall
Brooksby, Leicestershire|GB|R|Brooksby|GB|Leicestershire
Clevedon, Somerset|GB|R|Clevedon|GB|Somerset
Eccles, Greater Manchester|GB|R|Eccles|GB|Greater Manchester
Enfield, London|GB|D|London|GB
Farnborough, Kent|GB|D|London|GB
Farnham, Surrey|GB|R|Farnham|GB|Surrey
Harrow, London|GB|D|London|GB
Herne Hill, London|GB|D|London|GB
Lanchester, County Durham|GB|R|Lanchester|GB|County Durham
Maida Vale, London|GB|D|London|GB
Maltby, South Yorkshire|GB|R|Maltby|GB|South Yorkshire
Powick, Worcestershire, England|GB|R|Powick|GB|Worcestershire
Rothesay, Scotland|GB|T|Rothesay|GB
Royal Tunbridge Wells, England|GB|T|Royal Tunbridge Wells|GB
Stansted Mountfitchet, Essex|GB|R|Stansted Mountfitchet|GB|Essex
Stratford, Essex|GB|D|London|GB
Teddington, London|GB|D|London|GB
Tonnerre, Frankreich|GB|R|Tonnerre|FR|Bourgogne-Franche-Comté
Uxbridge, London|GB|D|London|GB
Tiflis, Georgien|GE|T|Tbilisi|GE
Chalkida, Euböa|GR|R|Chalkida|GR|Central Greece
Kowloon, Hongkong|HK|D|Hong Kong|HK
Újpest, Budapest|HU|D|Budapest|HU
Pasuruan, Ostjava, Indonesien|ID|R|Pasuruan|ID|East Java
Ballymun, Dublin|IE|D|Dublin|IE
Drogheda, County Louth|IE|R|Drogheda|IE|County Louth
Tallaght, Dublin|IE|D|Dublin|IE
Barrackpore, Westbengalen, Indien|IN|R|Barrackpore|IN|West Bengal
Bhilai, Chhattisgarh|IN|R|Bhilai|IN|Chhattisgarh
Raigarh, Chhattisgarh|IN|R|Raigarh|IN|Chhattisgarh
Cagliari, Sardinia|IT|R|Cagliari|IT|Sardinia
Corato, Apulia|IT|R|Corato|IT|Apulia
Lecce, Apulia|IT|R|Lecce|IT|Apulia
Mortara, Lombardei|IT|R|Mortara|IT|Lombardy
Riesi, Sizilien|IT|R|Riesi|IT|Sicily
Tropea, Calabria|IT|R|Tropea|IT|Calabria
Misawa, Aomori|JP|R|Misawa|JP|Aomori
Tama, Tokyo|JP|R|Tama|JP|Tokyo
Cheongyang, Südkorea|KR|R|Cheongyang|KR
Seongnam, Südkorea|KR|R|Seongnam|KR|Gyeonggi
Mohammedia, Marokko|MA|R|Mohammedia|MA
Coyoacán, Mexiko-Stadt, Mexiko|MX|D|Mexico City|MX
Umuahia, Abia, Nigeria|NG|R|Umuahia|NG|Abia
Hilversum, Noord-Holland|NL|T|Hilversum|NL
Urk, Flevoland|NL|R|Urk|NL|Flevoland
Fana, Bergen|NO|D|Bergen|NO
Rotorua, Neuseeland|NZ|T|Rotorua|NZ
Angeles, Pampanga|PH|R|Angeles|PH|Pampanga
Bolinao, Pangasinan|PH|R|Bolinao|PH|Pangasinan
Cabanatuan, Nueva Ecija|PH|R|Cabanatuan|PH|Nueva Ecija
Cabuyao, Laguna, Philippinen|PH|R|Cabuyao|PH|Laguna
Cagayan de Oro, Misamis Oriental|PH|R|Cagayan de Oro|PH|Misamis Oriental
Cainta, Rizal|PH|R|Cainta|PH|Rizal
Daet, Camarines Norte|PH|R|Daet|PH|Camarines Norte
Rosario, Cavite|PH|R|Rosario|PH|Cavite
San Pedro, Laguna|PH|R|San Pedro|PH|Laguna
Santa Maria, Ilocos Sur|PH|R|Santa Maria|PH|Ilocos Sur
Tayabas, Quezon|PH|R|Tayabas|PH|Quezon
Toledo, Cebu|PH|R|Toledo|PH|Cebu
Vigan, Ilocos Sur|PH|R|Vigan|PH|Ilocos Sur
Allenstein, Ostpreußen|PL|R|Olsztyn|PL|Warmian-Masurian
Beuthen, Oberschlesien|PL|R|Bytom|PL|Silesian
Gleiwitz, Oberschlesien|PL|R|Gliwice|PL|Silesian
Groß-Strehlitz, Oberschlesien|PL|R|Strzelce Opolskie|PL|Opole
Heilsberg, Ostpreußen|PL|R|Lidzbark Warmiński|PL|Warmian-Masurian
Kattowitz, Schlesien|PL|R|Katowice|PL|Silesian
Liebau, Schlesien|PL|R|Lubawka|PL|Lower Silesian
Marienburg, Westpreußen|PL|R|Malbork|PL|Pomeranian
Myslowice, Silesian Voivodeship|PL|R|Mysłowice|PL|Silesian
Neidenburg, Ostpreußen|PL|R|Nidzica|PL|Warmian-Masurian
Neustadt, Oberschlesien|PL|R|Prudnik|PL|Opole
Nimptsch, Reichenbach|PL|R|Niemcza|PL|Lower Silesian
Pölitz, Pommern|PL|R|Police|PL|West Pomeranian
Polzin, Belgard|PL|R|Połczyn-Zdrój|PL|West Pomeranian
Saarau, Schweidnitz|PL|R|Żarów|PL|Lower Silesian
Sagan, Schlesien|PL|R|Żagań|PL|Lubusz
Sorau, Lausitz|PL|R|Żary|PL|Lubusz
Stolp, Pommern|PL|R|Słupsk|PL|Pomeranian
Waldenburg, Schlesien|PL|R|Wałbrzych|PL|Lower Silesian
Wollin, Pommern|PL|R|Wolin|PL|West Pomeranian
Carolina, Puerto Rico|PR|R|Carolina|PR
Cayey, Puerto Rico|PR|R|Cayey|PR
Ribeira Grande, Azoren|PT|T|Ribeira Grande|PT
Grosny, Tschetschenien|RU|R|Grozny|RU|Chechnya
Königsberg, Ostpreußen|RU|T|Königsberg|RU
Stallupönen, Ostpreußen|RU|R|Nesterov|RU|Kaliningrad Oblast
Tilsit, Ostpreußen|RU|R|Sovetsk|RU|Kaliningrad Oblast
Toljatti, Samara|RU|R|Tolyatti|RU|Samara Oblast
Wotkinsk, Gouv. Wjatka|RU|R|Votkinsk|RU|Udmurtia
Helsingborg, Skåne County|SE|T|Helsingborg|SE
Linköping, Östergötland County|SE|T|Linköping|SE
Mora, Dalarna County|SE|R|Mora|SE|Dalarna County
Södermalm, Stockholm|SE|D|Stockholm|SE
Ulricehamn, Västra Götaland|SE|R|Ulricehamn|SE|Västra Götaland County
Värnamo, Jönköping County|SE|R|Värnamo|SE|Jönköping County
Imus, Philippines|TH|R|Imus|PH|Cavite
Fongshan, Kaohsiung|TW|D|Kaohsiung|TW
Kiew, Russisches Reich|UA|T|Kyiv|UA
Bronx, New York City, USA|US|D|New York|US
El Cajon, Kalifornien, USA|US|R|El Cajon|US|California
Flint, Michigan, USA|US|T|Flint|US
Lewiston, Maine, USA|US|T|Lewiston|US
Liberty City, Miami|US|D|Miami|US
Queens, New York City, USA|US|T|Queens|US
Whittier, Kalifornien, USA|US|T|Whittier|US
Yonkers, New York, USA|US|T|Yonkers|US
Salinas, Canelones|UY|R|Salinas|UY|Canelones
Kapstadt, Südafrika|ZA|T|Cape Town|ZA
Langa, Kapstadt, Südafrika|ZA|D|Cape Town|ZA
Orlando West, Soweto, Südafrika|ZA|D|Johannesburg|ZA
Umlazi, Durban|ZA|D|Durban|ZA
Vrededorp, Johannesburg, Südafrika|ZA|D|Johannesburg|ZA
$list$;
  r          record;
  v_shell    public.cities%rowtype;
  v_tcountry uuid;
  v_target   uuid;
  v_hops     int;
  v_person   record;
  v_res      jsonb;
  v_head     text;
  n_renamed  int := 0;
  n_archived int := 0;
  n_skipped  int := 0;
begin
  perform set_config('app.actor', 'migration:99991791574485_city_birthplace_comma_shells_disposition', true);

  -- R rows first, so a later T row (Wolgast, Pommern) can resolve to the renamed one.
  for r in
    select split_part(l, '|', 1) shell_name, split_part(l, '|', 2) shell_cc,
           split_part(l, '|', 3) action, nullif(split_part(l, '|', 4), '') target,
           nullif(split_part(l, '|', 5), '') target_cc, nullif(split_part(l, '|', 6), '') region
      from unnest(string_to_array(btrim(v_list, E'\n'), E'\n')) l
     order by (split_part(l, '|', 3) = 'R') desc
  loop
    select c.* into v_shell
      from public.cities c join public.countries co on co.id = c.country_id
     where c.name = r.shell_name and co.code = r.shell_cc
       and c.duplicate_of_id is null
       and c.data_source = 'personality-birth-place'
       and coalesce(c.shell_status::text, 'real') not in ('ghost', 'merged');
    if not found then
      n_skipped := n_skipped + 1;
      raise notice 'skip (shell gone or already disposed): %', r.shell_name;
      continue;
    end if;

    v_target := null;
    if r.action <> 'X' then
      select id into v_tcountry from public.countries where code = r.target_cc;

      select c.id into v_target from public.cities c
       where c.country_id = v_tcountry and lower(c.name) = lower(r.target)
         and c.duplicate_of_id is null and c.id <> v_shell.id
       limit 1;

      if v_target is null then
        select c.duplicate_of_id into v_target from public.cities c
         where c.country_id = v_tcountry and lower(c.name) = lower(r.target)
           and c.duplicate_of_id is not null and c.id <> v_shell.id
         limit 1;
        v_hops := 0;
        while v_target is not null and v_hops < 10 loop
          exit when (select duplicate_of_id from public.cities where id = v_target) is null;
          select duplicate_of_id into v_target from public.cities where id = v_target;
          v_hops := v_hops + 1;
        end loop;
      end if;
    end if;

    if r.action = 'R' and v_target is null then
      begin
        update public.cities set
          name = r.target,
          country_id = v_tcountry,
          region_name = coalesce(region_name, r.region),
          field_provenance = coalesce(field_provenance, '{}'::jsonb) || jsonb_build_object('name',
            jsonb_build_object('value', r.target, 'source', 'migration:99991791574485',
                               'original', v_shell.name, 'method', 'hand_classified_birthplace_shell'))
        where id = v_shell.id;
      exception when unique_violation then
        n_skipped := n_skipped + 1;
        raise notice 'skip (rename collides): % -> %', r.shell_name, r.target;
        continue;
      end;
      v_head := btrim(split_part(v_shell.name, ',', 1));
      if lower(v_head) <> lower(r.target) and not exists (
           select 1 from public.city_aliases a where a.city_id = v_shell.id and lower(a.alias) = lower(v_head)) then
        insert into public.city_aliases (city_id, alias) values (v_shell.id, v_head) on conflict do nothing;
      end if;
      n_renamed := n_renamed + 1;
      continue;
    end if;

    if r.action in ('D', 'T', 'R') and v_target is null then
      n_skipped := n_skipped + 1;
      raise notice 'skip (target not found): % -> %/%', r.shell_name, r.target, r.target_cc;
      continue;
    end if;

    if r.action = 'X' then
      -- Not a settlement: there is no city to point at. NULL is honest; the
      -- birth_place / death_place text still says where.
      update public.personalities set city_id = null where city_id = v_shell.id;
      update public.personalities set death_city_id = null where death_city_id = v_shell.id;
    end if;

    if v_target is not null then
      for v_person in
        select id, review_status from public.personalities where city_id = v_shell.id
      loop
        update public.personalities set city_id = v_target where id = v_person.id;
        update public.personalities set review_status = v_person.review_status
         where id = v_person.id and review_status is distinct from v_person.review_status;
      end loop;
      update public.personalities set death_city_id = v_target where death_city_id = v_shell.id;

      if r.action in ('T', 'R') then
        v_head := btrim(split_part(v_shell.name, ',', 1));
        if lower(v_head) <> lower(r.target) and not exists (
             select 1 from public.city_aliases a where a.city_id = v_target and lower(a.alias) = lower(v_head)) then
          insert into public.city_aliases (city_id, alias) values (v_target, v_head) on conflict do nothing;
        end if;
      end if;
    end if;

    v_res := public.archive_city_as_nonplace(
      v_shell.id,
      case r.action when 'D' then 'district_of_existing_city'
                    when 'X' then 'not_a_settlement'
                    else 'duplicate_of_existing_city' end,
      jsonb_build_object('original_name', v_shell.name, 'resolved_to', v_target,
                         'by', 'migration:99991791574485'));
    if coalesce((v_res->>'ok')::boolean, false) is not true then
      n_skipped := n_skipped + 1;
      raise notice 'skip (archive refused): % %', r.shell_name, v_res;
      continue;
    end if;
    n_archived := n_archived + 1;
  end loop;

  raise notice 'birth-place comma shells: renamed %, archived %, skipped %', n_renamed, n_archived, n_skipped;
end
$fix$;

do $verify$
declare
  v_bad int;
begin
  -- P1: no personality points at a shell this pass archived.
  select count(*) into v_bad
    from public.personalities p join public.cities c on c.id in (p.city_id, p.death_city_id)
   where c.enrichment_status->'disposition'->'signals'->>'by' = 'migration:99991791574485';
  if v_bad <> 0 then
    raise exception 'P1 failed: % personalities still point at an archived birth-place shell', v_bad;
  end if;

  -- P2: every renamed row lost its comma qualifier and is still live.
  select count(*) into v_bad from public.cities c
   where c.field_provenance->'name'->>'source' = 'migration:99991791574485'
     and (c.name like '%,%' or c.duplicate_of_id is not null);
  if v_bad <> 0 then
    raise exception 'P2 failed: % renamed rows still carry a qualifier or were merged', v_bad;
  end if;

  -- P3: archived shells really are ghosts.
  select count(*) into v_bad from public.cities c
   where c.enrichment_status->'disposition'->'signals'->>'by' = 'migration:99991791574485'
     and c.shell_status is distinct from 'ghost';
  if v_bad <> 0 then
    raise exception 'P3 failed: % archived shells are not ghost', v_bad;
  end if;
end
$verify$;
