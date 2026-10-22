-- Explicit declarations make every generated attachment visible to the schema
-- drift guard and to migration reviewers. This recreates the same attachments;
-- the functions, conditions and source permissions are unchanged.
set local lock_timeout='5s';

-- Persist automatic repairs independently of the expensive union refresh. A
-- worklist timeout must never roll back completed source dispositions.
do $decouple$
declare s text; anchor text:=' perform api_private.run_review_automatic_resolution(p_batch,p_dry_run);';
begin
 s:=pg_get_functiondef('public.repair_admin_review_mechanical(integer,boolean)'::regprocedure);
 if (length(s)-length(replace(s,anchor,'')))/length(anchor)<>1 then raise exception 'Automatic sweep hook anchor changed'; end if;
 execute replace(s,anchor,'');
end $decouple$;
update public.admin_automations set schedule='0-59/5 * * * *',
 description='Independent five-minute source corrections; completed repairs survive worklist refresh failures.',
 action='{"type":"rpc","fn":"run_review_automatic_resolution","args":{"p_batch":200,"p_dry_run":false}}'::jsonb
where slug='review_automatic_resolution';
select cron.schedule('review_automatic_resolution','0-59/5 * * * *',
 'set statement_timeout=''90s''; select public.run_review_automatic_resolution(200,false);');

-- Existing production attachments already match these declarations. Avoid
-- taking exclusive table locks merely to recreate identical triggers during
-- concurrent read-only schema snapshots. A real definition mismatch still
-- executes the complete literal attachment DDL below.
do $attachments$
begin
 if exists(
 select 1 from (values
 ('cities','review_geo_reopen_id','create trigger review_geo_reopen_id after insert or update of shell_status,seo_indexable,duplicate_of_id on public.cities for each row execute function api_private.review_reopen_geography(''id'')'),
 ('geo_places','review_geo_reopen_parent_id','create trigger review_geo_reopen_parent_id after insert or update of parent_id on public.geo_places for each row execute function api_private.review_reopen_geography(''parent_id'')'),
 ('venues','review_geo_reopen_city_id','create trigger review_geo_reopen_city_id after insert or update of city_id on public.venues for each row execute function api_private.review_reopen_geography(''city_id'')'),
 ('events','review_geo_reopen_city_id','create trigger review_geo_reopen_city_id after insert or update of city_id on public.events for each row execute function api_private.review_reopen_geography(''city_id'')'),
 ('organizations','review_geo_reopen_city_id','create trigger review_geo_reopen_city_id after insert or update of city_id on public.organizations for each row execute function api_private.review_reopen_geography(''city_id'')'),
 ('hotels','review_geo_reopen_city_id','create trigger review_geo_reopen_city_id after insert or update of city_id on public.hotels for each row execute function api_private.review_reopen_geography(''city_id'')'),
 ('queer_villages','review_geo_reopen_city_id','create trigger review_geo_reopen_city_id after insert or update of city_id on public.queer_villages for each row execute function api_private.review_reopen_geography(''city_id'')'),
 ('news_article_cities','review_geo_reopen_city_id','create trigger review_geo_reopen_city_id after insert or update of city_id on public.news_article_cities for each row execute function api_private.review_reopen_geography(''city_id'')'),
 ('news_articles','review_geo_reopen_city_ids','create trigger review_geo_reopen_city_ids after insert or update of city_ids on public.news_articles for each row execute function api_private.review_reopen_geography(''city_ids'')'),
 ('personalities','review_geo_reopen_city_id','create trigger review_geo_reopen_city_id after insert or update of city_id on public.personalities for each row execute function api_private.review_reopen_geography(''city_id'')'),
 ('personalities','review_geo_reopen_death_city_id','create trigger review_geo_reopen_death_city_id after insert or update of death_city_id on public.personalities for each row execute function api_private.review_reopen_geography(''death_city_id'')'),
 ('festivals','review_geo_reopen_city_id','create trigger review_geo_reopen_city_id after insert or update of city_id on public.festivals for each row execute function api_private.review_reopen_geography(''city_id'')'),
 ('guides','review_geo_reopen_city_id','create trigger review_geo_reopen_city_id after insert or update of city_id on public.guides for each row execute function api_private.review_reopen_geography(''city_id'')'),
 ('milestones','review_geo_reopen_city_id','create trigger review_geo_reopen_city_id after insert or update of city_id on public.milestones for each row execute function api_private.review_reopen_geography(''city_id'')'),
 ('competition_editions','review_geo_reopen_host_city_id','create trigger review_geo_reopen_host_city_id after insert or update of host_city_id on public.competition_editions for each row execute function api_private.review_reopen_geography(''host_city_id'')'),
 ('competition_entrants','review_geo_reopen_city_id','create trigger review_geo_reopen_city_id after insert or update of city_id on public.competition_entrants for each row execute function api_private.review_reopen_geography(''city_id'')'),
 ('trip_destinations','review_geo_reopen_city_id','create trigger review_geo_reopen_city_id after insert or update of city_id on public.trip_destinations for each row execute function api_private.review_reopen_geography(''city_id'')'),
 ('trip_places','review_geo_reopen_city_id','create trigger review_geo_reopen_city_id after insert or update of city_id on public.trip_places for each row execute function api_private.review_reopen_geography(''city_id'')'),
 ('reservations','review_geo_reopen_city_id','create trigger review_geo_reopen_city_id after insert or update of city_id on public.reservations for each row execute function api_private.review_reopen_geography(''city_id'')'),
 ('city_favorites','review_geo_reopen_city_id','create trigger review_geo_reopen_city_id after insert or update of city_id on public.city_favorites for each row execute function api_private.review_reopen_geography(''city_id'')'),
 ('user_place_marks','review_geo_reopen_city_id','create trigger review_geo_reopen_city_id after insert or update of city_id on public.user_place_marks for each row execute function api_private.review_reopen_geography(''city_id'')'),
 ('user_presence_location','review_geo_reopen_city_id','create trigger review_geo_reopen_city_id after insert or update of city_id on public.user_presence_location for each row execute function api_private.review_reopen_geography(''city_id'')'),
 ('intimate_cruising_mode','review_geo_reopen_city_id','create trigger review_geo_reopen_city_id after insert or update of city_id on public.intimate_cruising_mode for each row execute function api_private.review_reopen_geography(''city_id'')')
 ) expected(table_name,trigger_name,definition)
 left join pg_catalog.pg_trigger t on t.tgrelid=to_regclass('public.'||expected.table_name)
  and t.tgname=expected.trigger_name and not t.tgisinternal
 where t.oid is null or t.tgenabled<>'O' or
 regexp_replace(regexp_replace(lower(pg_catalog.pg_get_triggerdef(t.oid)), '[[:space:]]+', ' ', 'g'), ',[[:space:]]*', ',', 'g')<>expected.definition
 ) then
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


 end if;
end $attachments$;
