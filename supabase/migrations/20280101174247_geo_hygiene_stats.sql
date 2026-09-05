-- geo_hygiene_stats — the geo sentinel that did not exist.
--
-- scripts/check-pipeline-health.mjs has ten sections and NONE of them watches
-- geography beyond city duplicate signals. Nothing observed venues_misplaced,
-- geo_validations coverage, null coordinates, or the boundary set itself, which
-- is how 670 venues came to sit >500 km from their linked city unnoticed while
-- a broken validator produced 692 alerts that were 94% artifact.
--
-- Deliberately a SEPARATE function rather than another key inside
-- pipeline_hygiene_stats(). That function has to be restated in full to add a
-- field, which makes it a merge-collision surface between concurrent sessions —
-- this repo has already paid for that. A sibling function composes without
-- touching anyone else's work.
--
-- THE POSITIVE CONTROL IS THE POINT. A containment sweep over an empty
-- geo_boundaries classifies every row `offshore` and reports zero country
-- mismatches, which reads exactly like a pristine corpus. So `boundary_rows` is
-- returned first and the health script must fail on zero. Equally, an ABSENT
-- key (function not deployed) must report differently from a zero count —
-- "I could not look" is not "I looked and found nothing".

create or replace function public.geo_hygiene_stats()
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  select jsonb_build_object(
    -- Positive controls. Zero here invalidates every other number below.
    'boundary_countries', (select count(*) from public.geo_boundaries
                            where boundary_kind='country' and iso_a2 is not null),
    'boundary_admin1',    (select count(*) from public.geo_boundaries where boundary_kind='admin1'),
    'country_parents',    (select count(*) from public.geo_country_parent),

    -- Countries our corpus uses that have neither their own polygon nor a
    -- derived parent. Every venue under one of these would read as a false
    -- mismatch, so this must stay zero.
    'countries_without_geometry', (
      select count(*) from public.countries c
      where not exists (select 1 from public.geo_boundaries b
                         where b.boundary_kind='country' and b.iso_a2 = c.code)
        and not exists (select 1 from public.geo_country_parent p where p.child_code = c.code)
        and (exists (select 1 from public.venues v where v.country_id = c.id)
             or exists (select 1 from public.events e where e.country_id = c.id))
    ),

    -- Containment verdicts, from the last sweep.
    'containment', coalesce((
      select jsonb_object_agg(v, n) from (
        select split_part(mismatch_details, ':', 1) as v, count(*) as n
        from public.geo_validations
        where source = 'geo_containment' and has_mismatch
        group by 1
      ) t), '{}'::jsonb),
    'containment_rows', (select count(*) from public.geo_validations where source='geo_containment'),
    'containment_oldest_days', (
      select coalesce(round(extract(epoch from now() - min(last_validated_at))/86400)::int, -1)
      from public.geo_validations where source='geo_containment'),

    -- Pre-existing signals nothing was reading.
    'venues_misplaced', (select count(*) from public.venues_misplaced(null)),
    'venues_no_coords', (select count(*) from public.venues
                          where duplicate_of_id is null and latitude is null),
    'geo_address_queue_depth', (select count(*) from public.geo_address_queue where attempts < 4),

    -- The legacy Nominatim validator. Its precision was ~6% before the
    -- canonicalisation fix; a re-inflation here means the comparison regressed.
    'nominatim_flagged', (select count(*) from public.geo_validations
                           where source='nominatim' and has_mismatch)
  );
$$;

comment on function public.geo_hygiene_stats() is
  'Geo sentinel for check-pipeline-health.mjs. boundary_countries is a POSITIVE CONTROL: a containment sweep over an empty boundary set reports zero mismatches and is indistinguishable from a clean corpus, so zero must hard-fail. An absent key (function not deployed) must be reported differently from a zero value.';

revoke all on function public.geo_hygiene_stats() from public;
grant execute on function public.geo_hygiene_stats() to authenticated, service_role;
