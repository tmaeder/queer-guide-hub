-- Spandau, Steglitz and Tempelhof as Berlin district villages, and their tags redirected there.
--
-- The Destinations tags `spandau` (3 events), `steglitz` (30) and `tempelhof` (37) each name one
-- Berlin district, but there was no village row to send them to, so 99991795616721 left them.
-- Same shape as 20260915175850 (Kreuzberg, Neukölln, Friedrichshain, Prenzlauer Berg, Mitte):
-- parent city Berlin, description from the tag's own description, coordinates from each tag's
-- Wikidata item (P625) — Q158083 Spandau 52.55/13.20 (borough), Q700211 Steglitz 52.4667/13.3333,
-- Q363830 Tempelhof 52.4667/13.3833.
--
-- No queer-scene claim is written: the villages carry only what the tags already said. A village
-- with no linked venue is routed to ghost + deindexed by run_village_trust_recompute; the page
-- still renders (ghost village pages return 200), so the redirect lands either way, and
-- village_relink links nearby venues nightly.

select set_config('app.actor', 'editorial:destination-place-tags', true);

do $$
declare
  v_berlin  uuid := '5761c6c4-3ed6-4429-832b-025e508db544';  -- cities: Berlin, Germany
  v_germany uuid := 'fd9997de-bf8f-49a5-a641-9240a39541ff';  -- countries: Germany (DE)
  v_made int;
begin
  -- Partial CI snapshot: no Berlin row, or no geo_places row for it (the village insert syncs the
  -- spine under its parent and fails on a missing one). Nothing to do there.
  if not exists (select 1 from public.cities c where c.id = v_berlin)
     or not exists (select 1 from public.geo_places p where p.id = v_berlin) then
    raise notice 'Berlin not present here - skipping district villages';
    return;
  end if;
  if not exists (select 1 from public.cities c
                  where c.id = v_berlin and lower(c.name) = 'berlin' and c.country_id = v_germany) then
    raise exception 'parent city is not Berlin, Germany - refusing to create districts under it';
  end if;

  insert into public.queer_villages (name, slug, city_id, country_id, description, latitude, longitude, seo_indexable)
  select v.name, v.slug, v_berlin, v_germany, v.description, v.lat, v.lon, true
    from (values
      ('Spandau', 'spandau',
       'Westernmost borough of Berlin, at the confluence of the Havel and Spree rivers, with a historic old town and Renaissance citadel.',
       52.55, 13.2),
      ('Steglitz', 'steglitz',
       'Residential locality in the Steglitz-Zehlendorf borough in south-western Berlin, centred on the Schlossstraße shopping street.',
       52.466666666667, 13.333333333333),
      ('Tempelhof', 'tempelhof',
       'Locality in Berlin''s Tempelhof-Schöneberg borough, site of the former Tempelhof Airport, now the large public park Tempelhofer Feld.',
       52.4667, 13.3833)
    ) as v(name, slug, description, lat, lon)
   where not exists (select 1 from public.queer_villages q where q.slug = v.slug);
  get diagnostics v_made = row_count;
  raise notice 'districts created: % (of 3; any shortfall already existed)', v_made;
end $$;

update public.unified_tags t
set publication_role = 'entity_redirect',
    entity_kind = 'place'::public.tag_entity_kind,
    canonical_entity_type = 'village',
    canonical_entity_id = q.id,
    canonical_entity_path = '/villages/' || q.slug,
    canonical_entity_reviewed_at = now(),
    publication_role_reviewed_at = now(),
    publication_role_review_note = 'reviewed canonical entity conversion (destination tags)',
    seo_indexable = false,
    seo_deindex_reason = 'publication_role:entity_redirect'
from public.queer_villages q
where q.slug = t.slug
  and q.city_id = '5761c6c4-3ed6-4429-832b-025e508db544'
  and q.duplicate_of_id is null
  and t.slug in ('spandau', 'steglitz', 'tempelhof')
  and t.status = 'active'
  and t.entity_kind is distinct from 'place';

do $verify$
declare v_villages int; v_tags int;
begin
  if not exists (select 1 from public.geo_places p where p.id = '5761c6c4-3ed6-4429-832b-025e508db544') then
    return;  -- partial CI snapshot, see above
  end if;
  select count(*) into v_villages from public.queer_villages
   where slug in ('spandau', 'steglitz', 'tempelhof')
     and city_id = '5761c6c4-3ed6-4429-832b-025e508db544' and duplicate_of_id is null;
  select count(*) into v_tags from public.unified_tags
   where slug in ('spandau', 'steglitz', 'tempelhof') and status = 'active'
     and entity_kind = 'place' and publication_role = 'entity_redirect'
     and canonical_entity_path = '/villages/' || slug and seo_indexable = false;
  -- A tag the snapshot does not hold cannot be redirected; on prod all three exist.
  if v_villages <> 3 or v_tags <> (select count(*) from public.unified_tags
       where slug in ('spandau', 'steglitz', 'tempelhof') and status = 'active') then
    raise exception 'berlin villages: % of 3 villages, % of 3 tags redirected', v_villages, v_tags;
  end if;
end
$verify$;
