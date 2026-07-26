-- P2 ROLLBACK 4/4: user + trip layer.
set local lock_timeout = '10s';
alter table public.reservations drop constraint reservations_city_id_fkey;
alter table public.reservations add constraint reservations_city_id_fkey
  foreign key (city_id) references public.cities(id);
alter table public.reservations drop constraint reservations_country_id_fkey;
alter table public.reservations add constraint reservations_country_id_fkey
  foreign key (country_id) references public.countries(id);

alter table public.trip_destinations drop constraint trip_destinations_city_id_fkey;
alter table public.trip_destinations add constraint trip_destinations_city_id_fkey
  foreign key (city_id) references public.cities(id) on delete set null;
alter table public.trip_destinations drop constraint trip_destinations_country_id_fkey;
alter table public.trip_destinations add constraint trip_destinations_country_id_fkey
  foreign key (country_id) references public.countries(id) on delete set null;
alter table public.trip_destinations drop constraint trip_destinations_village_id_fkey;
alter table public.trip_destinations add constraint trip_destinations_village_id_fkey
  foreign key (village_id) references public.queer_villages(id) on delete set null;

alter table public.trip_documents drop constraint trip_documents_country_id_fkey;
alter table public.trip_documents add constraint trip_documents_country_id_fkey
  foreign key (country_id) references public.countries(id);

alter table public.trip_geo_review_queue drop constraint trip_geo_review_queue_resolved_city_id_fkey;
alter table public.trip_geo_review_queue add constraint trip_geo_review_queue_resolved_city_id_fkey
  foreign key (resolved_city_id) references public.cities(id);
alter table public.trip_geo_review_queue drop constraint trip_geo_review_queue_resolved_country_id_fkey;
alter table public.trip_geo_review_queue add constraint trip_geo_review_queue_resolved_country_id_fkey
  foreign key (resolved_country_id) references public.countries(id);

alter table public.trip_places drop constraint trip_places_city_id_fkey;
alter table public.trip_places add constraint trip_places_city_id_fkey
  foreign key (city_id) references public.cities(id) on delete set null;
alter table public.trip_places drop constraint trip_places_country_id_fkey;
alter table public.trip_places add constraint trip_places_country_id_fkey
  foreign key (country_id) references public.countries(id) on delete set null;

alter table public.trips drop constraint trips_primary_city_id_fkey;
alter table public.trips add constraint trips_primary_city_id_fkey
  foreign key (primary_city_id) references public.cities(id) on delete set null;
alter table public.trips drop constraint trips_primary_country_id_fkey;
alter table public.trips add constraint trips_primary_country_id_fkey
  foreign key (primary_country_id) references public.countries(id) on delete set null;

alter table public.user_place_marks drop constraint user_place_marks_city_id_fkey;
alter table public.user_place_marks add constraint user_place_marks_city_id_fkey
  foreign key (city_id) references public.cities(id) on delete set null;

alter table public.user_presence_location drop constraint user_presence_location_city_id_fkey;
alter table public.user_presence_location add constraint user_presence_location_city_id_fkey
  foreign key (city_id) references public.cities(id) on delete set null;
alter table public.user_presence_location drop constraint user_presence_location_country_id_fkey;
alter table public.user_presence_location add constraint user_presence_location_country_id_fkey
  foreign key (country_id) references public.countries(id) on delete set null;

alter table public.user_travel_preferences drop constraint user_travel_preferences_home_city_id_fkey;
alter table public.user_travel_preferences add constraint user_travel_preferences_home_city_id_fkey
  foreign key (home_city_id) references public.cities(id) on delete set null;
alter table public.user_travel_preferences drop constraint user_travel_preferences_home_country_id_fkey;
alter table public.user_travel_preferences add constraint user_travel_preferences_home_country_id_fkey
  foreign key (home_country_id) references public.countries(id) on delete set null;

alter table public.intimate_cruising_mode drop constraint intimate_cruising_mode_city_id_fkey;
alter table public.intimate_cruising_mode add constraint intimate_cruising_mode_city_id_fkey
  foreign key (city_id) references public.cities(id) on delete set null;

alter table public.intimate_profiles drop constraint intimate_profiles_discovery_city_id_fkey;
alter table public.intimate_profiles add constraint intimate_profiles_discovery_city_id_fkey
  foreign key (discovery_city_id) references public.cities(id) on delete set null;
