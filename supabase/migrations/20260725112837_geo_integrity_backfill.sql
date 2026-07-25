-- Geo Hierarchy Unification — P1: repair existing geo FK disagreements.
-- Rule: the most specific FK wins (village fixes city, city fixes country).
-- ~56 rows total; entity triggers (search sync, safety_gated) fire per row — intended.

-- 1) village → city (fix city_id first so step 2 derives from the right city)
update public.venues v set city_id = qv.city_id
from public.queer_villages qv
where qv.id = v.queer_village_id and v.city_id is not null and v.city_id is distinct from qv.city_id;

update public.events e set city_id = qv.city_id
from public.queer_villages qv
where qv.id = e.queer_village_id and e.city_id is not null and e.city_id is distinct from qv.city_id;

update public.hotels h set city_id = qv.city_id
from public.queer_villages qv
where qv.id = h.queer_village_id and h.city_id is not null and h.city_id is distinct from qv.city_id;

-- 2) city → country
update public.venues v set country_id = c.country_id
from public.cities c
where c.id = v.city_id and v.country_id is not null and v.country_id is distinct from c.country_id;

update public.events e set country_id = c.country_id
from public.cities c
where c.id = e.city_id and e.country_id is not null and e.country_id is distinct from c.country_id;

update public.hotels h set country_id = c.country_id
from public.cities c
where c.id = h.city_id and h.country_id is not null and h.country_id is distinct from c.country_id;
