-- Pluto Sauna Essen: verify against the venue's own website and fill the gaps.
--
-- Canonical row 75d95d20 (/venue/pluto-sauna). Checked 2026-10-05 against
-- https://pluto-essen.tv (raw HTML, not a summary):
--   * address carried "Viehofer Straße 49\n45127 Essen\nGermany" -- postcode and
--     country duplicated into the street line with newlines.
--   * description was a Foursquare user comment ("Ist einfach find ich persönlich
--     die beste Gay Sauna in NRW."), not a description.
--   * hours.display was a Spartacus string mixing hours with stale prices
--     (EUR 15-21; the site's standard tariff is now EUR 28) and a locker count.
--   * email, instagram and social_links were empty on the survivor. The links sat on
--     merged duplicate 7060e2f1 -- the venue merge core moves children, not fields --
--     and all four (Instagram, Facebook, Telegram, ROMEO) are linked from the site.
--     The joyclub value there is the bare joyclub.de homepage and is NOT carried over.
--   * amenities empty; tags lacked men-only. The site's admission rule: everyone
--     perceived as a man at the door, 18+, any orientation.
--
-- Plus a live duplicate: 42e58d57 (pluto-sauna-essen-3, gayout import 2026-09-28),
-- same street address, coordinates ~13 m apart, same name. Its dedup pair
-- 237f447b was machine-rejected as `single_token_core` (reviewer_id NULL); that
-- rejection is wrong for this pair and is overridden here by an explicit merge.
--
-- Deliberately NOT changed: category stays `sauna`. Recategorising to `cruising`
-- would flip safety_gated and hide the page from anonymous visitors; that is a
-- separate decision, not a data correction.

select set_config('app.actor', 'migration:99991791233588_pluto_sauna_essen_verify', true);

-- 1. Merge the live duplicate (soft precondition: only while both rows are live).
do $merge$
declare v_res jsonb;
begin
  if exists (select 1 from public.venues where id = '42e58d57-77f4-4684-b3be-8f06dfd57174'
               and duplicate_of_id is null)
     and exists (select 1 from public.venues where id = '75d95d20-4047-45ac-b7ea-fd0fc2b0c53b'
               and duplicate_of_id is null)
  then
    v_res := public.merge_venues('75d95d20-4047-45ac-b7ea-fd0fc2b0c53b'::uuid,
                                 '42e58d57-77f4-4684-b3be-8f06dfd57174'::uuid);
    raise notice 'Pluto duplicate merged: %', v_res;

    update public.dedup_review_queue
       set reviewer_note = coalesce(reviewer_note, '')
         || ' | Overridden 2026-10-05 by migration 99991791233588: same street address '
         || '(Viehofer Str. 49), coordinates ~13 m apart, same name -- merged.'
     where id = '237f447b-b04d-4bb3-be96-47bb6319a70c'
       and coalesce(reviewer_note, '') not like '%99991791233588%';
  else
    raise notice 'Pluto duplicate already merged or survivor not live -- nothing to do';
  end if;
end $merge$;

-- 2. Survivor fields. Each assignment is guarded on the defective value it replaces,
--    so a human edit made before this applies is kept.
update public.venues v
   set address = case when v.address like E'%\n%' or v.address ilike '%germany%'
                      then 'Viehofer Straße 49' else v.address end,
       description = case when v.description is null
                            or v.description like 'Ist einfach find ich persönlich%'
                      then 'Men''s sauna in central Essen, at the end of the Kettwiger Straße '
                        || 'pedestrian zone. Around 1,600 m² over three floors: a Finnish sauna '
                        || 'overlooking a cold plunge pool with counter-current, a labyrinth '
                        || 'steam room, a sanarium (50–60 °C), a hamam with a heated marble '
                        || 'slab, a 4 × 4 m whirlpool, a cinema train, a small cinema, lockable '
                        || 'rest cabins, cruising areas and a central bar and lounge. About 400 '
                        || 'lockers. Admission for men aged 18 and over, of any orientation. '
                        || 'Open Monday to Thursday 12:00–06:00, and non-stop from Friday 12:00 '
                        || 'to Monday 06:00; open through public holidays. Nearest tram stop: '
                        || 'Viehofer Platz.'
                      else v.description end,
       hours = case when v.hours is null or v.hours->>'source' = 'spartacus'
                    then jsonb_build_object(
                           'source', 'pluto-essen.tv',
                           'display', 'Mon–Thu 12:00–06:00; Fri 12:00 – Mon 06:00 non-stop; open on public holidays',
                           'observed_at', now())
                    else v.hours end,
       email = coalesce(v.email, 'info@pluto-essen.tv'),
       instagram = coalesce(v.instagram, 'https://www.instagram.com/pluto.essen/'),
       social_links = case when coalesce(v.social_links, '{}'::jsonb) = '{}'::jsonb
                      then jsonb_build_object(
                             'instagram', 'https://www.instagram.com/pluto.essen/',
                             'facebook',  'https://www.facebook.com/PlutoSaunaEssen/',
                             'telegram',  'https://t.me/plutosauna',
                             'romeo',     'https://www.romeo.com/groups/member/PLUTO_Essen')
                      else v.social_links end,
       amenities = case when coalesce(cardinality(v.amenities), 0) = 0
                   then array['steam-room','pool','hot-tub','lockers','private-cabins','cruising-area']
                   else v.amenities end,
       tags = case when 'men-only' = any(coalesce(v.tags, '{}'))
              then v.tags
              else array_append(coalesce(v.tags, '{}'), 'men-only') end,
       enrichment_status = coalesce(v.enrichment_status, '{}'::jsonb)
         || jsonb_build_object('manual_verify', jsonb_build_object(
              'source', 'https://pluto-essen.tv',
              'at', '2026-10-05',
              'by', 'migration:99991791233588'))
 where v.id = '75d95d20-4047-45ac-b7ea-fd0fc2b0c53b'
   and v.duplicate_of_id is null;

-- 3. Organization: fill-if-empty.
update public.organizations
   set email = 'info@pluto-essen.tv'
 where id = '1195eac7-08bc-4745-b601-9ec101039f07'
   and email is null;

-- 4. Postconditions: assert the reached state, not how many rows were touched.
do $verify$
declare v record;
begin
  select * into v from public.venues where id = '75d95d20-4047-45ac-b7ea-fd0fc2b0c53b';
  if v.id is null or v.duplicate_of_id is not null then
    raise exception 'P1 failed: Pluto survivor missing or merged away';
  end if;
  if v.address like E'%\n%' then
    raise exception 'P2 failed: address still multi-line';
  end if;
  if v.description is null or v.description like 'Ist einfach find ich persönlich%' then
    raise exception 'P3 failed: description still the user comment';
  end if;
  if v.hours->>'display' ~* 'EUR' then
    raise exception 'P4 failed: hours still carry prices';
  end if;
  if v.email is null or v.instagram is null or coalesce(v.social_links, '{}'::jsonb) = '{}'::jsonb then
    raise exception 'P5 failed: contact/social fields still empty';
  end if;
  if not ('men-only' = any(v.tags)) or coalesce(cardinality(v.amenities), 0) = 0 then
    raise exception 'P6 failed: tags/amenities not filled';
  end if;
  -- P7 is a NOTICE, not a raise: this migration never writes category or
  -- safety_gated, and a system writer moved the row to `cruising` (gated) on
  -- 2026-10-05 22:08, after this file was authored. As a raise it asserted a
  -- state the file does not own and aborted db push for every queued
  -- migration repo-wide (four failed deploys, 2026-10-06).
  if v.category <> 'sauna' or v.safety_gated then
    raise notice 'P7: category/safety_gated is (%, %), set outside this migration', v.category, v.safety_gated;
  end if;
  if exists (select 1 from public.venues where id = '42e58d57-77f4-4684-b3be-8f06dfd57174'
               and duplicate_of_id is distinct from '75d95d20-4047-45ac-b7ea-fd0fc2b0c53b') then
    raise exception 'P8 failed: duplicate 42e58d57 not merged into the survivor';
  end if;
end $verify$;
