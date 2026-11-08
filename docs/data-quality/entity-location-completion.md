# Entity location completion

Production: Queer-Guide-1 (`xqeacpakadqfxjxjcewc`). Started 12 October 2026.

Organizations own business identity; venues and hotels own individual physical locations.
Marketplace brands, merchants and affiliate partners reference their organization. Do not copy
one branch's location onto other branches, use city centres as venue coordinates, or infer
headquarters from a product's merchant URL.

## Automatic completion

- Missing organization location fields inherit immediately from their linked primary venue,
  or their sole venue/hotel if they have no primary venue. Existing values and conflicting
  city/country/address evidence are preserved.
- Timezone is stored on organizations, venues and hotels. Known city timezones fill on save;
  coordinate-based timezones use the pinned `tz-lookup` dataset.
- An explicit business website/domain can link a brand, merchant or partner to a unique
  organization. Ambiguous domains stay unlinked. An unmatched domain creates a draft identity,
  without publishing it or inventing its physical address.
- Missing location fields enqueue `entity_location_jobs`. A debounced database webhook wakes
  `complete-entity-location`; the registered `entity_location_completion` cron retries each minute.
  A global 60-second lease prevents concurrent geocoder runs. Fresh edits have priority 0;
  historical backfill jobs have priority 10.
- The worker uses official-site Organization/LocalBusiness JSON-LD postal addresses and Photon
  OpenStreetMap geocoding. Forward matches require street, house number, locality and country
  corroboration. Reverse results must be within 250 metres and cannot contradict country/postcode.
- External evidence writes are atomic, fill blank/null fields only, and require an unchanged
  location fingerprint. `entity_location_audit` stores source, previous record and exact patch.
- Transient errors retry with backoff up to four attempts. No matches are retained as explicit
  outcomes; changed address evidence automatically reopens the job. Unsupported addresses and
  territories without postcodes remain blank.

## Backfill

The runner reads a Supabase CLI token from macOS Keychain or `SUPABASE_PAT`. Secrets never print.
Install `tz-lookup@6.1.25` into a separate runtime and point `LOCATION_TZ_MODULE` to it, or use an
existing installation. The production worker itself uses a pinned Deno npm import.

```sh
LOCATION_TZ_MODULE=/path/to/node_modules/tz-lookup node scripts/data-quality/complete-entity-locations.mjs --prepare
LOCATION_TZ_MODULE=/path/to/node_modules/tz-lookup node scripts/data-quality/complete-entity-locations.mjs --timezone-residue
LOCATION_TZ_MODULE=/path/to/node_modules/tz-lookup node scripts/data-quality/complete-entity-locations.mjs --official-evidence
LOCATION_TZ_MODULE=/path/to/node_modules/tz-lookup node scripts/data-quality/complete-entity-locations.mjs --country-repair
LOCATION_TZ_MODULE=/path/to/node_modules/tz-lookup node scripts/data-quality/complete-entity-locations.mjs --drain
```

`--prepare` fills timezones, propagates source location data, and queues remaining gaps. Set
`LOCATION_VENUE_CURSOR` to the last successfully logged venue UUID to resume an interrupted pass.
Deadlocks and transient Management API failures retry automatically. Statements are transactional.
`--official-evidence` applies the checked-in partner legal-address evidence with source URLs,
using current entity links instead of hardcoded database IDs. `--drain` invokes the deployed worker;
the same global lease protects it against concurrent cron invocations. Cron also drains without a
local runner. Reports write to `LOCATION_REPORT_DIR` or the workspace output directory.

`--timezone-residue` uses known city coordinates only for timezone lookup and parks rows that
have a city/country/timezone but no numbered street address. It does not stamp a city centre as
the business's map pin. `--country-repair` reviews source-country contradictions against a fresh
external geocode and only applies corroborated corrections. Border locations and two-letter state
abbreviations can remain unresolved. The report records each outcome for manual review.

Country, city and coordinate consistency is enforced on events, venues, hotels and organizations.
The city resolver prefers a candidate near supplied coordinates and rejects a remote namesake.
The event page uses the event's own country for its label, link and safety information. The
Saint-Denis example at `/events/apero-friendly-1` is linked to Saint-Denis, France. A verified
publisher cohort assigned to Santa Fe, Argentina or Santa Cruz, Bolivia was relinked to its US
namesakes; false city-centre pins were retracted. `run_event_geo_fill` preserves those retractions.

Production backfill is long-running. `--drain` tolerates transient worker errors and resumes from
durable queue state. A `no_match` outcome means the current evidence cannot safely determine a
physical address. New location evidence reopens the job automatically.

```sql
select entity_table,status,count(*),max(last_error)
from entity_location_jobs group by 1,2 order by 1,2;
select entity_table,count(distinct id) records,count(key) fields
from entity_location_audit cross join lateral jsonb_object_keys(patch) key group by 1;
```

## Verification

- Node evidence tests cover address contradictions, city/street-centroid refusal, invalid coordinates,
  reverse distance, JSON-LD extraction, unrelated product addresses and ambiguous business branches.
- Deno checks the deployed function. `deno.lock` pins the timezone package and integrity hash.
- Transactional production assertions verified null-only writes, stale-evidence refusal, immediate
  organization inheritance and service-only RPC access. Test data changes rolled back.
- Queue/audit/lease tables have RLS, explicit service-only policies and revoked public grants.
