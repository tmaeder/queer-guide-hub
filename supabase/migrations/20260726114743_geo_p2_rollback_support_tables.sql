-- P2 ROLLBACK 1/4: PostgREST embeds (cities:city_id(...)) resolve via FK metadata;
-- re-pointed FKs broke venue/event/hotel joins in prod. Restore original targets.
-- Lesson recorded in docs/plans/2026-07-25-geo-hierarchy-unification.md: FK flips
-- for embed-referenced tables require the client embed migration (P5) FIRST.
set local lock_timeout = '10s';
alter table public.city_aliases drop constraint city_aliases_city_id_fkey;
alter table public.city_aliases add constraint city_aliases_city_id_fkey
  foreign key (city_id) references public.cities(id) on delete cascade;
alter table public.city_climate_monthly drop constraint city_climate_monthly_city_id_fkey;
alter table public.city_climate_monthly add constraint city_climate_monthly_city_id_fkey
  foreign key (city_id) references public.cities(id) on delete cascade;
alter table public.city_consensus_audit drop constraint city_consensus_audit_city_id_fkey;
alter table public.city_consensus_audit add constraint city_consensus_audit_city_id_fkey
  foreign key (city_id) references public.cities(id) on delete set null;
alter table public.city_coverage_gaps drop constraint city_coverage_gaps_city_id_fkey;
alter table public.city_coverage_gaps add constraint city_coverage_gaps_city_id_fkey
  foreign key (city_id) references public.cities(id) on delete cascade;
alter table public.city_merge_audit drop constraint city_merge_audit_keep_id_fkey;
alter table public.city_merge_audit add constraint city_merge_audit_keep_id_fkey
  foreign key (keep_id) references public.cities(id) on delete cascade;
alter table public.city_merge_audit drop constraint city_merge_audit_drop_id_fkey;
alter table public.city_merge_audit add constraint city_merge_audit_drop_id_fkey
  foreign key (drop_id) references public.cities(id) on delete cascade;
alter table public.city_quality_signals drop constraint city_quality_signals_city_id_fkey;
alter table public.city_quality_signals add constraint city_quality_signals_city_id_fkey
  foreign key (city_id) references public.cities(id) on delete cascade;
alter table public.city_review_queue drop constraint city_review_queue_city_id_fkey;
alter table public.city_review_queue add constraint city_review_queue_city_id_fkey
  foreign key (city_id) references public.cities(id) on delete cascade;
alter table public.event_coverage_gaps drop constraint event_coverage_gaps_city_id_fkey;
alter table public.event_coverage_gaps add constraint event_coverage_gaps_city_id_fkey
  foreign key (city_id) references public.cities(id) on delete cascade;
alter table public.geo_sources drop constraint geo_sources_city_id_fkey;
alter table public.geo_sources add constraint geo_sources_city_id_fkey
  foreign key (city_id) references public.cities(id) on delete cascade;
alter table public.geo_sources drop constraint geo_sources_country_id_fkey;
alter table public.geo_sources add constraint geo_sources_country_id_fkey
  foreign key (country_id) references public.countries(id) on delete cascade;
alter table public.country_slug_redirects drop constraint country_slug_redirects_country_id_fkey;
alter table public.country_slug_redirects add constraint country_slug_redirects_country_id_fkey
  foreign key (country_id) references public.countries(id) on delete cascade;
alter table public.source_coverage_targets drop constraint source_coverage_targets_city_id_fkey;
alter table public.source_coverage_targets add constraint source_coverage_targets_city_id_fkey
  foreign key (city_id) references public.cities(id) on delete cascade;
alter table public.village_coverage_gaps drop constraint village_coverage_gaps_village_id_fkey;
alter table public.village_coverage_gaps add constraint village_coverage_gaps_village_id_fkey
  foreign key (village_id) references public.queer_villages(id) on delete cascade;
alter table public.village_quality_signals drop constraint village_quality_signals_village_id_fkey;
alter table public.village_quality_signals add constraint village_quality_signals_village_id_fkey
  foreign key (village_id) references public.queer_villages(id) on delete cascade;
alter table public.village_review_queue drop constraint village_review_queue_village_id_fkey;
alter table public.village_review_queue add constraint village_review_queue_village_id_fkey
  foreign key (village_id) references public.queer_villages(id) on delete cascade;
alter table public.village_slug_redirects drop constraint village_slug_redirects_village_id_fkey;
alter table public.village_slug_redirects add constraint village_slug_redirects_village_id_fkey
  foreign key (village_id) references public.queer_villages(id) on delete cascade;
