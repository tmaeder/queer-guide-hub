-- Backfill legacy trip titles that leak the raw i18n key or are empty/null.
--
-- Earlier build shipped with a code path that could persist the raw
-- translation key `trips.dialog.create.defaultTitle` as the trip title
-- when the user didn't type one. New code resolves a localized value
-- ("Trip to Berlin") before insert, but legacy rows remain.
--
-- Strategy:
--   - If primary_city_name is present: rewrite to "Trip to <city>"
--     (English baseline; render layer still localizes at read time
--      for new rows via resolveTripTitle).
--   - Otherwise: rewrite to "Untitled trip".
-- Render-time defenses in resolveTripTitle stay in place regardless.

UPDATE public.trips
SET title = CASE
  WHEN NULLIF(btrim(primary_city_name), '') IS NOT NULL
    THEN 'Trip to ' || btrim(primary_city_name)
  ELSE 'Untitled trip'
END
WHERE title IS NULL
   OR btrim(title) = ''
   OR title = 'trips.dialog.create.defaultTitle';
