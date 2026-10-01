# Foursquare free-data sync runbook

This runbook operates the hybrid Foursquare integration: FSQ OS Places supplies
bulk data under Apache-2.0, while the Places API supplies Pro fields within a
hard zero-spend allowance. Premium fields and endpoints are disabled.

## Guardrails

- The CLI defaults to `--dry-run`. Writing requires the explicit `--write` flag.
- The Places API allowance defaults to 500 calls per calendar month with a
  50-call safety margin. The database refuses call 451 and later.
- Only Pro fields are requested. Photos, rating, hours, attributes,
  description, popularity, price, stats, tastes, tips, and veracity rating are
  Premium and are never requested by this zero-spend integration.
- A missing or unreachable budget RPC blocks API calls; it never fails open.
- Generic categories, popularity, proximity, or a search hit do not establish
  LGBTQ+ relevance. New discovery candidates require an explicit queer signal
  and still enter the normal staging/review pipeline.
- Foursquare `remove`, `date_closed`, merge, and unresolved flags create audit
  signals. They never directly delete, hide, merge, or close a venue.
- Keep portal tokens, service keys, raw licensed extracts, and checkpoints out
  of git. Preserve the Apache-2.0 license and Foursquare attribution with every
  derived extract.

Official references:

- [Access FSQ OS Places](https://docs.foursquare.com/data-products/docs/access-fsq-os-places)
- [OS Places schema](https://docs.foursquare.com/data-products/docs/places-os-data-schema)
- [Places Search](https://docs.foursquare.com/fsq-developers-places/reference/place-search)
- [Places Details](https://docs.foursquare.com/fsq-developers-places/reference/place-details)
- [API migration changes](https://docs.foursquare.com/developer/reference/upcoming-changes)

## One-time deployment

Apply the database migration before deploying callers so the budget fails closed
during a partial rollout:

```bash
npx supabase db push
npx supabase functions deploy source-foursquare-free --no-verify-jwt
# Deploys an authenticated no-op that blocks stale callers from reaching the
# billable Premium Photos endpoint.
npx supabase functions deploy venue-photo-foursquare
npx supabase functions deploy enrich-venue
```

Set `FOURSQUARE_API_KEY` only as a Supabase Edge Function secret. The Portal
token is used by the operator's portal/Iceberg or DuckDB session and is not
required by the Edge Function when the export is passed as NDJSON.

Run the database contract test on a migrated non-production database:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/foursquare_free_data.sql
```

## Obtain and retain the free datasets

In Places Portal, enable FSQ OS Places and copy the account-specific catalog or
DuckDB connection snippet. Do not invent a public S3 URL; Portal is the current
access path. Retain these artifacts for each release:

1. The exact Portal release identifier and export query.
2. The category dataset export.
3. A geographically bounded Places snapshot export.
4. Every subsequent delta export, without skipping a release.
5. The provider license/NOTICE and a checksum for each NDJSON file.

Use the table and column names from the Portal-provided snippet. Export one JSON
object per line and preserve the documented field names. A schematic DuckDB
shape is:

```sql
copy (
  select *
  from <portal_catalog>.<schema>.<places_or_delta_table>
  where country = 'CH'
) to '/secure/fsq/places-<release>-CH.ndjson'
  (format json, array false);
```

For global work, partition by country or another bounded geographic unit. Do
not produce a single unbounded file. PMTiles are useful for visual coverage and
gap inspection, but they are not a canonical import path.

## Required order

For a new baseline, process categories, then the snapshot. Thereafter process
each delta release in order. The Edge Function itself orders actions as
`add`, `update`, `merge`, `remove`.

```bash
export SUPABASE_URL='https://<project>.supabase.co'
export SUPABASE_SERVICE_ROLE_KEY='<server-only-key>'
# Recommended for hosted operator runs. This is the same secret used by
# pg_cron/workflow-dispatcher and is sent only to the Edge Function.
export INTERNAL_INVOKE_SECRET='<internal-invocation-secret>'

npx -y deno run --allow-env --allow-net --allow-read --allow-write \
  scripts/data-quality/sync-foursquare-os.ts \
  --stream categories --input /secure/fsq/categories-<release>.ndjson \
  --release-id <release> --dry-run

npx -y deno run --allow-env --allow-net --allow-read --allow-write \
  scripts/data-quality/sync-foursquare-os.ts \
  --stream snapshot --input /secure/fsq/places-<release>-CH.ndjson \
  --release-id <release> --dry-run
```

The service-role key is used for read-only venue matching through REST. When
`INTERNAL_INVOKE_SECRET` is set, the CLI uses it to authenticate Edge Function
calls; otherwise it falls back to the service-role bearer token. This supports
projects where the current API service key and the function runtime's legacy
service-role value differ.

The operator CLI defaults to the stable `source-foursquare-free` function slug.
Set `FOURSQUARE_FUNCTION_NAME` only for an intentional alternate deployment.
The separate slug prevents legacy deploy automation from replacing the guarded
handler while that automation is being retired.

Review every dry-run report before repeating the identical command with
`--write`. Dry-run and write modes use separate checkpoint files. Use an
explicit `--checkpoint` for durable operator storage, and use
`--reset-checkpoint` only when deliberately replaying the same release.

For deltas, normalize the documented rows to this shape if the Portal export
does not already provide it:

```json
{"fsq_place_id":"old-or-current-id","action":"update","place":{"fsq_place_id":"current-id","name":"Example"}}
{"fsq_place_id":"old-id","action":"merge","redirect":"survivor-id","place":{"fsq_place_id":"survivor-id","name":"Example"}}
{"fsq_place_id":"removed-id","action":"remove"}
```

## Acceptance thresholds

Before a country canary is written:

- inspect all proposed auto-match classes in a representative sample;
- require auto-match confidence of at least 0.95;
- confirm ambiguous candidates stay in review;
- confirm generic places without queer evidence are skipped;
- compare address, coordinate, contact, category, and freshness uplift;
- inspect every removal, closure, merge, and unresolved-flag signal;
- estimate API demand and confirm it fits the remaining guarded allowance.

After the canary, query `foursquare_data_health()` and run the nightly health
script. A failed OS stream is an error; no recorded sync is a warning. Continue
country-by-country only if precision and review volume remain acceptable.

```sql
select public.foursquare_data_health();
select * from public.foursquare_sync_state order by stream_key;
select * from public.foursquare_api_budget order by month_start desc;
```

## Recovery

- Correct a failed extract or deployment, then rerun from the last checkpoint.
- Staging writes are idempotent by source identity and preserve raw payloads.
- To replay intentionally, use a new release ID or `--reset-checkpoint` after
  documenting why. Never delete canonical venues to replay provider data.
- If API usage is unexpected, remove/rotate `FOURSQUARE_API_KEY`; the ledger
  still blocks all callers once the safety ceiling is reached.
- If an OS delta is suspect, stop subsequent releases, keep the files and
  checkpoints, and review `foursquare_place_redirects`, staging payloads, and
  `venue_consensus_audit` before resuming.
