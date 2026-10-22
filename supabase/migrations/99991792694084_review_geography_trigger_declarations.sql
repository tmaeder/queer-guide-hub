-- Explicit declarations make every generated attachment visible to the schema
-- drift guard and to migration reviewers. This recreates the same attachments;
-- the functions, conditions and source permissions are unchanged.
set local lock_timeout='5s';

drop trigger if exists review_geo_reopen_id on public.cities;
create trigger review_geo_reopen_id after insert or update of shell_status,seo_indexable,duplicate_of_id on public.cities
 for each row execute function api_private.review_reopen_geography('id');

drop trigger if exists review_geo_reopen_parent_id on public.geo_places;
create trigger review_geo_reopen_parent_id after insert or update of parent_id on public.geo_places
 for each row execute function api_private.review_reopen_geography('parent_id');

drop trigger if exists review_geo_reopen_city_id on public.venues;
create trigger review_geo_reopen_city_id after insert or update of city_id on public.venues
 for each row execute function api_private.review_reopen_geography('city_id');

drop trigger if exists review_geo_reopen_city_id on public.events;
create trigger review_geo_reopen_city_id after insert or update of city_id on public.events
 for each row execute function api_private.review_reopen_geography('city_id');

drop trigger if exists review_geo_reopen_city_id on public.organizations;
create trigger review_geo_reopen_city_id after insert or update of city_id on public.organizations
 for each row execute function api_private.review_reopen_geography('city_id');

drop trigger if exists review_geo_reopen_city_id on public.hotels;
create trigger review_geo_reopen_city_id after insert or update of city_id on public.hotels
 for each row execute function api_private.review_reopen_geography('city_id');

drop trigger if exists review_geo_reopen_city_id on public.queer_villages;
create trigger review_geo_reopen_city_id after insert or update of city_id on public.queer_villages
 for each row execute function api_private.review_reopen_geography('city_id');

drop trigger if exists review_geo_reopen_city_id on public.news_article_cities;
create trigger review_geo_reopen_city_id after insert or update of city_id on public.news_article_cities
 for each row execute function api_private.review_reopen_geography('city_id');

drop trigger if exists review_geo_reopen_city_ids on public.news_articles;
create trigger review_geo_reopen_city_ids after insert or update of city_ids on public.news_articles
 for each row execute function api_private.review_reopen_geography('city_ids');

drop trigger if exists review_geo_reopen_city_id on public.personalities;
create trigger review_geo_reopen_city_id after insert or update of city_id on public.personalities
 for each row execute function api_private.review_reopen_geography('city_id');

drop trigger if exists review_geo_reopen_death_city_id on public.personalities;
create trigger review_geo_reopen_death_city_id after insert or update of death_city_id on public.personalities
 for each row execute function api_private.review_reopen_geography('death_city_id');

drop trigger if exists review_geo_reopen_city_id on public.festivals;
create trigger review_geo_reopen_city_id after insert or update of city_id on public.festivals
 for each row execute function api_private.review_reopen_geography('city_id');

drop trigger if exists review_geo_reopen_city_id on public.guides;
create trigger review_geo_reopen_city_id after insert or update of city_id on public.guides
 for each row execute function api_private.review_reopen_geography('city_id');

drop trigger if exists review_geo_reopen_city_id on public.milestones;
create trigger review_geo_reopen_city_id after insert or update of city_id on public.milestones
 for each row execute function api_private.review_reopen_geography('city_id');

drop trigger if exists review_geo_reopen_host_city_id on public.competition_editions;
create trigger review_geo_reopen_host_city_id after insert or update of host_city_id on public.competition_editions
 for each row execute function api_private.review_reopen_geography('host_city_id');

drop trigger if exists review_geo_reopen_city_id on public.competition_entrants;
create trigger review_geo_reopen_city_id after insert or update of city_id on public.competition_entrants
 for each row execute function api_private.review_reopen_geography('city_id');

drop trigger if exists review_geo_reopen_city_id on public.trip_destinations;
create trigger review_geo_reopen_city_id after insert or update of city_id on public.trip_destinations
 for each row execute function api_private.review_reopen_geography('city_id');

drop trigger if exists review_geo_reopen_city_id on public.trip_places;
create trigger review_geo_reopen_city_id after insert or update of city_id on public.trip_places
 for each row execute function api_private.review_reopen_geography('city_id');

drop trigger if exists review_geo_reopen_city_id on public.reservations;
create trigger review_geo_reopen_city_id after insert or update of city_id on public.reservations
 for each row execute function api_private.review_reopen_geography('city_id');

drop trigger if exists review_geo_reopen_city_id on public.city_favorites;
create trigger review_geo_reopen_city_id after insert or update of city_id on public.city_favorites
 for each row execute function api_private.review_reopen_geography('city_id');

drop trigger if exists review_geo_reopen_city_id on public.user_place_marks;
create trigger review_geo_reopen_city_id after insert or update of city_id on public.user_place_marks
 for each row execute function api_private.review_reopen_geography('city_id');

drop trigger if exists review_geo_reopen_city_id on public.user_presence_location;
create trigger review_geo_reopen_city_id after insert or update of city_id on public.user_presence_location
 for each row execute function api_private.review_reopen_geography('city_id');

drop trigger if exists review_geo_reopen_city_id on public.intimate_cruising_mode;
create trigger review_geo_reopen_city_id after insert or update of city_id on public.intimate_cruising_mode
 for each row execute function api_private.review_reopen_geography('city_id');

