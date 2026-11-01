-- City cover images that are maps, flags or satellite imagery, not photographs.
--
-- /city/mexico-city's cover was a NASA radar map of land subsidence
-- (Wikimedia, "US-Indian Spacecraft Captures Mexico City Subsidence (PIA26709)").
-- `fetch-images` scored it 90: the alt text names the city, the source is
-- Wikimedia and it is 1280px wide, and `_shared/scoreImage.ts` had no rule that
-- a map is not a photograph. That rule ships in the same change; this file
-- repairs what it let through.
--
-- Measured 2026-11-01: 26 live cities (22 indexable) whose cover's alt text opens
-- with a cartography word: locator maps (Harker Heights, Lingle, Port Richey…),
-- satellite views (Kigali, Muscat, Mbabane, Nuku'alofa, Osijek), a flag
-- (Huddersfield, Vaasa), an 1881 bird's-eye map (Winnipeg) and an old city map
-- (Paris).
--
-- Only the first 200 characters of the alt are read, the same window the scorer
-- uses. Flickr captions run to essays: Gaza's cover is a protest photo whose
-- caption says "radar systems" about 4,000 characters in, and it is NOT matched.
--
-- Two remedies, because one row has a known-good replacement and the rest do not:
--
-- 1. Mexico City gets back the photo it carried until 2026-10-14 (a Pexels
--    photo of the city's Pride march, also the cover of the merged-away
--    `ciudad-de-mexico` row). It is written to BOTH `image_url` and
--    `curated_image_url`: the app prefers the curated column, but the crawler
--    `<head>` in functions/_lib/detail.ts reads `image_url` only, and
--    `fetch-images` never overwrites a curated image.
-- 2. Every other match has its cover REMOVED, never replaced with a guess. The
--    retracted URL and alt are kept in `image_metadata`, and a null cover is
--    exactly what makes `fetch-images` pick again, now under the fixed scorer.

set local app.actor = 'migration:99991793527765_city_cover_images_not_maps';

-- 1. Mexico City. Content-guarded on the map URL, so an editor's later fix wins.
update public.cities c
set image_url = d.image_url,
    curated_image_url = d.image_url,
    image_flagged = false,
    image_metadata = d.image_metadata
      || jsonb_build_object(
           'restored_by', 'migration:99991793527765',
           'retracted_image_url', c.image_url,
           'retracted_reason', 'cartography: NASA radar subsidence map, not a photograph'),
    updated_at = now()
from public.cities d
where c.slug = 'mexico-city'
  and c.duplicate_of_id is null
  and d.slug = 'ciudad-de-mexico'
  and d.image_url = 'https://img.queer.guide/city-images/f1fbef7ee6acaf74805215eda2f79e57f2cd0536d97764497c65c7b3623e2b04.jpg'
  and c.image_url = 'https://img.queer.guide/city-images/e3057417ca6b26b0569700bff3b9d13f0a530917edb46d7f5d73b85659e4c3f6.jpg';

-- 2. Everything else the rule matches. Curated covers are an editor's decision
--    and are never touched.
update public.cities c
set image_url = null,
    image_flagged = false,
    image_metadata = coalesce(c.image_metadata, '{}'::jsonb)
      || jsonb_build_object(
           'rejected', true,
           'reason', 'cartography: cover was a map, flag or satellite image',
           'retracted_image_url', c.image_url,
           'retracted_alt', left(c.image_metadata->>'alt', 300),
           'retracted_by', 'migration:99991793527765'),
    updated_at = now()
where c.duplicate_of_id is null
  and c.image_url is not null
  and c.curated_image_url is null
  and left(lower(coalesce(c.image_metadata->>'alt', '')), 200)
      ~* '\m(map|maps|mapped|mapping|locator|diagram|chart|charts|graph|infographic|satellite|radar|subsidence|heatmap|floor plan|blueprint|coat of arms|flag of|seal of)\M';

do $verify$
declare
  v_bad int;
begin
  -- P1: no live city still shows a cover the rule rejects.
  select count(*) into v_bad
  from public.cities
  where duplicate_of_id is null
    and image_url is not null
    and curated_image_url is null
    and left(lower(coalesce(image_metadata->>'alt', '')), 200)
        ~* '\m(map|maps|mapped|mapping|locator|diagram|chart|charts|graph|infographic|satellite|radar|subsidence|heatmap|floor plan|blueprint|coat of arms|flag of|seal of)\M';
  if v_bad <> 0 then
    raise exception 'P1 failed: % live city covers are still maps/flags/satellite images', v_bad;
  end if;

  -- P2: Mexico City does not show the subsidence map, by either column.
  select count(*) into v_bad
  from public.cities
  where slug = 'mexico-city'
    and duplicate_of_id is null
    and 'https://img.queer.guide/city-images/e3057417ca6b26b0569700bff3b9d13f0a530917edb46d7f5d73b85659e4c3f6.jpg'
        in (coalesce(image_url, ''), coalesce(curated_image_url, ''));
  if v_bad <> 0 then
    raise exception 'P2 failed: mexico-city still serves the subsidence map';
  end if;

  -- P3 (mirror): the narrow window did not take a real photo. Gaza's cover is a
  -- protest photo whose essay-length caption mentions radar far past 200 chars.
  select count(*) into v_bad
  from public.cities
  where slug = 'gaza' and duplicate_of_id is null
    and image_metadata->>'retracted_by' = 'migration:99991793527765';
  if v_bad <> 0 then
    raise exception 'P3 failed: gaza cover was retracted, the window is too wide';
  end if;
end
$verify$;
