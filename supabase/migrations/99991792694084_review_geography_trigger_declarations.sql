-- 2026-10-22: the drop/create pairs below were rewritten as create-if-missing. As
-- drop+create they needed ACCESS EXCLUSIVE on cities/venues/events/... and timed out
-- (55P03) on four consecutive deploys, blocking every later migration on prod. The
-- triggers already existed live with these definitions; a fresh rebuild still creates
-- them. Same pattern as 99991792694100.
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

do $t$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.cities'::regclass and tgname = 'review_geo_reopen_id' and not tgisinternal) then
    create trigger review_geo_reopen_id after insert or update of shell_status,seo_indexable,duplicate_of_id on public.cities
 for each row execute function api_private.review_reopen_geography('id');
  end if;
end $t$;

do $t$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.geo_places'::regclass and tgname = 'review_geo_reopen_parent_id' and not tgisinternal) then
    create trigger review_geo_reopen_parent_id after insert or update of parent_id on public.geo_places
 for each row execute function api_private.review_reopen_geography('parent_id');
  end if;
end $t$;

do $t$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.venues'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.venues
 for each row execute function api_private.review_reopen_geography('city_id');
  end if;
end $t$;

do $t$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.events'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.events
 for each row execute function api_private.review_reopen_geography('city_id');
  end if;
end $t$;

do $t$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.organizations'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.organizations
 for each row execute function api_private.review_reopen_geography('city_id');
  end if;
end $t$;

do $t$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.hotels'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.hotels
 for each row execute function api_private.review_reopen_geography('city_id');
  end if;
end $t$;

do $t$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.queer_villages'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.queer_villages
 for each row execute function api_private.review_reopen_geography('city_id');
  end if;
end $t$;

do $t$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.news_article_cities'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.news_article_cities
 for each row execute function api_private.review_reopen_geography('city_id');
  end if;
end $t$;

do $t$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.news_articles'::regclass and tgname = 'review_geo_reopen_city_ids' and not tgisinternal) then
    create trigger review_geo_reopen_city_ids after insert or update of city_ids on public.news_articles
 for each row execute function api_private.review_reopen_geography('city_ids');
  end if;
end $t$;

do $t$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.personalities'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.personalities
 for each row execute function api_private.review_reopen_geography('city_id');
  end if;
end $t$;

do $t$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.personalities'::regclass and tgname = 'review_geo_reopen_death_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_death_city_id after insert or update of death_city_id on public.personalities
 for each row execute function api_private.review_reopen_geography('death_city_id');
  end if;
end $t$;

do $t$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.festivals'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.festivals
 for each row execute function api_private.review_reopen_geography('city_id');
  end if;
end $t$;

do $t$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.guides'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.guides
 for each row execute function api_private.review_reopen_geography('city_id');
  end if;
end $t$;

do $t$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.milestones'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.milestones
 for each row execute function api_private.review_reopen_geography('city_id');
  end if;
end $t$;

do $t$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.competition_editions'::regclass and tgname = 'review_geo_reopen_host_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_host_city_id after insert or update of host_city_id on public.competition_editions
 for each row execute function api_private.review_reopen_geography('host_city_id');
  end if;
end $t$;

do $t$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.competition_entrants'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.competition_entrants
 for each row execute function api_private.review_reopen_geography('city_id');
  end if;
end $t$;

do $t$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.trip_destinations'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.trip_destinations
 for each row execute function api_private.review_reopen_geography('city_id');
  end if;
end $t$;

do $t$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.trip_places'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.trip_places
 for each row execute function api_private.review_reopen_geography('city_id');
  end if;
end $t$;

do $t$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.reservations'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.reservations
 for each row execute function api_private.review_reopen_geography('city_id');
  end if;
end $t$;

do $t$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.city_favorites'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.city_favorites
 for each row execute function api_private.review_reopen_geography('city_id');
  end if;
end $t$;

do $t$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.user_place_marks'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.user_place_marks
 for each row execute function api_private.review_reopen_geography('city_id');
  end if;
end $t$;

do $t$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.user_presence_location'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.user_presence_location
 for each row execute function api_private.review_reopen_geography('city_id');
  end if;
end $t$;

do $t$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.intimate_cruising_mode'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.intimate_cruising_mode
 for each row execute function api_private.review_reopen_geography('city_id');
  end if;
end $t$;

