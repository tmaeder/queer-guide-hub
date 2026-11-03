-- The last non-place city, "Unknown", and the junk that kept it alive.
--
-- 99991793650522 deleted nine non-place city rows and kept "Unknown" because content pointed at
-- it. That content was itself junk:
--
--   * 66 events titled "Fehlt dein Event?" (data_source 'eventfrog-lgbtiq'). It is the promo tile
--     on eventfrog's LGBTIQ listing ("Erfasse deinen Event ..."). scrape-web-sources dated any
--     undated item with the scraper's own clock and filled a missing city with the literal
--     'Unknown', so every run re-published the tile as a new public event. Producer fixed in the
--     same change (_shared/scraped-event-guard.ts). All child rows cascade.
--   * 1 venue "Sauna Héroes" with address "Address unknown" and no coordinates. Whether it is a
--     real venue cannot be established from the row, so it is unlinked (city_id AND the 'Unknown'
--     city text, or a name-resolving linker would re-attach it) and flagged needs_attention.
--
-- Then "Unknown" itself is deleted with a snapshot into nonplace_city_deletion_audit.

-- 1. Promo events, and any not-yet-committed staging copies of them.
delete from public.events
where data_source = 'eventfrog-lgbtiq'
  and title ~* '^\s*fehlt dein event';

update public.ingestion_staging
set review_status = 'rejected'
where target_table = 'events'
  and source_type = 'eventfrog-lgbtiq'
  and review_status in ('auto', 'pending', 'pending_review')
  and target_record_id is null
  and coalesce(normalized_data, raw_data)->>'title' ~* '^\s*fehlt dein event';

-- 2. Unlink the venue and the remaining events (if any) from "Unknown".
drop table if exists _unknown_city;
create temp table _unknown_city on commit drop as
select id, name from public.cities
where name = 'Unknown' and duplicate_of_id is null;

update public.venues v
set city_id = null,
    city = case when v.city = 'Unknown' then null else v.city end,
    needs_attention = true,
    enrichment_status = coalesce(v.enrichment_status, '{}'::jsonb)
      || jsonb_build_object('city_unlinked', jsonb_build_object(
           'from', 'Unknown',
           'reason', 'placeholder city deleted; no address or coordinates to resolve a real one',
           'by', 'migration:99991793653404',
           'at', now()))
where v.city_id in (select id from _unknown_city);

update public.events e
set city_id = null,
    city = case when e.city = 'Unknown' then null else e.city end
where e.city_id in (select id from _unknown_city);

-- 3. Delete "Unknown" if nothing else points at it (soft precondition).
delete from _unknown_city t
where exists (select 1 from public.venues v where v.city_id = t.id)
   or exists (select 1 from public.events e where e.city_id = t.id)
   or exists (select 1 from public.hotels h where h.city_id = t.id)
   or exists (select 1 from public.organizations o where o.city_id = t.id)
   or exists (select 1 from public.personalities p where p.city_id = t.id or p.death_city_id = t.id)
   or exists (select 1 from public.queer_villages q where q.city_id = t.id)
   or exists (select 1 from public.news_article_cities n where n.city_id = t.id)
   or exists (select 1 from public.news_articles a where t.id = any(a.city_ids))
   or exists (select 1 from public.trip_destinations td where td.city_id = t.id)
   or exists (select 1 from public.trip_places tp where tp.city_id = t.id)
   or exists (select 1 from public.city_favorites cf where cf.city_id = t.id)
   or exists (select 1 from public.geo_places g where g.parent_id = t.id)
   or exists (select 1 from public.cities d where d.duplicate_of_id = t.id);

insert into public.nonplace_city_deletion_audit (city_id, city_name, country_code, reason, city_row, spine_row, refs)
select c.id, c.name,
       (select co.code from public.countries co where co.id = c.country_id),
       'name_pattern:placeholder',
       to_jsonb(c),
       (select to_jsonb(g) from public.geo_places g where g.id = c.id),
       jsonb_build_object('migration', '99991793653404_eventfrog_promo_events_and_unknown_city')
from public.cities c
join _unknown_city t on t.id = c.id;

delete from public.city_quality_signals     where city_id in (select id from _unknown_city);
delete from public.city_coverage_gaps       where city_id in (select id from _unknown_city);
delete from public.city_review_queue_legacy where city_id in (select id from _unknown_city);
delete from public.image_asset_links        where entity_id in (select id from _unknown_city);
delete from public.content_embeddings       where content_type = 'city' and content_id in (select id from _unknown_city);

delete from public.cities where id in (select id from _unknown_city);

-- Postconditions
do $verify$
declare
  v_n integer;
begin
  select count(*) into v_n from public.events
  where data_source = 'eventfrog-lgbtiq' and title ~* '^\s*fehlt dein event';
  if v_n <> 0 then
    raise exception 'P1 failed: % promo event(s) survived', v_n;
  end if;

  select count(*) into v_n from public.cities
  where duplicate_of_id is null and public.city_name_nonplace_reason(name) is not null;
  if v_n <> 0 then
    raise exception 'P2 failed: % live non-place city row(s) remain', v_n;
  end if;
end
$verify$;
