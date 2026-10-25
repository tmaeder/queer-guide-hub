# Stop generic stock photos becoming event artwork

A measured reuse cluster contains 454 event records sharing one photograph, including unrelated yoga and community-meeting listings. Independently, two legacy producers still accept generic location-related stock searches for events: `queer-imagery-backfill` and the event batch in `fetch-images`. Such matches do not establish ownership by an event or occurrence.

Retire event stock mode in both authenticated endpoints and the operator driver, remove its database-selector branch and consolidate only the legacy hourly event-stock job. Existing callers receive a clear conflict response naming the source-owned `event-image-backfill` worker. Its active registry row and schedule are required before consolidation. City/country imagery, archival milestones, other stock modes and all existing event images remain unchanged. No old image is removed merely because it is reused.

Production containment: the legacy event stock job was paused and its single schedule removed through the native scheduler. A digest assertion verified all other schedules unchanged. The source-owned event job remains active. Permanent registry consolidation and selector changes use the normal immutable migration deployment.

Validation: an authenticated HTTP integration test exercises both event-stock endpoints, including force/dry-run aliases, before any selection, provider request or storage write; unauthenticated requests remain rejected. City/country/milestone modes still reach their original selector. Disposable PostgreSQL cases cover an active legacy schedule, the already-paused production state and a missing canonical replacement; other selector results, schedules, registry rows, event data and service-role permissions remain intact. A missing replacement rolls the migration back atomically.

Entrypoint type checking also aligns the existing image-source type aliases, reuses the runtime service client's type and handles unambiguous joined place names. Image scoring weights and thresholds are unchanged.

The PR critical-path snapshot omits private automation state. Before applying this still-pending migration, its local-only fixture builder supplies exactly the two artwork registry dependencies and a `select 1` canonical cron command. It reads no production automation records or secrets and makes no network calls. The workflow skips this fixture once the snapshot includes the migration version, so later runs cannot resurrect the retired producer. The isolated PostgreSQL suite exercises this exact generated SQL before applying the real migration; production replacement-owner checks stay intact.

Keep the local migration seed in its own CLI module. The snapshot exporter and manifest are unchanged, so its existing encrypted snapshot remains valid; changing a migration prerequisite must not trigger an unnecessary live-production snapshot rebuild. The full local migration and critical-path tests still run.
