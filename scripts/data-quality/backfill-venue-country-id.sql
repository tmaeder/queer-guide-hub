-- M-8 (audit 2026-06-05). Resolve venues that have coordinates but no country_id.
-- Relational resolution (NOT reverse-geocoding): the venue's own country text or
-- its city's country_id. Run in a loop until it affects 0 rows; batched because
-- the venue search_documents re-index cascade exceeds the statement timeout.
-- Resolution priority: city.country_id > countries.code (ISO2) > countries.name.
update public.venues v
   set country_id = sub.cid, updated_at = now()
from (
  select v2.id,
    coalesce(
      (select c.country_id from public.cities c where c.id = v2.city_id),
      (select co.id from public.countries co where upper(co.code) = upper(v2.country)),
      (select co.id from public.countries co where lower(co.name) = lower(v2.country))
    ) as cid
  from public.venues v2
  where v2.latitude is not null and v2.longitude is not null
    and v2.country_id is null and v2.duplicate_of_id is null
    and (
      exists (select 1 from public.cities c where c.id = v2.city_id and c.country_id is not null)
      or exists (select 1 from public.countries co
                 where upper(co.code) = upper(v2.country) or lower(co.name) = lower(v2.country))
    )
  limit 500
) sub
where v.id = sub.id and sub.cid is not null;
