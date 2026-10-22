-- Codify the 23 review_geo_reopen_* triggers that 20261022180826_review_automatic_resolution
-- creates inside a dynamic `execute format('create trigger %I ...')` loop. The loop works,
-- but check-schema-object-drift.mjs matches literal `create trigger <name>` text, so every
-- open PR read these as hand-attached triggers and failed the gate.
--
-- Create-if-missing rather than drop + recreate: every trigger already exists on prod with
-- exactly this definition (read off pg_get_triggerdef on 2026-10-22), so applying this file
-- changes nothing there and takes no ACCESS EXCLUSIVE lock on venues/events/etc. On a
-- rebuild from zero the loop has already created them and this block is a no-op too.
do $codify$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.cities'::regclass and tgname = 'review_geo_reopen_id' and not tgisinternal) then
    create trigger review_geo_reopen_id after insert or update of shell_status, seo_indexable, duplicate_of_id on public.cities
      for each row execute function api_private.review_reopen_geography('id');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.city_favorites'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.city_favorites
      for each row execute function api_private.review_reopen_geography('city_id');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.competition_editions'::regclass and tgname = 'review_geo_reopen_host_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_host_city_id after insert or update of host_city_id on public.competition_editions
      for each row execute function api_private.review_reopen_geography('host_city_id');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.competition_entrants'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.competition_entrants
      for each row execute function api_private.review_reopen_geography('city_id');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.events'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.events
      for each row execute function api_private.review_reopen_geography('city_id');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.festivals'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.festivals
      for each row execute function api_private.review_reopen_geography('city_id');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.geo_places'::regclass and tgname = 'review_geo_reopen_parent_id' and not tgisinternal) then
    create trigger review_geo_reopen_parent_id after insert or update of parent_id on public.geo_places
      for each row execute function api_private.review_reopen_geography('parent_id');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.guides'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.guides
      for each row execute function api_private.review_reopen_geography('city_id');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.hotels'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.hotels
      for each row execute function api_private.review_reopen_geography('city_id');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.intimate_cruising_mode'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.intimate_cruising_mode
      for each row execute function api_private.review_reopen_geography('city_id');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.milestones'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.milestones
      for each row execute function api_private.review_reopen_geography('city_id');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.news_article_cities'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.news_article_cities
      for each row execute function api_private.review_reopen_geography('city_id');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.news_articles'::regclass and tgname = 'review_geo_reopen_city_ids' and not tgisinternal) then
    create trigger review_geo_reopen_city_ids after insert or update of city_ids on public.news_articles
      for each row execute function api_private.review_reopen_geography('city_ids');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.organizations'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.organizations
      for each row execute function api_private.review_reopen_geography('city_id');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.personalities'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.personalities
      for each row execute function api_private.review_reopen_geography('city_id');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.personalities'::regclass and tgname = 'review_geo_reopen_death_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_death_city_id after insert or update of death_city_id on public.personalities
      for each row execute function api_private.review_reopen_geography('death_city_id');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.queer_villages'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.queer_villages
      for each row execute function api_private.review_reopen_geography('city_id');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.reservations'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.reservations
      for each row execute function api_private.review_reopen_geography('city_id');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.trip_destinations'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.trip_destinations
      for each row execute function api_private.review_reopen_geography('city_id');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.trip_places'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.trip_places
      for each row execute function api_private.review_reopen_geography('city_id');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.user_place_marks'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.user_place_marks
      for each row execute function api_private.review_reopen_geography('city_id');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.user_presence_location'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.user_presence_location
      for each row execute function api_private.review_reopen_geography('city_id');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.venues'::regclass and tgname = 'review_geo_reopen_city_id' and not tgisinternal) then
    create trigger review_geo_reopen_city_id after insert or update of city_id on public.venues
      for each row execute function api_private.review_reopen_geography('city_id');
  end if;
end
$codify$;

do $verify$
declare v_missing text;
begin
  select string_agg(format('%s.%s', x.t, x.g), ', ') into v_missing
  from (values
    ('cities','review_geo_reopen_id'),
    ('city_favorites','review_geo_reopen_city_id'),
    ('competition_editions','review_geo_reopen_host_city_id'),
    ('competition_entrants','review_geo_reopen_city_id'),
    ('events','review_geo_reopen_city_id'),
    ('festivals','review_geo_reopen_city_id'),
    ('geo_places','review_geo_reopen_parent_id'),
    ('guides','review_geo_reopen_city_id'),
    ('hotels','review_geo_reopen_city_id'),
    ('intimate_cruising_mode','review_geo_reopen_city_id'),
    ('milestones','review_geo_reopen_city_id'),
    ('news_article_cities','review_geo_reopen_city_id'),
    ('news_articles','review_geo_reopen_city_ids'),
    ('organizations','review_geo_reopen_city_id'),
    ('personalities','review_geo_reopen_city_id'),
    ('personalities','review_geo_reopen_death_city_id'),
    ('queer_villages','review_geo_reopen_city_id'),
    ('reservations','review_geo_reopen_city_id'),
    ('trip_destinations','review_geo_reopen_city_id'),
    ('trip_places','review_geo_reopen_city_id'),
    ('user_place_marks','review_geo_reopen_city_id'),
    ('user_presence_location','review_geo_reopen_city_id'),
    ('venues','review_geo_reopen_city_id')
  ) as x(t, g)
  where not exists (
    select 1 from pg_trigger tr
    where tr.tgrelid = ('public.' || x.t)::regclass and tr.tgname = x.g and not tr.tgisinternal
  );
  if v_missing is not null then
    raise exception 'review_geo_reopen triggers missing after codify: %', v_missing;
  end if;
end
$verify$;
