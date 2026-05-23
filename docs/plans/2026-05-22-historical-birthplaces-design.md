# Historical Birthplaces for Personalities

Date: 2026-05-22
Status: Approved (design only — implementation pending)

## Problem

Personalities table stores `birth_place` (text) + `city_id` + `country_id`. Cities and countries are modeled as current entities only. Many LGBTQ+ historical figures were born in places that no longer exist under that name or under that political entity:

- Ost-Berlin / West-Berlin (1949–1990, DDR / BRD)
- Leningrad / Petrograd → Sankt Petersburg
- Königsberg → Kaliningrad
- Danzig → Gdańsk
- Konstantinopel → Istanbul
- Bombay → Mumbai, Madras → Chennai
- Saigon → Ho-Chi-Minh-Stadt
- Stalingrad / Tsaritsyn → Wolgograd
- Lemberg → Lwiw, Breslau → Wrocław
- Plus historical countries: Persien, Burma, Ceylon, Rhodesien, Jugoslawien, ČSSR, Österreich-Ungarn, Osmanisches Reich

Today "Geboren in Berlin, Deutschland" is shown for someone born in 1955 in Ost-Berlin — historically wrong, politically flattening.

## Goal

Full historical modeling: display the period-correct city + country name, allow filtering ("Personen aus der DDR"), without splitting cities into multiple canonical rows.

## Design

### Schema change

```sql
ALTER TABLE cities ADD COLUMN historical_names jsonb NOT NULL DEFAULT '[]';
```

Entry shape:

```json
{
  "name_de": "Ost-Berlin",
  "name_en": "East Berlin",
  "country_name_de": "Deutsche Demokratische Republik",
  "country_name_en": "German Democratic Republic",
  "country_code": "DDR",
  "valid_from": "1949-10-07",
  "valid_to":   "1990-10-03",
  "region":     "east"
}
```

`region` is optional, used only for geographically divided cities (Berlin, Jerusalem). All other fields required.

Example — Berlin:

```json
[
  {"name_de":"Ost-Berlin","name_en":"East Berlin","country_name_de":"DDR","country_code":"DDR","valid_from":"1949-10-07","valid_to":"1990-10-03","region":"east"},
  {"name_de":"West-Berlin","name_en":"West Berlin","country_name_de":"BRD","country_code":"BRD","valid_from":"1949-05-23","valid_to":"1990-10-03","region":"west"},
  {"name_de":"Berlin","name_en":"Berlin","country_name_de":"Deutsches Reich","country_code":"DR","valid_from":"1871-01-18","valid_to":"1945-05-08"}
]
```

### Personalities — no new columns

- `birth_place` (text) stays as-is — raw input ("Ost-Berlin", "Leningrad")
- `city_id` always points at the current canonical city (Berlin, Sankt Petersburg)
- `birth_date` drives disambiguation
- No new columns on `personalities`

### Resolver

```sql
CREATE OR REPLACE FUNCTION resolve_historical_place(
  p_city_id   uuid,
  p_birth_place text,
  p_birth_date  date,
  p_locale      text DEFAULT 'de'
) RETURNS TABLE(display_name text, display_country text)
```

Logic, in order:

1. **Exact-name match** — `p_birth_place` ILIKE any `historical_names[].name_de` OR `name_en` → return that entry's localized name + country
2. **Date-interval match** — first entry where `p_birth_date BETWEEN valid_from AND valid_to` → return localized name + country
3. **Current fallback** — `cities.name` + `countries.name` (today's values)

Returns NULL pair if no `p_city_id`.

TS helper mirrors the same logic for client-side rendering when data is preloaded.

### Search / input flow

The existing `city_aliases` table is the search index. Add a trigger that, on `cities.historical_names` insert/update, mirrors each `name_de` and `name_en` into `city_aliases` (alias_type = `'historical'`).

- Admin types "Leningrad" → existing `personality_city_auto_create` trigger hits the alias → resolves to Sankt Petersburg's `city_id`
- `birth_place` keeps the raw "Leningrad" text — used later by the resolver for display

### Display

Personality detail page:

```
Geboren: 12. März 1955 in Ost-Berlin, DDR
                          ▔▔▔▔▔▔▔▔▔▔▔▔▔  ← resolved via historical_names
```

Optional tooltip: "heute Berlin, Deutschland" with link to current city.

### Filtering

"Personen aus der DDR":

```sql
SELECT p.*
FROM personalities p
JOIN cities c ON c.id = p.city_id
WHERE c.historical_names @? '$[*] ? (@.country_code == "DDR")'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(c.historical_names) e
    WHERE e->>'country_code' = 'DDR'
      AND p.birth_date BETWEEN (e->>'valid_from')::date AND (e->>'valid_to')::date
  );
```

Index: `CREATE INDEX idx_cities_historical_names ON cities USING GIN (historical_names jsonb_path_ops);`

## Seed data

One migration seeds the ~20 highest-impact cases. Manual curation; not auto-generated.

Berlin · Sankt Petersburg (Petrograd/Leningrad) · Wolgograd (Tsaritsyn/Stalingrad) · Kaliningrad (Königsberg) · Gdańsk (Danzig) · Wrocław (Breslau) · Istanbul (Konstantinopel) · Mumbai (Bombay) · Chennai (Madras) · Kolkata (Calcutta) · Ho-Chi-Minh-Stadt (Saigon) · Lwiw (Lemberg) · Yangon (Rangoon) · Sri-Lanka-Städte (Ceylon) · Iran-Städte (Persien) · Jugoslawien-Städte · ČSSR-Städte · Österreich-Ungarn-Städte · Osmanisches Reich · Preußische Städte.

## Out of scope (YAGNI)

- Separate `historical_countries` table
- `successor_id` chains between countries
- Geo-polygons for historical states
- Auto-detection from `birth_date` without admin input
- Full historical GIS

## Deliverables

1. Migration: `ALTER TABLE cities ADD historical_names jsonb`, GIN index, seed data for the ~20 cities
2. `resolve_historical_place()` SQL function
3. Trigger: mirror `historical_names` → `city_aliases`
4. TS helper `resolveHistoricalPlace()` in `src/lib/`
5. Personality detail page: swap birthplace display to use resolver
6. Admin filter chip "Historischer Staat" with DDR / UdSSR / Osmanisches Reich / Österreich-Ungarn / Jugoslawien

Estimated effort: half a day.
