-- `national_day` held a `date`, but the real-world fact is a *named recurring day*
-- ("German Unity Day, 3 October") — a date column forces a fabricated year and
-- throws the holiday name away. Both columns are 100% NULL, so this is a
-- zero-risk type change.
--
-- `countries` and `geo_country_profiles` must change together: the geo-spine
-- dual-write trigger (`trg_sync_geo_spine`, 20260725112333) copies this column
-- straight across, so a one-sided ALTER would break every country write.
--
-- Also retires a live CMS type-drift bug: src/config/contentTypes/country.ts has
-- always declared national_day as `type: 'text'` against this date column.
--
-- Applied live via MCP apply_migration; filename carries the version the remote
-- history actually stamped (see CLAUDE.md § Migrations).

alter table public.countries
  alter column national_day type text using national_day::text;

alter table public.geo_country_profiles
  alter column national_day type text using national_day::text;

comment on column public.countries.national_day is
  'Named national day / independence holiday, e.g. "German Unity Day, 3 October". Free text, not a date — the fact is recurring and carries a name.';
