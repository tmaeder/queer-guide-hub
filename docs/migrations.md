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
| New environment from scratch | `supabase db reset` (applies baseline + all 2026 migrations) |
| Add a new migration | `supabase migration new <name>` |
| Inspect what's applied to prod | Supabase dashboard → Database → Migrations |
| Schema diff against prod | `supabase db diff --linked` |

## Why a baseline

By 2026-05-02 the project had **659** migration files (408 pre-2026 +
251 in 2026). Every `supabase db reset` ran the full chain — slow for
new contributors, painful in CI, and a frequent source of "this
migration broke because it depends on column X added in a different
migration two months later" errors.

The baseline snapshots the production schema state as a single
self-contained DDL file. From a fresh DB, applying the baseline
followed by the 251 in-tree 2026 migrations produces the same schema
production runs.

## Rules

- **Never modify the baseline file.** Treat it as immutable until the
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

## When to rotate the baseline

Rotate when the in-tree 2026+ migration count grows large enough that
new-env setup time becomes painful again — say >300 migrations on top
of the baseline, or annually. Rotation procedure:

1. `supabase db dump --linked --schema public --file new_baseline.sql`
2. `git mv supabase/migrations/2026*.sql supabase/migrations/_archive/`
3. Replace `00000000000000_baseline.sql` with `new_baseline.sql`
   (preserve the header).
4. Verify locally: `supabase db reset` then `supabase db diff --linked` (should be empty).

## Generation

```bash
supabase db dump --linked --schema public --file 00000000000000_baseline.sql
```

Requires Docker Desktop running (Supabase CLI launches a Postgres
container internally). For direct `pg_dump`-only flow without Docker
you'd need the production Postgres password (`supabase db dump --db-url`).

## Verification (must run before adopting on a new env)

The CI baseline-replay workflow should do:

```bash
# In a clean container or fresh local DB:
supabase db reset --linked     # apply baseline + 2026 migrations
supabase db diff --linked      # should output: "No schema changes found"
```

If `db diff` shows changes, the baseline + in-tree migrations don't
fully reproduce production. Investigate before merging.

The first adoption of this baseline (PR #292+) was generated on
2026-05-02 against project `xqeacpakadqfxjxjcewc`. It has NOT yet
been verified via `supabase db reset` because Docker isn't always
available in CI; the verification step is required before marking
this layout as official policy.
