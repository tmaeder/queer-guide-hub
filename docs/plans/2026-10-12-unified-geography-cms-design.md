# Unified geography CMS

Approved by the user on 12 October 2026.

## Outcome

Replace the separate geography navigation entries with one country-first CMS workspace: Countries → Cities → Queer Villages. Retain existing entity tables, UUIDs, editor compatibility and public routes. Continents and regions remain metadata and filters; landmarks remain associated content.

## Data ownership

`cities.country_id` owns a city's country. `queer_villages.city_id` owns a village's city; its country is derived. Existing `geo_places` mirrors identity and ancestry. Every write path, including ordinary CMS saves, must trigger the same transactional cascade to villages and linked venues, events, hotels and organizations. Recompute safety gates and retain revision history. Use optimistic concurrency for moves as well as editor saves.

## Workflow

Country-first expandable rows, lazy paginated children, global search with full paths, type filters, record selection and the existing CMS editor in the same admin shell. Persist selection and filters in URL state. Show errors with retry, meaningful empty states, keyboard accessible expansion and parent choices with country context. Refresh hierarchy, selected records, counts, verification and dependent query caches after saves.

## Verification

Keep identity, point containment, parent relation and queer significance distinct. Store source URL/version, checked timestamp and a fingerprint of the geographic fields; changes make evidence stale. Use Natural Earth for country checks, Wikidata identity/coordinates/administrative ancestry, and municipal/OSM boundaries where available. A country match or proximity alone never verifies village identity or its queer designation. Ambiguous matches, border cases and disputed territories require review. Default to review for proposed geographic corrections until a clear-match policy is explicitly selected.

## Audit baseline

Read-only production audit: 250 countries, 18,732 cities, 181 villages. 418 cities lack coordinates. No village boundaries or geometry stored. Country/city/village spine identities match canonical rows. All 181 village points pass the current country check. The integrity view reports 62 event-country and 20 venue-village-city conflicts. Shinjuku Ni-chōme's pin is ~3.4 km from Wikidata Q1420043; Metro Center is ~134.8 km from its linked Springfield centre. These are review candidates, not automatic corrections.

## Proof required

Verify direct CMS field edits and tree moves propagate equivalently; a failed move rolls back; stale writes are rejected; coordinate/name/parent changes invalidate evidence; non-admins cannot mutate relationships or verification; search paths and paginated children are complete; existing direct editor links continue to work. Verify desktop/mobile rendering and production data checks before claiming completion.

## Sources

- https://www.wikidata.org/wiki/Property:P625
- https://www.wikidata.org/wiki/Property:P131
- https://www.wikidata.org/wiki/Q1420043
- https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/
- https://operations.osmfoundation.org/policies/nominatim/
- https://www.sftravel.com/neighborhoods/castro
- https://www.esmadrid.com/en/madrid-neighbourhoods/chueca
