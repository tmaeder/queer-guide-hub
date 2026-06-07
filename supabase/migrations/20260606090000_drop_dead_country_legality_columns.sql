-- M-5 phase 2 (audit 2026-06-05) — drop the dead lgbt_legal_status / lgbt_rights_status
-- country columns. Applied ONLY after the phase-1 code removal (PR #1464) is deployed,
-- so no live code selects them. cities_admin derived these from lgbti_same_sex_unions /
-- equality_score via a null-coalesce fallback that never fired; redefine it without the
-- dead-column reference (output columns unchanged) so the DROP has no dependency.

create or replace view public.cities_admin as
 select c.id, c.name, c.country_id, c.region_name, c.population, c.latitude, c.longitude,
        c.timezone, c.is_capital, c.is_major_city, c.major_airport_code, c.created_at, c.updated_at,
        co.name as country_name,
        case
            when co.lgbti_same_sex_unions is null then null::text
            when "left"(co.lgbti_same_sex_unions, 1) = '{' then co.lgbti_same_sex_unions::jsonb ->> 'summary'
            else co.lgbti_same_sex_unions
        end as lgbt_legal_status,
        case
            when co.equality_score >= 80 then 'High protections'
            when co.equality_score >= 60 then 'Moderate protections'
            when co.equality_score >= 40 then 'Limited protections'
            when co.equality_score >= 20 then 'Restricted'
            when co.equality_score is not null then 'Hostile'
            else null::text
        end as lgbt_rights_status,
        co.equality_score, co.continent_id,
        coalesce(v.venue_count, 0::bigint) as venue_count,
        coalesce(e.event_count, 0::bigint) as event_count
   from cities c
     left join countries co on co.id = c.country_id
     left join (select venues.city_id, count(*) as venue_count from venues where venues.city_id is not null group by venues.city_id) v on v.city_id = c.id
     left join (select events.city_id, count(*) as event_count from events where events.city_id is not null group by events.city_id) e on e.city_id = c.id;

alter table public.countries drop column if exists lgbt_legal_status;
alter table public.countries drop column if exists lgbt_rights_status;
