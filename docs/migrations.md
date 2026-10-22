# Migrations

## Layout

```
supabase/migrations/
├── 00000000000000_baseline.sql    # Production schema snapshot (2026-05-02)
├── 20260101*.sql                   # 2026 migrations applied on top of baseline
├── 20260201*.sql
├── ...
└── _archive/                       # Historical pre-2026 migrations (408 files)
    ├── 20250713*.sql
    ├── ...
    └── 20251231*.sql
```

## Quick reference

| Task | Command |
|---|---|
| Production-shaped local DB | Load the nightly snapshot: `scripts/ci/db-snapshot.sh load <db-url> <dir>` (see below) |
| Add a new migration | `supabase migration new <name>` |
| Inspect what's applied to prod | Supabase dashboard → Database → Migrations |
| Schema diff against prod | `supabase db diff --linked` |

## The baseline does not build a new environment

The baseline was meant to make `supabase db reset` reproduce production.
**It never did, and this was verified on 2026-10-22** (PR #4556): replaying
the baseline plus every later file on an empty local Supabase fails on
**957 of 2,450 files**, even after creating production's dashboard-enabled
extensions and the legacy Algolia roles first. Causes:

- The baseline is a dump that was never executed; it assumes objects created
  outside migrations.
- Migration file versions do not reflect apply order. Many files were applied
  live (MCP, dashboard) against a production state that no longer exists.
- Skipping files dated before the baseline made it worse (992 failures).

Do not spend time making the full replay work. Use the snapshot.

## Production-shaped databases: the nightly snapshot

`.github/workflows/db-snapshot.yml` runs nightly on `main`:

- `supabase db dump` of the production schema and roles;
- the migration versions applied in production;
- a data subset read **as the `anon` role**, so RLS limits it to rows anyone
  can already read on queer.guide. Tables up to 20 MB are copied whole,
  larger ones capped at 3,000 rows.

It is encrypted with the `DB_SNAPSHOT_KEY` secret (the repo is public and
fork PRs can restore caches) and stored in the Actions cache.

`.github/workflows/e2e-local.yml` restores it into a local Supabase, applies
only the PR's new migrations (versions not in production), seeds an admin
user, and runs the Critical paths specs against it.

## Rules

- **Never change the baseline's SQL** (its header comment is documentation). Treat it as immutable until the
  next baseline rotation. If you need a schema change, write a new
  numbered migration on top.
- **Never delete `_archive/`.** Those files document the actual
  history of how the schema got here. Useful when investigating "why
  is this column nullable" type questions.
- **Never apply the baseline to production.** Production already has
  all 408 pre-2026 migrations applied via the supabase migration
  history table. Re-applying the baseline would either duplicate
  objects (if `IF NOT EXISTS` saves you) or hard-error on object
  conflicts.
