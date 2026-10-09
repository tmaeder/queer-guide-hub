-- Bremen venue dedup (2026-10-09).
--
-- /city/bremen listed Bürgerpark four times (gays-cruising, planet-randy x2,
-- gayout imports). A full read of all 59 live Bremen venues found nine more
-- duplicate groups; every pair below was confirmed by the site owner. The
-- nightly dedup_truth_sweep cannot reach them: they sit on the single-token /
-- identity-conflict arms (and Friends / FRIENDS Bar was machine-rejected on
-- "single shared token" although both rows carry Rembertistraße 32).
--
-- _venue_merge_core copies NO fields, so the keeper is enriched first
-- (fill-if-empty only). Every merge is stamped schema:1 by the core and is
-- reversible with unmerge_venues(audit_id).
--
-- Deliberately NOT merged (checked, different businesses at one address):
-- Erotic market vs Hotel NordRaum (Europaallee 1-3), Zone 283 vs LCNW (a club
-- hosted at the venue), Kweer vs Rat&Tat.
--
-- Soft on preconditions: a pair whose rows were already merged by someone
-- else is skipped with a NOTICE. Hard on postconditions: the verify block
-- asserts the end state.

set local statement_timeout = '120s';

create temp table _bremen_pairs (keep_id uuid, drop_id uuid) on commit drop;
insert into _bremen_pairs values
  -- 1 Bürgerpark
  ('816ec5b4-5e66-49c9-9d8b-6815813bea72', 'f0be699a-8dd6-40a7-b6cb-a494683c4455'),
  ('816ec5b4-5e66-49c9-9d8b-6815813bea72', 'ff00ffe4-453f-4b4d-adbb-ffb3795b81fa'),
  ('816ec5b4-5e66-49c9-9d8b-6815813bea72', '5dbecebc-76a4-4972-934a-484db050cc6c'),
  -- 2 Parkplatz Ahlken
  ('63f492fc-4b0a-48f1-8ded-ca31b039ddc9', 'ec05bd25-1b57-466c-b48a-828d530b4ccf'),
  -- 3 Mahndorfer Marsch
  ('5dd9e0d3-d26d-431f-97b4-3b71d15f39fe', '9a79577d-b4ce-46d4-8b1a-3df82af928f7'),
  -- 4 Krumhörens Kuhlen
  ('9f286959-e83b-442f-b582-b7428d4c8cd1', '8509a147-3218-4373-bb2b-544367b735f3'),
  -- 5 FRIENDS Bar
  ('efe1360a-bd98-432f-9600-33e8d3df3d3d', 'f1463052-d684-441c-a3b1-c17310f90910'),
  -- 6 LCNW
  ('2bca538c-6a9e-4d19-8f37-4cb27d4a818a', 'c1e238ba-cccc-47da-803e-df8bacc05f42'),
  -- 7 QUEENS (Queens Bremen, Tom's Welt)
  ('2455158e-a699-48f9-92d1-696b8005e5da', '9961c1c2-5449-488c-af02-9946a7665634'),
  ('2455158e-a699-48f9-92d1-696b8005e5da', '64c84d40-0a1c-41d1-8af0-6b2542cdced4'),
  -- 8 Movie's Eventhouse
  ('913dcad1-7665-492a-84d5-f3a2d8ff48d6', '4fad3f08-30c1-47b2-bca2-6ba945339eda'),
  -- 9 Stadtwaldsee (Uni Lake, Hochschulring parking)
  ('ad4723ce-ab16-49e2-8c2c-d70c860299e4', '9f22898a-5457-4070-b5bb-6550cbf10d00'),
  ('ad4723ce-ab16-49e2-8c2c-d70c860299e4', '7ebf4ec8-7767-4643-ab34-a41fcc0f5903'),
  -- 10 CSD Bremen + Bremerhaven e.V.
  ('933e2d6f-a967-4f74-a55a-d50996884a5b', '756a2610-1834-43c9-aa29-84dbfa9848f9');

-- 1. Enrich keepers before the merge (fill-if-empty only).
update public.venues
   set address = 'Bürgerpark, Hollerallee/Parkallee, 28209 Bremen'
 where id = '816ec5b4-5e66-49c9-9d8b-6815813bea72'
   and address = 'Bürgerpark, Bremen';

update public.venues
   set address = 'Theodor-Körner-Straße 1, 28203 Bremen'
 where id = '933e2d6f-a967-4f74-a55a-d50996884a5b'
   and address like 'Theodor-K%rner-Strasse 1'
   and address <> 'Theodor-Körner-Straße 1, 28203 Bremen';

update public.venues k
   set website = coalesce(nullif(btrim(k.website), ''), d.website),
       phone   = coalesce(nullif(btrim(k.phone), ''), d.phone),
       address = coalesce(nullif(btrim(k.address), ''), d.address)
  from _bremen_pairs p
  join public.venues d on d.id = p.drop_id
 where k.id = p.keep_id
   and d.duplicate_of_id is null
   and ((nullif(btrim(k.website), '') is null and nullif(btrim(d.website), '') is not null
         and d.website not like 'https://translate.google.com/%')
     or (nullif(btrim(k.phone), '') is null and nullif(btrim(d.phone), '') is not null)
     or (nullif(btrim(k.address), '') is null and nullif(btrim(d.address), '') is not null));

-- 2. Merge.
do $merge$
declare
  r record;
  v_merged int := 0;
begin
  for r in select * from _bremen_pairs loop
    if exists (select 1 from public.venues
                where id in (r.keep_id, r.drop_id) and duplicate_of_id is not null) then
      raise notice 'skip % <- %: already merged', r.keep_id, r.drop_id;
      continue;
    end if;
    perform public._venue_merge_core(r.keep_id, r.drop_id, null);
    v_merged := v_merged + 1;
  end loop;
  raise notice 'bremen dedup: merged %', v_merged;
end
$merge$;

-- 3. Close open review rows for these pairs (either direction).
update public.dedup_review_queue q
   set status = 'approved',
       reviewed_at = now(),
       reviewer_note = 'manual Bremen dedup 99991791576009'
  from _bremen_pairs p
 where q.status = 'open'
   and q.entity_type = 'venue'
   and ((q.keep_id = p.keep_id and q.drop_id = p.drop_id)
     or (q.keep_id = p.drop_id and q.drop_id = p.keep_id)
     or (q.keep_id in (select drop_id from _bremen_pairs) and q.drop_id in (select drop_id from _bremen_pairs)));

-- 4. Postconditions.
do $verify$
declare
  v_bad int;
begin
  select count(*) into v_bad
    from _bremen_pairs p join public.venues d on d.id = p.drop_id
   where d.duplicate_of_id is distinct from p.keep_id;
  if v_bad <> 0 then raise exception 'P1 failed: % drops not merged into their keeper', v_bad; end if;

  select count(*) into v_bad
    from (select distinct keep_id from _bremen_pairs) p join public.venues k on k.id = p.keep_id
   where k.duplicate_of_id is not null;
  if v_bad <> 0 then raise exception 'P2 failed: % keepers are themselves merged', v_bad; end if;

  select count(*) into v_bad
    from public.venues
   where city_id = '3e3ebccb-8f13-417b-b76f-f49ed8b2bac0'
     and duplicate_of_id is null
     and name ilike '%rgerpark%';
  if v_bad <> 1 then raise exception 'P3 failed: Bremen has % live Bürgerpark rows', v_bad; end if;

  select count(*) into v_bad
    from _bremen_pairs p
   where not exists (select 1 from public.venue_merge_audit a
                      where a.keep_id = p.keep_id and a.drop_id = p.drop_id
                        and a.undone_at is null and a.details->>'schema' = '1');
  if v_bad <> 0 then raise exception 'P4 failed: % merges without a reversible audit row', v_bad; end if;
end
$verify$;
