-- Comma-qualified birth-place city shells: the remainder.
--
-- Follow-up to 99991791574485 (214 rows) and 99991791574887 (Eidelstedt).
-- Same mechanism, same safety rules (see that file's header); 82 more rows,
-- each classified BY HAND:
--
--   D  district of an existing city            -> repoint people, archive shell
--   R  real place with no row of its own       -> rename in place; for a
--      district whose parent city has no row (Dülken/Süchteln -> Viersen,
--      Frohnau -> Annaberg-Buchholz, Kamitz -> Bielsko-Biała) the shell is
--      renamed to the PARENT, so it becomes that city's row. Two shells with
--      the same target (Dülken + Süchteln, the two Selischtschi rows): the
--      first is renamed, the second resolves to it and is archived.
--   U  locality this pass cannot identify with confidence (ambiguous village
--      names, exonyms whose current name is uncertain) -> archive and NULL the
--      city link. Nothing is guessed; birth_place text still says where, the
--      archived row keeps its name and unarchive_city() reverses it.
--
-- Not in this list (6): "Saint-Denis, Île-de-France", "Dearborn, Michigan",
-- "Hudson, Wisconsin", "Norwalk, California", "Sandusky, Ohio" and
-- "Hickory, North Carolina". They are real, correctly located cities whose
-- bare name is held in the same country by a different place; they are
-- renamed by 99991791576204, which relies on region_code being part of the
-- name-uniqueness indexes.

do $fix$
declare
  v_list constant text := $list$
Gleis, Steiermark|AT|U
Möderbrugg, Steiermark|AT|R|Möderbrugg|AT|Styria
Luschitz, Böhmen|CZ|U
Mürau, Böhmen|CZ|U
Schachwitz, Kaaden|CZ|U
Birkholz, Beeskow-Storkow|DE|R|Birkholz|DE|Brandenburg
Böhl, Ludwigshafen|DE|R|Böhl-Iggelheim|DE|Rhineland-Palatinate
Breitenhagen, Calbe|DE|R|Breitenhagen|DE|Saxony-Anhalt
Breitenstein, Südharz|DE|R|Breitenstein|DE|Saxony-Anhalt
Brohl, Ahrweiler|DE|R|Brohl-Lützing|DE|Rhineland-Palatinate
Broistedt, Wolfenbüttel|DE|R|Broistedt|DE|Lower Saxony
Brüssow, Greifswald|DE|U
Buer, Westfalen|DE|D|Gelsenkirchen|DE
Bürg, Mühldorf|DE|U
Dietrichshof, Sieg|DE|U
Dülken, Rheinland|DE|R|Viersen|DE|North Rhine-Westphalia
Süchteln, Krefeld|DE|R|Viersen|DE|North Rhine-Westphalia
Esborn, Westfalen|DE|R|Wetter (Ruhr)|DE|North Rhine-Westphalia
Fahm, Hamborn|DE|U
Frohnau, Erzgebirge|DE|R|Annaberg-Buchholz|DE|Saxony
Gaislautern, Saarbrücken|DE|R|Völklingen|DE|Saarland
Genna, Westfalen|DE|R|Iserlohn|DE|North Rhine-Westphalia
Göppersdorf, Burgstädt|DE|R|Burgstädt|DE|Saxony
Groß Salze, Calbe|DE|R|Schönebeck|DE|Saxony-Anhalt
Großflintek, Kiel|DE|R|Flintbek|DE|Schleswig-Holstein
Heiersdorf, Burgstädt|DE|U
Helstorf, Neustadt|DE|R|Neustadt am Rübenberge|DE|Lower Saxony
Heppendorf, Bergheim|DE|R|Elsdorf|DE|North Rhine-Westphalia
Hinterhermsdorf, Sebnitz|DE|R|Sebnitz|DE|Saxony
Hollerdeich, Kehdingen|DE|U
Kelz, Düren|DE|R|Vettweiß|DE|North Rhine-Westphalia
Klein Köthel, Malchin|DE|U
Klein-Zimmern, Darmstadt|DE|R|Groß-Zimmern|DE|Hesse
Klewitz, Kreis Königsberg|DE|U
Klöden, Schweinitz|DE|R|Jessen|DE|Saxony-Anhalt
Klosterdorf, Oberbarnim|DE|R|Klosterdorf|DE|Brandenburg
Kuhblank, Wittenberge|DE|U
Kußow, Güstrow|DE|U
Ober-Neudorf, Plauen|DE|U
Rechenberg, Dippoldiswalde|DE|R|Rechenberg-Bienenmühle|DE|Saxony
Rothkreuz, Allgäu|DE|U
Seifen, Böhmen|DE|U
Siestedt, Gardelegen|DE|U
Strunden, Köln|DE|U
Sulzbach, Bayern|DE|R|Sulzbach-Rosenberg|DE|Bavaria
Sülze, Niedersachsen|DE|U
Vippach, Weimar|DE|U
Weinfeld, Landkreis Roth|DE|U
Les Issers, Kabylie|DZ|R|Issers|DZ|Boumerdès
Villamayor, Asturien, Spanien|ES|R|Villamayor|ES|Asturias
Nieder Jeutz, Lothringen|FR|R|Yutz|FR|Grand Est
Apley Hall, Shropshire|GB|R|Bridgnorth|GB|Shropshire
Knole, Kent, England|GB|R|Sevenoaks|GB|Kent
Vale of Leven, Dunbartonshire|GB|R|Alexandria|GB|West Dunbartonshire
Wilsford cum Lake, Wiltshire|GB|R|Wilsford cum Lake|GB|Wiltshire
Sergoit, Elgeyo-Marakwet|KE|R|Sergoit|KE|Elgeyo-Marakwet
Bielwiese, Steinau an der Oder|PL|U
Friedenswalde, Posen|PL|U
Friedenthal, Neiße|PL|U
Frögenau, Ostpreußen|PL|R|Frygnowo|PL|Warmian-Masurian
Gontkowitz, Schlesien|PL|U
Groß-Möllen, Köslin|PL|R|Mielno|PL|West Pomeranian
Heidau, Ohlau, Schlesien|PL|U
Kamitz, Bielitz|PL|R|Bielsko-Biała|PL|Silesian
Klein Reetz, Stolp|PL|U
Klemenswalde, Ostpreußen|PL|U
Költschen, Ost-Sternberg|PL|U
Lampersdorf, Niederschlesien|PL|U
Mallwitz, Niederschlesien|PL|R|Małomice|PL|Lubusz
Piske, Meseritz|PL|U
Rackwitz, Posen|PL|R|Rakoniewice|PL|Greater Poland
Sandberg, Gostyn|PL|U
Stanischewo, Karthaus|PL|R|Staniszewo|PL|Pomeranian
Walddorf, Niederschlesien|PL|U
Kraußen, Königsberg|RU|U
Mingstimehlen, Ostpreußen|RU|U
Selischtschi, Region Nowgorod|RU|R|Selishchi|RU|Novgorod Oblast
Selischtschi, Nowgorod|RU|R|Selishchi|RU|Novgorod Oblast
Snöstorp, Halland|SE|R|Snöstorp|SE|Halland County
Västra Ryd, Upplands-Bro|SE|R|Västra Ryd|SE|Stockholm County
Lukowica, Slowenien|SI|R|Lukovica|SI|Central Slovenia
Nakawala, Mukono, Uganda|UG|R|Nakawala|UG|Mukono District
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
  perform set_config('app.actor', 'migration:99991791575840_city_birthplace_comma_shells_remainder', true);

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
    if r.action not in ('X', 'U') then
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
            jsonb_build_object('value', r.target, 'source', 'migration:99991791575840',
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

    if r.action in ('X', 'U') then
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
                    when 'U' then 'unverified_locality'
                    else 'duplicate_of_existing_city' end,
      jsonb_build_object('original_name', v_shell.name, 'resolved_to', v_target,
                         'by', 'migration:99991791575840'));
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
   where c.enrichment_status->'disposition'->'signals'->>'by' = 'migration:99991791575840';
  if v_bad <> 0 then
    raise exception 'P1 failed: % personalities still point at an archived birth-place shell', v_bad;
  end if;

  -- P2: every renamed row lost its comma qualifier and is still live.
  select count(*) into v_bad from public.cities c
   where c.field_provenance->'name'->>'source' = 'migration:99991791575840'
     and (c.name like '%,%' or c.duplicate_of_id is not null);
  if v_bad <> 0 then
    raise exception 'P2 failed: % renamed rows still carry a qualifier or were merged', v_bad;
  end if;

  -- P3: archived shells really are ghosts.
  select count(*) into v_bad from public.cities c
   where c.enrichment_status->'disposition'->'signals'->>'by' = 'migration:99991791575840'
     and c.shell_status is distinct from 'ghost';
  if v_bad <> 0 then
    raise exception 'P3 failed: % archived shells are not ghost', v_bad;
  end if;
end
$verify$;
