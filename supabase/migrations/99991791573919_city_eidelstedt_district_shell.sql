-- "Eidelstedt, Altona" is a Hamburg district, not a city.
--
-- cities a6831b16-… was minted by the personality-birth-place producer from the
-- free-text birth place of one personality (Heinrich Friedrich Ferdinand Bauer,
-- birth_place "Eidelstedt, Altona (DE)"). No QID, no coordinates, 0 venues,
-- 0 events, shell_status 'placeholder' -- and therefore live in site search as a
-- city card. Eidelstedt was a village in Kreis Pinneberg in 1902, part of Altona
-- from 1927 and of Hamburg from 1937; today it sits in Bezirk Eimsbüttel.
--
-- Its three siblings ("Hamburg-Altona", "Altona, Hamburg", "Altona-Ottensen,
-- Hamburg") were merged into Hamburg earlier. This one is NOT merged on purpose:
-- a district merged into its parent is exactly what
-- place_merge_name_signals().merged_uncorroborated counts (fails on growth), and
-- a district was never a city. Instead:
--   1. the personality's birth city is pointed at Hamburg; birth_place TEXT is
--      left untouched (it is the only readable record of where he was born);
--   2. the shell is archived via archive_city_as_nonplace -> shell_status
--      'ghost', which the city search indexer excludes; reversible with
--      unarchive_city().
--
-- trg_personalities_auto_approve rewrites review_status to 'approved' on any
-- city_id change. That is a review decision this repair must not make, so the
-- prior review_status is restored in a second statement.

do $fix$
declare
  v_shell   constant uuid := 'a6831b16-85b3-47eb-abf4-b822dc724e89';
  v_hamburg uuid;
  v_person  record;
  v_res     jsonb;
begin
  perform set_config('app.actor', 'migration:99991791573919_city_eidelstedt_district_shell', true);

  select id into v_hamburg
    from public.cities
   where slug = 'hamburg' and duplicate_of_id is null;
  if v_hamburg is null then
    raise notice 'Hamburg row not found; nothing to do';
    return;
  end if;

  if not exists (select 1 from public.cities where id = v_shell and duplicate_of_id is null) then
    raise notice 'Eidelstedt shell absent or already merged; nothing to do';
    return;
  end if;

  for v_person in
    select id, review_status from public.personalities where city_id = v_shell
  loop
    update public.personalities set city_id = v_hamburg where id = v_person.id;
    update public.personalities set review_status = v_person.review_status
     where id = v_person.id and review_status is distinct from v_person.review_status;
  end loop;

  update public.personalities set death_city_id = v_hamburg where death_city_id = v_shell;

  v_res := public.archive_city_as_nonplace(
    v_shell,
    'district_of_hamburg',
    jsonb_build_object('district', 'Eidelstedt', 'parent_city', 'Hamburg',
                       'by', 'migration:99991791573919'));
  if coalesce((v_res->>'ok')::boolean, false) is not true then
    raise exception 'archive_city_as_nonplace refused: %', v_res;
  end if;
end
$fix$;

do $verify$
declare
  v_shell constant uuid := 'a6831b16-85b3-47eb-abf4-b822dc724e89';
  v_bad   int;
begin
  if not exists (select 1 from public.cities where id = v_shell) then
    return;
  end if;

  select count(*) into v_bad from public.personalities
   where city_id = v_shell or death_city_id = v_shell;
  if v_bad <> 0 then
    raise exception 'P1 failed: % personalities still point at the Eidelstedt shell', v_bad;
  end if;

  select count(*) into v_bad from public.cities
   where id = v_shell and duplicate_of_id is null and shell_status is distinct from 'ghost';
  if v_bad <> 0 then
    raise exception 'P2 failed: Eidelstedt shell is not archived';
  end if;

  select count(*) into v_bad from public.personalities p
   where p.slug = 'heinrich-friedrich-ferdinand-bauer'
     and (p.birth_place is distinct from 'Eidelstedt, Altona (DE)'
          or p.city_id is distinct from (select id from public.cities where slug = 'hamburg' and duplicate_of_id is null));
  if v_bad <> 0 then
    raise exception 'P3 failed: Bauer must keep birth_place text and point at Hamburg';
  end if;
end
$verify$;
