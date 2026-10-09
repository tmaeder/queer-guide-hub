-- Hand review of the 38 cities 99991791528780 flagged `admin_unit_review`.
--
-- WHY
-- backfill-venue-cities minted them from a geocoder label that was either a
-- city SUBDIVISION ("Botanica Sector", "Mkomani ward") or not in English
-- ("חיפה", "Δήμος Λάρνακας"). The repair migration deliberately did not guess
-- a parent city; this file is the per-row decision, each checked against the
-- row's own coordinates and Wikidata/enwiki (label + distance to P625):
--
-- MERGE (11) — the place already exists as its own row, within 2.6–12.6 km:
--   חיפה → Haifa · 대구광역시 → Daegu · ខណ្ឌបឹងកេងកង (Boeung Keng Kang) → Phnom Penh
--   Botanica Sector → Chișinău · Cukarica Urban Municipality → Belgrade
--   Central Business District → Abuja · Mkomani ward → Mombasa
--   محافظة مكة المكرمة → Mecca · Linwood-Central-Heathcote Community → Christchurch
--   חדרה (filed under PS) → Hadera (IL) — coordinates are Hadera, Israel
--   澳門 Macau (filed under CN) → Macau/Macao (MO)
--   The last two cross a country boundary; merge_cities requires the explicit
--   confirm flag for that.
--
-- RENAME (20) — a real town with no row of its own; English name = enwiki
-- title, coordinates within 0.2–24 km of the Wikidata/enwiki point:
--   Gabrovo, Larnaca, Bitola, Agadir, Aïn Fekan, Peshawar, Uttaradit, Cherkasy,
--   Tahlequah, Smixi, Iskandariya (Iraq — not Alexandria), Lempa, Cromwell,
--   Tuatapere, Vinh, Hammamet, Kathu, Tianjin (和平区 = Heping, Tianjin's core
--   district; no Tianjin row existed), San Cristóbal (Táchira), plus Corinth
--   ("Municipal Unit of Corinth", minted 09:19 — between the repair migration
--   and the producer fix going live).
--   The old label is kept as a city_aliases row; slugs do not move.
--
-- LEFT FLAGGED (8) — no defensible single town: a rural council
--   (Навасёлкаўскі сельскі Савет), council areas (Causeway Coast and Glens,
--   Banks Peninsula, Te Hiku), a tambon (Pho Thong Subdistrict), a Kenyan ward
--   (Tinet), "Zone 9" (Liberia) and سيد جلال (Egypt).
--
-- Soft on preconditions (a row that moved is skipped and reported), hard on
-- postconditions.

do $apply$
declare
  r record;
  v_merged int := 0;
  v_renamed int := 0;
  v_skipped text[] := '{}';
begin
  perform set_config('app.actor', 'migration:99991791538336_flagged_geocode_cities_review', true);

  -- ------------------------------------------------------------ merges
  create temp table _m (keep_id uuid, drop_id uuid, drop_name text, cross_country boolean) on commit drop;
  insert into _m values
    ('e1fed235-babe-46ba-b1d9-d6af1b5af187', 'e1d04f5d-e788-4844-9319-a46681c0b78f', 'חיפה', false),
    ('0a462521-5179-4900-b390-fda6b01dac78', '5ded59ec-b564-456b-a7e9-15bbc6c9c608', '대구광역시', false),
    ('e4d2a78c-92ff-4783-be1b-28fd27c40f01', 'b725b3a8-ca61-4c35-9205-4648708ef7aa', 'ខណ្ឌបឹងកេងកង', false),
    ('447cac98-66ec-43e4-9f60-ed7b006ba9b5', 'aef3df87-5d41-49bf-be66-4c9836b425be', 'Botanica Sector', false),
    ('6f8ce06e-cdf3-4156-a71d-6c33e3fd18e4', '8ca682bb-2ba9-4772-8a17-3e5072c2a0c0', 'Cukarica Urban Municipality', false),
    ('76e215a3-656d-4aec-a803-faf7acc2ddd4', '4d083aa8-fcf1-4181-8e70-0600ac031413', 'Central Business District', false),
    ('44391fde-fd63-41a9-95d6-66b2b7d94491', '3d765ede-5279-4a62-b2a0-5a10866341bf', 'Mkomani ward', false),
    ('440b0a54-341c-4b8f-b770-6a001a64c1cc', '1d7a32a4-c30e-4099-9820-0b15cef76e54', 'محافظة مكة المكرمة', false),
    ('61cc1688-b5f4-4f74-b05b-56b3fd2aac4f', 'cf6dd9f7-81d9-4411-a4a3-250c9aa6a4d3', 'Linwood-Central-Heathcote Community', false),
    ('7000f355-7a4b-4353-bff1-4109aaafd016', '07264a60-8dac-4f4c-9a52-19281f31e124', 'חדרה', true),
    ('37e409a3-dbb3-46e4-92f6-784094a4a1ee', 'fa19b203-f1d5-4e1f-ad4d-7de2014774a5', '澳門 Macau', true);

  for r in select * from _m loop
    if exists (select 1 from public.cities where id = r.drop_id and duplicate_of_id is null and name = r.drop_name)
       and exists (select 1 from public.cities where id = r.keep_id and duplicate_of_id is null) then
      perform public.merge_cities(r.keep_id, r.drop_id, r.cross_country);
      v_merged := v_merged + 1;
    else
      v_skipped := v_skipped || format('merge %s: already merged or changed', r.drop_name);
    end if;
  end loop;

  -- ------------------------------------------------------------ renames
  create temp table _r (id uuid, old_name text, new_name text, qid text) on commit drop;
  insert into _r values
    ('082f3b53-42cf-4c0e-bd3a-0702dfce076a', 'Габрово', 'Gabrovo', 'Q180131'),
    ('122bb563-8e4b-4dcc-9c01-678ff16fd108', 'Δήμος Λάρνακας', 'Larnaca', 'Q171882'),
    ('f6f65db0-e541-4e43-a6d8-b8d1e321a098', 'Битола', 'Bitola', 'Q157246'),
    ('157e1445-6aec-4347-b8f5-f3a58092278d', 'Agadir ⴰⴳⴰⴷⵉⵔ أكادير', 'Agadir', 'Q170525'),
    ('6d9e6288-8b4c-4936-bcfc-f359ad59b8ef', 'Ain Fekan ⵄⵉⵏ ⴼⴻⴽⴽⴰⵔ عين فكان', 'Aïn Fekan', 'Q4833278'),
    ('3cb33b7c-aaff-47fb-9b5e-1b47b9f5e0a0', 'تحصیل پشاور شہر', 'Peshawar', 'Q1113311'),
    ('8f12401c-6f43-4f27-a666-32fd1c4b7ffb', 'เทศบาลเมืองอุตรดิตถ์', 'Uttaradit', 'Q1359241'),
    ('88e7ce71-8016-432d-aa01-078908b9c299', 'Черкаська міська громада', 'Cherkasy', 'Q157055'),
    ('52e3429e-17d3-472c-9a63-4320fa6c27ba', 'Tahlequah;ᏓᎵᏆ', 'Tahlequah', 'Q736809'),
    ('7bd21990-13e8-4fb4-8652-2691dcd94273', 'Σμίξη', 'Smixi', 'Q2642845'),
    ('83ab3dce-03c5-41bb-8e95-6241a01c16f7', 'الإسكندرية', 'Iskandariya', 'Q1029787'),
    ('499ccb06-9b7f-44f6-9392-e7a5906b1ba8', 'Lempa Community', 'Lempa', 'Q6521475'),
    ('ce01221e-bed4-49fc-88a8-cad56ac8fa72', 'Cromwell Community', 'Cromwell', 'Q973355'),
    ('a33be95f-cae0-46ff-a459-5a6cb138d48d', 'Tuatapere Te Waewae Community', 'Tuatapere', 'Q1324727'),
    ('199f0252-78a6-46a8-8b67-2e2d1241cf97', 'Thanh Vinh Ward', 'Vinh', 'Q33428'),
    ('2918822e-40c2-4982-acc7-1e3288462d65', 'الحمامات', 'Hammamet', null),
    ('a5bf020e-8446-4178-b48b-02ff7dd4eb44', 'ตำบลกะทู้', 'Kathu', 'Q182516'),
    ('af53e30b-f1d1-406c-b52a-9ae573b3f721', '和平区', 'Tianjin', 'Q11736'),
    ('a08c2c1c-2258-4b8d-9b38-cabddb5efb13', 'San Cistóbal, Sector Los Kioscos', 'San Cristóbal', 'Q820235'),
    ('c70ffc57-2cdc-49ea-80c9-56b89c56695a', 'Municipal Unit of Corinth', 'Corinth', null);

  create temp table _r_slugs on commit drop as
    select c.id, c.slug from public.cities c join _r using (id);

  for r in select _r.*, c.name as cur_name, c.country_id, c.region_code, c.duplicate_of_id
             from _r join public.cities c using (id) loop
    if r.duplicate_of_id is not null or r.cur_name is distinct from r.old_name then
      v_skipped := v_skipped || format('rename %s: no longer "%s"', r.id, r.old_name);
      continue;
    end if;
    if exists (select 1 from public.cities t
               where t.id <> r.id and t.country_id = r.country_id
                 and coalesce(t.region_code,'') = coalesce(r.region_code,'')
                 and (lower(t.name) = lower(r.new_name)
                      or (t.duplicate_of_id is null and t.name_normalized = public.normalize_name(r.new_name)))) then
      v_skipped := v_skipped || format('rename %s: "%s" already taken', r.old_name, r.new_name);
      continue;
    end if;
    update public.cities
       set name = r.new_name,
           needs_attention = false,
           enrichment_status = (coalesce(enrichment_status, '{}'::jsonb) - 'admin_unit_review')
             || jsonb_build_object('admin_unit_reviewed', jsonb_build_object(
                  'decision', 'renamed', 'from', r.old_name, 'to', r.new_name,
                  'by', 'migration:99991791538336', 'at', now())),
           field_provenance = coalesce(field_provenance, '{}'::jsonb)
             || jsonb_build_object('name', coalesce(field_provenance->'name', '{}'::jsonb)
                  || jsonb_build_object('admin_unit_reviewed', jsonb_build_object(
                       'from', r.old_name, 'to', r.new_name, 'qid', r.qid,
                       'source', 'enwiki_title', 'by', 'migration:99991791538336', 'at', now()))),
           updated_at = now()
     where id = r.id;
    insert into public.city_aliases (city_id, alias, locale)
    values (r.id, r.old_name, null)
    on conflict (city_id, alias_key) do nothing;
    v_renamed := v_renamed + 1;
  end loop;

  -- The eight left for a human keep their review flag. Two of them LOST it
  -- between this file's dry run and its first apply: backfill-city-region
  -- read enrichment_status at run start and wrote the whole object back ~35
  -- minutes later, dropping the key 99991791528780 had added meanwhile
  -- (Tinet ward 09:34, Causeway Coast and Glens 09:35 — needs_attention
  -- survived because the script does not write it). Re-stamp, then assert.
  update public.cities c
     set enrichment_status = coalesce(c.enrichment_status, '{}'::jsonb)
           || jsonb_build_object('admin_unit_review', jsonb_build_object(
                'reason', 'subdivision',
                'detail', 'minted by backfill-venue-cities from a geocoder label that is a city subdivision or not in English; decide the parent city by hand',
                'by', 'migration:99991791538336', 'restored_after', 'backfill-city-region lost update',
                'at', now())),
         needs_attention = true,
         updated_at = now()
   where c.id in ('83dff157-c426-41da-907b-4dd7a50425fc', 'b4cf316e-aabe-4223-a0d7-1d604f71a328',
                  'ffa7d7e9-d0ba-47c4-8c4b-f74d43dc471a', 'e834061a-f4d4-4ea3-ba6c-9b5ff7a9d3a4',
                  'd7ba5296-ad39-462e-bd31-71aa3e09a9bc', 'b836b562-59e1-4464-a3de-3ddcf8374586',
                  '70aa5a4d-eeb7-46ec-bf66-a72e45e7ce1d', 'c696ede4-bded-453c-ba3c-de5c4184dcb2')
     and c.duplicate_of_id is null
     and not (coalesce(c.enrichment_status, '{}'::jsonb) ? 'admin_unit_review')
     and not (coalesce(c.enrichment_status, '{}'::jsonb) ? 'admin_unit_reviewed');

  raise notice 'flagged review: merged %, renamed %, skipped %: %',
    v_merged, v_renamed, coalesce(array_length(v_skipped, 1), 0), v_skipped;

  -- ------------------------------------------------------------ verify
  if exists (select 1 from _m join public.cities c on c.id = _m.drop_id where c.duplicate_of_id is null) then
    raise exception 'P1 failed: a merge drop row is still live';
  end if;

  if exists (select 1 from _r a join public.cities c using (id)
             where c.duplicate_of_id is null and c.name = a.old_name
               and not exists (select 1 from public.cities t
                               where t.id <> a.id and t.country_id = c.country_id
                                 and coalesce(t.region_code,'') = coalesce(c.region_code,'')
                                 and lower(t.name) = lower(a.new_name))) then
    raise exception 'P2 failed: a rename target kept its old label with no collision to explain it';
  end if;

  if exists (select 1 from _r a join public.cities c using (id)
             where c.name = a.new_name
               and not exists (select 1 from public.city_aliases x
                               where x.city_id = a.id and x.alias_key = public.city_canonical_key(a.old_name))) then
    raise exception 'P3 failed: a renamed city lost its old label (no alias)';
  end if;

  if exists (select 1 from _r_slugs s join public.cities c using (id) where c.slug is distinct from s.slug) then
    raise exception 'P4 failed: a rename moved a slug';
  end if;

  -- P5: the eight deliberately left rows are still flagged for a human —
  -- every one that is still live and was not resolved by someone else.
  if (select count(*) from public.cities
       where id in ('83dff157-c426-41da-907b-4dd7a50425fc', 'b4cf316e-aabe-4223-a0d7-1d604f71a328',
                    'ffa7d7e9-d0ba-47c4-8c4b-f74d43dc471a', 'e834061a-f4d4-4ea3-ba6c-9b5ff7a9d3a4',
                    'd7ba5296-ad39-462e-bd31-71aa3e09a9bc', 'b836b562-59e1-4464-a3de-3ddcf8374586',
                    '70aa5a4d-eeb7-46ec-bf66-a72e45e7ce1d', 'c696ede4-bded-453c-ba3c-de5c4184dcb2')
         and duplicate_of_id is null
         and not (enrichment_status ? 'admin_unit_reviewed')
         and not (enrichment_status ? 'admin_unit_review')) > 0 then
    raise exception 'P5 failed: a deliberately unresolved row lost its review flag';
  end if;
end
$apply$;
