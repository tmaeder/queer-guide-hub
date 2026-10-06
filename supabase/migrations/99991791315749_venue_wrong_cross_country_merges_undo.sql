-- Undo two venue merges that joined different businesses across countries.
--
-- Found by the Zürich duplicate audit (merges whose two sides sit in different
-- countries), each read by hand:
--
--   * "Apollo", 46 Allenby St, Tel Aviv (e615f1b9, slug apollo-5) was merged
--     into "Apollo" sauna, Seilergraben 41, Zürich (26a409ae). Two different
--     businesses sharing a name. Restored as its own live venue.
--   * "Heaven", Zürich, no address (bcb1e4cd, slug heaven-3, source
--     spartacus:heaven:zurich) was merged into "Heaven" sauna, Waliców 13,
--     WARSAW (0ded6843). Its own source says Zürich. Simply un-merging would
--     publish an empty shell beside the existing "Heaven Club", Spitalgasse 5,
--     Zürich (6bada896), so it is re-pointed there instead.
--   * "Heaven" heaven-19 (32862d33), Zürich, no address, website heavenclub.ch,
--     11 events, 8 m from Heaven Club: the same club under a third row, missed
--     by the address audit because it has no address. Merged into Heaven Club.
--
-- Neither merge has a venue_merge_audit row (both came from the April 2026
-- import path), so unmerge_venues() cannot reverse them. Checked before writing:
-- each drop still holds its own venue_sources row, and the wrong survivor holds
-- only sources for its own city and no events, so nothing was reparented and
-- clearing duplicate_of_id is the whole reversal.
--
-- The Heaven re-point goes through _venue_merge_core so it gets an audit row
-- with details.schema = 1 and stays reversible. Neither pair can be re-proposed
-- by the dedup sweep: its candidate keys never cross a country boundary.
--
-- Soft on preconditions (a row that moved since authoring is skipped with a
-- NOTICE), hard on the defect: neither drop may still point at the wrong city.

select set_config('app.actor', 'migration:99991791315749_venue_wrong_cross_country_merges_undo', true);

do $undo$
declare
  v_apollo_tlv   constant uuid := 'e615f1b9-92da-4fbe-9f31-b1fe2daab70e';
  v_apollo_zrh   constant uuid := '26a409ae-d1d0-4518-ad5e-813a3a78ba82';
  v_heaven_shell constant uuid := 'bcb1e4cd-8469-4891-97a7-2b43016c030a';
  v_heaven_waw   constant uuid := '0ded6843-8fe6-4587-9cd6-7b88ca551af7';
  v_heaven_club  constant uuid := '6bada896-6e57-4ca6-9c5b-5d819c8f540f';
  v_heaven_19    constant uuid := '32862d33-65ed-499d-bc09-a6215f65bfbb';
begin
  -- 1. Apollo Tel Aviv: restore as its own venue.
  update public.venues
     set duplicate_of_id = null, updated_at = now()
   where id = v_apollo_tlv and duplicate_of_id = v_apollo_zrh;
  if not found then
    raise notice 'skip apollo-5: no longer merged into Apollo Zürich';
  end if;

  -- 2. Heaven Zürich shell: off Warsaw, onto Heaven Club Zürich.
  if exists (select 1 from public.venues where id = v_heaven_shell and duplicate_of_id = v_heaven_waw)
     and exists (select 1 from public.venues where id = v_heaven_club
                   and duplicate_of_id is null and closed_at is null) then
    update public.venues
       set duplicate_of_id = null, updated_at = now()
     where id = v_heaven_shell;
    perform public._venue_merge_core(v_heaven_club, v_heaven_shell, null);
  else
    raise notice 'skip heaven-3: not merged into Warsaw anymore, or Heaven Club not live';
  end if;

  -- 3. "Heaven" heaven-19 (32862d33): the same club, 8 m from Heaven Club,
  --    website heavenclub.ch, 11 events, no address (which is why the
  --    address audit missed it). Take its own-domain website first (the merge
  --    core copies no fields), replacing an empty one or a display-magazin.ch
  --    listing page, which is a directory entry rather than the club's site.
  if exists (select 1 from public.venues where id = v_heaven_19
               and duplicate_of_id is null and closed_at is null
               and city_id = '35d1d772-8ce7-4c05-92a5-95ea7053b4bf')
     and exists (select 1 from public.venues where id = v_heaven_club
                   and duplicate_of_id is null and closed_at is null) then
    update public.venues k
       set website = d.website, updated_at = now()
      from public.venues d
     where k.id = v_heaven_club and d.id = v_heaven_19
       and (nullif(btrim(k.website), '') is null or k.website ilike '%display-magazin.ch%')
       and nullif(btrim(d.website), '') is not null
       and d.website not ilike '%display-magazin.ch%';
    perform public._venue_merge_core(v_heaven_club, v_heaven_19, null);
  else
    raise notice 'skip heaven-19: already merged, closed, moved, or Heaven Club not live';
  end if;
end
$undo$;

do $verify$
declare
  v_bad int;
begin
  -- P1: neither drop still points at the wrong-country survivor.
  select count(*) into v_bad
    from public.venues
   where (id = 'e615f1b9-92da-4fbe-9f31-b1fe2daab70e' and duplicate_of_id = '26a409ae-d1d0-4518-ad5e-813a3a78ba82')
      or (id = 'bcb1e4cd-8469-4891-97a7-2b43016c030a' and duplicate_of_id = '0ded6843-8fe6-4587-9cd6-7b88ca551af7');
  if v_bad <> 0 then
    raise exception 'P1 failed: % wrong cross-country merge(s) still in place', v_bad;
  end if;

  -- P2: if the Heaven shell is merged into Heaven Club, that merge is reversible.
  select count(*) into v_bad
    from public.venues d
   where d.id = 'bcb1e4cd-8469-4891-97a7-2b43016c030a'
     and d.duplicate_of_id = '6bada896-6e57-4ca6-9c5b-5d819c8f540f'
     and not exists (
       select 1 from public.venue_merge_audit a
        where a.keep_id = '6bada896-6e57-4ca6-9c5b-5d819c8f540f'
          and a.drop_id = d.id
          and a.undone_at is null
          and a.details ->> 'schema' = '1');
  if v_bad <> 0 then
    raise exception 'P2 failed: heaven-3 merged into Heaven Club without a reversible audit row';
  end if;

  -- P3: heaven-19 and Heaven Club are not both live side by side, and if
  --     merged, the merge is reversible and its events moved.
  select count(*) into v_bad
    from public.venues a, public.venues b
   where a.id = '32862d33-65ed-499d-bc09-a6215f65bfbb'
     and b.id = '6bada896-6e57-4ca6-9c5b-5d819c8f540f'
     and a.duplicate_of_id is null and b.duplicate_of_id is null
     and a.closed_at is null and b.closed_at is null
     and a.city_id = b.city_id;
  if v_bad <> 0 then
    raise exception 'P3 failed: heaven-19 still live beside Heaven Club';
  end if;

  select count(*) into v_bad
    from public.venues d
   where d.id = '32862d33-65ed-499d-bc09-a6215f65bfbb'
     and d.duplicate_of_id = '6bada896-6e57-4ca6-9c5b-5d819c8f540f'
     and (   exists (select 1 from public.events e where e.venue_id = d.id)
          or not exists (
               select 1 from public.venue_merge_audit a
                where a.keep_id = '6bada896-6e57-4ca6-9c5b-5d819c8f540f'
                  and a.drop_id = d.id and a.undone_at is null
                  and a.details ->> 'schema' = '1'));
  if v_bad <> 0 then
    raise exception 'P4 failed: heaven-19 merge left events behind or has no reversible audit row';
  end if;
end
$verify$;
