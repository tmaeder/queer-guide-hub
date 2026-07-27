-- Geo Hierarchy Unification — P3: relocate the search-sync triggers onto the spine.
--
-- Why now: views cannot carry row triggers, so these MUST leave cities/countries/
-- queer_villages before the P4 swap. Moving them incrementally (each verified)
-- shrinks the P4 freeze window, which is the riskiest step of the programme.
--
-- Why it is safe: the dual-write trigger propagates every typed-table row write
-- to geo_places inside the SAME transaction, so the spine write is what fires
-- the indexer — the same firing frequency as before, one index pass per write.
-- The indexer bodies still read the typed tables (unchanged); at P4 those reads
-- transparently follow the tables into views. Pattern mirrors the landmark
-- triggers from 20260725113227.
--
-- Verified live (rolled back): city/country/village description edits each
-- reindexed their search_documents row; doc counts unchanged afterwards.

drop trigger if exists trg_search_documents_city on public.cities;
drop trigger if exists trg_search_documents_country on public.countries;
drop trigger if exists trg_search_documents_village on public.queer_villages;

create trigger trg_search_documents_city_ins
  after insert or update on public.geo_places
  for each row when (new.place_type = 'city')
  execute function public.search_documents_sync('city');
create trigger trg_search_documents_city_del
  after delete on public.geo_places
  for each row when (old.place_type = 'city')
  execute function public.search_documents_sync('city');

create trigger trg_search_documents_country_ins
  after insert or update on public.geo_places
  for each row when (new.place_type = 'country')
  execute function public.search_documents_sync('country');
create trigger trg_search_documents_country_del
  after delete on public.geo_places
  for each row when (old.place_type = 'country')
  execute function public.search_documents_sync('country');

create trigger trg_search_documents_village_ins
  after insert or update on public.geo_places
  for each row when (new.place_type = 'village')
  execute function public.search_documents_sync('queer_village');
create trigger trg_search_documents_village_del
  after delete on public.geo_places
  for each row when (old.place_type = 'village')
  execute function public.search_documents_sync('queer_village');
