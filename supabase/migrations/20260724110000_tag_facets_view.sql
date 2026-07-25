-- Canonical facet vocabulary + normalizer for the dirty entity_type strings in
-- unified_tag_assignments (venues/venue, news/news_article, marketplace_listing/marketplace, ...).
create or replace function public.tag_facet_of(p_entity_type text)
returns text language sql immutable as $$
  select case lower(coalesce(p_entity_type, ''))
    when 'venues'              then 'venue'
    when 'venue'               then 'venue'
    when 'hotel'               then 'hotel'
    when 'hotels'              then 'hotel'
    when 'event'               then 'event'
    when 'events'              then 'event'
    when 'news'                then 'news'
    when 'news_article'        then 'news'
    when 'marketplace'         then 'marketplace'
    when 'marketplace_listing' then 'marketplace'
    when 'personality'         then 'person'
    when 'personalities'       then 'person'
    when 'community_group'     then 'group'
    when 'group'               then 'group'
    when 'city'                then 'city'
    when 'cities'              then 'city'
    when 'country'             then 'country'
    when 'countries'           then 'country'
    when 'village'             then 'village'
    when 'queer_village'       then 'village'
    else null  -- 'tag' self-links and anything unmapped are excluded from facets
  end;
$$;

comment on function public.tag_facet_of is
  'Normalizes dirty unified_tag_assignments.entity_type values to the canonical facet vocabulary. NULL = excluded.';

create or replace view public.tag_facets as
select distinct a.tag_id as concept_id,
       public.tag_facet_of(a.entity_type) as facet
from public.unified_tag_assignments a
where public.tag_facet_of(a.entity_type) is not null;

comment on view public.tag_facets is
  'Derived unification layer: which domain facets each tag concept is used in. Source of truth for cross-silo faceted discovery.';

grant select on public.tag_facets to anon, authenticated, service_role;
