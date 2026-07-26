-- Geo Hierarchy Unification — P2: remaining content entities → satellite PKs.
set local lock_timeout = '10s';
alter table public.festivals drop constraint festivals_city_id_fkey;
alter table public.festivals add constraint festivals_city_id_fkey
  foreign key (city_id) references public.geo_city_profiles(place_id);
alter table public.festivals drop constraint festivals_country_id_fkey;
alter table public.festivals add constraint festivals_country_id_fkey
  foreign key (country_id) references public.geo_country_profiles(place_id);

alter table public.organizations drop constraint organizations_city_id_fkey;
alter table public.organizations add constraint organizations_city_id_fkey
  foreign key (city_id) references public.geo_city_profiles(place_id) on delete set null;
alter table public.organizations drop constraint organizations_country_id_fkey;
alter table public.organizations add constraint organizations_country_id_fkey
  foreign key (country_id) references public.geo_country_profiles(place_id) on delete set null;

alter table public.milestones drop constraint milestones_city_id_fkey;
alter table public.milestones add constraint milestones_city_id_fkey
  foreign key (city_id) references public.geo_city_profiles(place_id) on delete set null;
alter table public.milestones drop constraint milestones_country_id_fkey;
alter table public.milestones add constraint milestones_country_id_fkey
  foreign key (country_id) references public.geo_country_profiles(place_id) on delete set null;

alter table public.personalities drop constraint personalities_city_id_fkey;
alter table public.personalities add constraint personalities_city_id_fkey
  foreign key (city_id) references public.geo_city_profiles(place_id);
alter table public.personalities drop constraint personalities_death_city_id_fkey;
alter table public.personalities add constraint personalities_death_city_id_fkey
  foreign key (death_city_id) references public.geo_city_profiles(place_id);
alter table public.personalities drop constraint personalities_country_id_fkey;
alter table public.personalities add constraint personalities_country_id_fkey
  foreign key (country_id) references public.geo_country_profiles(place_id);
alter table public.personalities drop constraint personalities_death_country_id_fkey;
alter table public.personalities add constraint personalities_death_country_id_fkey
  foreign key (death_country_id) references public.geo_country_profiles(place_id);

alter table public.flyer_scans drop constraint flyer_scans_matched_city_id_fkey;
alter table public.flyer_scans add constraint flyer_scans_matched_city_id_fkey
  foreign key (matched_city_id) references public.geo_city_profiles(place_id);
alter table public.flyer_scans drop constraint flyer_scans_matched_country_id_fkey;
alter table public.flyer_scans add constraint flyer_scans_matched_country_id_fkey
  foreign key (matched_country_id) references public.geo_country_profiles(place_id);

alter table public.ingestion_events drop constraint ingestion_events_city_id_fkey;
alter table public.ingestion_events add constraint ingestion_events_city_id_fkey
  foreign key (city_id) references public.geo_city_profiles(place_id) on delete set null;
alter table public.ingestion_events drop constraint ingestion_events_country_id_fkey;
alter table public.ingestion_events add constraint ingestion_events_country_id_fkey
  foreign key (country_id) references public.geo_country_profiles(place_id) on delete set null;

alter table public.news_article_cities drop constraint news_article_cities_city_id_fkey;
alter table public.news_article_cities add constraint news_article_cities_city_id_fkey
  foreign key (city_id) references public.geo_city_profiles(place_id) on delete cascade;
alter table public.news_article_countries drop constraint news_article_countries_country_id_fkey;
alter table public.news_article_countries add constraint news_article_countries_country_id_fkey
  foreign key (country_id) references public.geo_country_profiles(place_id) on delete cascade;

alter table public.guides drop constraint guides_city_id_fkey;
alter table public.guides add constraint guides_city_id_fkey
  foreign key (city_id) references public.geo_city_profiles(place_id) on delete set null;
