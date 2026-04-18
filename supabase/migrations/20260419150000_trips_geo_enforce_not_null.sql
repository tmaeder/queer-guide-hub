-- ============================================================
-- Trip Planning V2: Enforce NOT NULL on primary geo columns.
--
-- Applied after the backfill queue was cleared (1 row resolved:
-- trip "South Korea" → Seoul). From this point forward, every
-- trip must have primary_city_id + primary_country_id set at
-- INSERT time — enforced by the CreateTripDialog UI and the
-- useTrips CreateTripInput type.
-- ============================================================

ALTER TABLE public.trips ALTER COLUMN primary_city_id SET NOT NULL;
ALTER TABLE public.trips ALTER COLUMN primary_country_id SET NOT NULL;
