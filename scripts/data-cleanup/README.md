# Data-cleanup migrations

One-off SQL scripts for backfills / normalisations that don't fit the regular
Supabase migration flow (which lives outside this repo per the gitignore).

Each file is named `YYYY-MM-DD_<purpose>.sql` and is meant to be applied via
the Supabase MCP `apply_migration` tool after a human has read the SQL in
full. **None of these run automatically.**

## Active scripts

| Date       | Script                                  | Notes |
|------------|-----------------------------------------|-------|
| 2026-05-03 | `2026-05-03_search_data_quality.sql`    | Bug #15. Normalises `venues.country`/`events.country` to ISO 3166-1 alpha-2. NULLs out empty/`'0'` city values. Adds CHECK constraints. ~50k rows touched. |

## Apply checklist

1. Read the SQL top to bottom.
2. Snapshot the affected tables: `pg_dump --table=venues --table=events`.
3. Apply via MCP: `apply_migration(project_id, name, query)`.
4. Compare row counts before/after.
5. Spot-check a few rows you expect changed.
