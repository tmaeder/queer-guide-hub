-- Atlanta Eagle moved; we kept publishing the old bar.
--
-- /venues/atlanta-eagle (indexable) served 306 Ponce De Leon Avenue, 30303, a
-- +1 404 873 2453 phone, spartacus hours ("19-3, Sat 17-3h, closed Sun"),
-- category `event-venue`, a description calling it an "event venue", and no
-- social links at all. The venue's own site (atlantaeagle.com, read
-- 2026-10-04) gives 1492 Piedmont Ave NE, Atlanta, GA 30309; +1 404-999-3826;
-- events@atlantaeagle.com; Mon-Fri 3pm-3am, Sat 1pm-3am, Sun 1pm-midnight;
-- "Atlanta's premier levi and leather bar that caters to ALL of the community";
-- and links facebook.com/atlantaeagle, instagram.com/atlantaeagle and
-- x.com/atlantaeagle. A first-party site linking its own profiles is the
-- evidence for the three social URLs.
--
-- THE NEW ADDRESS WAS ALREADY IN THE ROW'S OWN SOURCES. gayout's payload
-- (venue_sources 299cbdfd…, attached 2026-09-28) carries "1492 Piedmont Ave NE,
-- Atlanta, GA 30309" at 33.7960463/-84.3710166, and the merged spartacus
-- duplicate sat at 33.7962/-84.3711. commit_venue_staging_item is
-- fill-if-empty (address = coalesce(nullif(address,''), v_address, ...)), so
-- a correct newer address can never replace a stale one and nothing records
-- that they disagreed. Coordinates are taken from that payload, not guessed.
--
-- That fill-if-empty rule is deliberately NOT changed here: an incoming source
-- disagreeing by >1 km is as often a city-centroid fallback or a bad merge as
-- a real move. Measured 2026-10-04: 590 live venues (of 22,011 checkable) have
-- a source more than 1 km from their stored coordinates, 286 of them within
-- 1-20 km. Flagging them needs_attention would demote them to draft (the
-- systemic visibility gate), so this file adds a SENTINEL that reports the
-- cohort instead — venue_source_location_signals() — and leaves the per-row
-- decision to a human.
--
-- NOT TOUCHED: Mixx / Mixx Atlanta at the same street number (Ste B) are a
-- separate business in the same building and must not be merged; a
-- postcondition asserts both are unchanged. Events from atlantaeagle.com/events
-- are out of scope (no source exists for them).

select set_config('app.actor', 'migration:99991791148325_atlanta_eagle_relocation', true);

-- 1. The row. Content-guarded on the stale address, so a later human fix is
--    left alone and a re-run is a no-op. Prior values are preserved on the row.
update public.venues v
set
  enrichment_status = coalesce(v.enrichment_status, '{}'::jsonb) || jsonb_build_object(
    'relocation_repair', jsonb_build_object(
      'at', now(),
      'by', 'migration:99991791148325',
      'source', 'https://www.atlantaeagle.com (read 2026-10-04)',
      'from', jsonb_build_object(
        'address', v.address, 'postal_code', v.postal_code,
        'latitude', v.latitude, 'longitude', v.longitude,
        'phone', v.phone, 'email', v.email, 'hours', v.hours,
        'category', v.category, 'description', v.description,
        'social_links', v.social_links, 'instagram', v.instagram
      )
    )
  ),
  address      = '1492 Piedmont Ave NE',
  postal_code  = '30309',
  latitude     = 33.7960463,
  longitude    = -84.3710166,
  phone        = '+14049993826',
  email        = 'events@atlantaeagle.com',
  website      = 'https://www.atlantaeagle.com',
  category     = 'bar',
  hours        = jsonb_build_object(
    'display', 'Mon–Fri 15:00–03:00; Sat 13:00–03:00; Sun 13:00–24:00',
    'regular', jsonb_build_array(
      jsonb_build_object('day', 1, 'open', '1500', 'close', '+0300'),
      jsonb_build_object('day', 2, 'open', '1500', 'close', '+0300'),
      jsonb_build_object('day', 3, 'open', '1500', 'close', '+0300'),
      jsonb_build_object('day', 4, 'open', '1500', 'close', '+0300'),
      jsonb_build_object('day', 5, 'open', '1500', 'close', '+0300'),
      jsonb_build_object('day', 6, 'open', '1300', 'close', '+0300'),
      jsonb_build_object('day', 7, 'open', '1300', 'close', '+0000')
    ),
    'source', 'atlantaeagle.com',
    'observed_at', '2026-10-04'
  ),
  social_links = jsonb_build_object(
    'facebook',  'https://www.facebook.com/atlantaeagle',
    'instagram', 'https://www.instagram.com/atlantaeagle',
    'twitter',   'https://x.com/atlantaeagle'
  ),
  instagram    = 'atlantaeagle',
  description  = 'The Atlanta Eagle is a leather and Levi bar in Atlanta that '
    || 'describes itself as catering to all of the community. It now sits at '
    || '1492 Piedmont Avenue NE in Ansley Square; it was previously at 306 Ponce '
    || 'de Leon Avenue. The weekly programme includes trivia, bingo, karaoke, a '
    || 'country night, Dyke Night and a Sunday afternoon DJ set, alongside gear '
    || 'nights and Atlanta Pride weekend events.'
where v.id = '91c28809-8e79-4251-b3d8-f3f08e7f0d01'
  and v.duplicate_of_id is null
  and v.address ilike '306 Ponce%';

-- 2. Tags. venues.tags runs through normalize_venue_tags (a closed queer
--    vocabulary that drops "leather"/"bear"), so the descriptive tags go in as
--    unified_tag_assignments, which is what the page's tag row reads. There is
--    no active "levi" tag, so none is minted.
insert into public.unified_tag_assignments (tag_id, entity_id, entity_type)
select t.id, '91c28809-8e79-4251-b3d8-f3f08e7f0d01'::uuid, 'venues'
from public.unified_tags t
where t.slug in ('leather', 'bear') and t.status = 'active'
on conflict (tag_id, entity_id, entity_type) do nothing;

-- 3. Provenance: the site is now the winning source for what it changed, and
--    the spartacus hours stop winning (they were the stale value).
update public.venue_field_provenance
set is_winning = false
where venue_id = '91c28809-8e79-4251-b3d8-f3f08e7f0d01' and field = 'hours' and source <> 'atlantaeagle.com';

insert into public.venue_field_provenance (venue_id, field, value, source, confidence, is_winning, observed_at)
select '91c28809-8e79-4251-b3d8-f3f08e7f0d01'::uuid, f.field, f.value, 'atlantaeagle.com', 1.0, true, '2026-10-04'::timestamptz
from (values
  ('address',      to_jsonb('1492 Piedmont Ave NE, Atlanta, GA 30309'::text)),
  ('phone',        to_jsonb('+14049993826'::text)),
  ('email',        to_jsonb('events@atlantaeagle.com'::text)),
  ('hours',        jsonb_build_object('display', 'Mon–Fri 15:00–03:00; Sat 13:00–03:00; Sun 13:00–24:00')),
  ('category',     to_jsonb('bar'::text)),
  ('social_links', jsonb_build_object(
                     'facebook',  'https://www.facebook.com/atlantaeagle',
                     'instagram', 'https://www.instagram.com/atlantaeagle',
                     'twitter',   'https://x.com/atlantaeagle'))
) as f(field, value)
on conflict (venue_id, field, source) do update
  set value = excluded.value, is_winning = true, observed_at = excluded.observed_at;

-- 4. Sentinel: venues whose own attached sources place them more than 1 km
--    from their stored coordinates. Reported, never acted on — see header.
create or replace function public.venue_source_location_signals()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $fn$
  with s as (
    select vs.venue_id,
           vs.source_slug,
           vs.first_seen_at,
           (vs.payload #>> '{normalized,location,lat}')::numeric as lat,
           (vs.payload #>> '{normalized,location,lng}')::numeric as lng,
           vs.payload #>> '{normalized,location,address}' as address
    from public.venue_sources vs
    where (vs.payload #>> '{normalized,location,lat}') ~ '^-?[0-9]+(\.[0-9]+)?$'
      and (vs.payload #>> '{normalized,location,lng}') ~ '^-?[0-9]+(\.[0-9]+)?$'
  ), d as (
    select v.id, v.slug, v.address as stored_address, s.source_slug, s.address as source_address,
           s.first_seen_at > v.created_at as newer_source,
           public.haversine_m(v.latitude::numeric, v.longitude::numeric, s.lat, s.lng) as m
    from public.venues v
    join s on s.venue_id = v.id
    where v.duplicate_of_id is null
      and v.closed_at is null
      and v.latitude is not null and v.longitude is not null
      and abs(s.lat) > 0.01 and abs(s.lng) > 0.01
  )
  select jsonb_build_object(
    'probe_ok', true,
    'venues_checkable', (select count(distinct id) from d),
    'venues_disagreeing_1km', (select count(distinct id) from d where m > 1000),
    'venues_disagreeing_1_20km', (select count(distinct id) from d where m between 1000 and 20000),
    'venues_disagreeing_newer_source', (select count(distinct id) from d where m > 1000 and newer_source),
    'sample', coalesce((
      select jsonb_agg(x) from (
        select slug, stored_address, source_slug, source_address, round(m)::int as distance_m
        from d where m between 1000 and 20000 and newer_source
        order by m limit 10
      ) x
    ), '[]'::jsonb)
  );
$fn$;

revoke all on function public.venue_source_location_signals() from public, anon, authenticated;
grant execute on function public.venue_source_location_signals() to service_role;

-- 5. Postconditions. END STATE, not "rows updated": a re-run or a human fix
--    that already moved the address must still pass.
do $verify$
declare
  v_bad int;
  v_sig jsonb;
begin
  select count(*) into v_bad from public.venues
  where id = '91c28809-8e79-4251-b3d8-f3f08e7f0d01'
    and (address ilike '%306 Ponce%' or postal_code = '30303' or phone = '+14048732453');
  if v_bad <> 0 then
    raise exception 'atlanta eagle P1 failed: still publishes the pre-move address or phone';
  end if;

  select count(*) into v_bad from public.venues
  where id = '91c28809-8e79-4251-b3d8-f3f08e7f0d01'
    and public.haversine_m(latitude::numeric, longitude::numeric, 33.7960463, -84.3710166) <= 1000
    and social_links ? 'facebook' and social_links ? 'instagram' and social_links ? 'twitter'
    and category = 'bar';
  if v_bad <> 1 then
    raise exception 'atlanta eagle P2 failed: coordinates, social links or category not in the expected end state';
  end if;

  select count(*) into v_bad from public.venues
  where (id = 'b06a47dc-5399-43f4-bfc9-60ade96bc5dd' and address = '1492 Piedmont Ave NE Ste B, Atlanta, GA 30309' and duplicate_of_id is null)
     or (id = 'b46aa288-7e6d-42fe-8534-b8d992516a31' and address = E'1492 Piedmont Ave NE\nAtlanta, GA 30309' and duplicate_of_id is null);
  if v_bad <> 2 then
    raise exception 'atlanta eagle P3 failed: the Mixx rows in the same building were changed or merged';
  end if;

  v_sig := public.venue_source_location_signals();
  if coalesce((v_sig ->> 'probe_ok')::boolean, false) is not true
     or coalesce((v_sig ->> 'venues_checkable')::int, 0) = 0 then
    raise exception 'atlanta eagle P4 failed: sentinel measured nothing (%)', v_sig;
  end if;
end
$verify$;
