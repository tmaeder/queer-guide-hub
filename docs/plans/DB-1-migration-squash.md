# DB-1 — Squash 645+ migrations into a baseline

**Status:** Backlog. Not scheduled. This doc is a placeholder so the next time the question comes up, the trade-offs are written down rather than re-derived.

## When to do it

Defer until **all** of these are true:

1. The team has a clear "fresh-start" moment — major version bump, repo split, or a new environment. A squash mid-flow churns everyone's branches.
2. `supabase db reset` (full local rebuild) takes more than ~10 minutes, AND it's hurting iteration speed in retrospectives or onboarding.
3. The migrations directory is consistently bringing up merge conflicts on filename collisions.

If only one of those is true, don't do this.

## What "squash" means here

It does **not** mean rewriting history or losing the audit trail. It means:

1. Apply every migration to a fresh database to produce a clean schema.
2. Dump that schema as a single `00000000000001_baseline.sql` migration.
3. Move the existing 645 migrations into `supabase/migrations_archive/` (still in repo, still readable, but ignored by `supabase db push`).
4. Truncate `supabase_migrations.schema_migrations` on every environment and re-mark the baseline as applied.
5. Document the cutover date.

After the squash:
- New environments come up in seconds (one big DDL vs 645 sequential DDLs).
- Local `supabase db reset` is fast.
- Existing environments keep humming — they have all 645 historic rows in the migration table; they just stop seeing the archived files.

## Hard requirements before scheduling

- **Schema dump** must be deterministic. Test with two clean reruns; diff them. Postgres ordering of constraints / indexes / RLS policies is not stable across versions; pin the dump tool version.
- **RLS policies** must be in the dump. Verify `pg_policies` post-restore matches pre-dump.
- **Custom types, extensions, triggers, functions** must be in the dump. The full schema, not just tables.
- **Data** stays alone. No data migrations are squashed.
- **All environments updated in lockstep.** Production, staging, every dev's local. A single environment that still expects the historic migrations breaks `supabase db push`.

## What the design needs to specify before execution

1. Cutover date and timezone.
2. Exact dump command (`pg_dump --schema-only --no-owner --no-privileges` plus the right flags) and Postgres / Supabase version pinned.
3. Rollback plan: how to un-squash if a regression surfaces in the first 24 h. (Hard — usually you have to restore from backup.)
4. CI changes: any workflow that does `supabase db reset` must be aware of the new baseline.
5. Communication plan: every dev needs to `supabase db reset` locally on the cutover day.
6. The archive subdirectory's exact path so `supabase db push` ignores it. Test on a sandbox project first.

## Why this is risky

- A bad dump = production data still lives, but `db reset` produces a different schema than the historic migrations did. Subtle drift surfaces months later.
- Any environment that misses the cutover sees `db push` failures forever — or worse, attempts to re-apply old migrations against a clean baseline.
- It's irreversible without a full restore.

## Cheaper alternatives that solve adjacent problems

If the actual pain is one of:

- **`db reset` is slow** → consider running it less often; rely on snapshots between resets. Or shard the dev DB.
- **Filename merge conflicts** → adopt a stricter timestamp generation policy (already enforced via `supabase migration new`) and a pre-merge linter that rejects filename collisions.
- **Migration directory is hard to navigate** → tooling: a script that groups migrations by topic / table, generated from filename + grep over the file body. No schema risk.

Pick one of those over a squash, in most cases.

## Implementation outline (if/when scheduled)

```bash
# 1. On a sandbox env: produce the baseline.
supabase db reset
pg_dump --schema-only --no-owner --no-privileges \
  --file supabase/migrations/00000000000001_baseline.sql \
  "$DATABASE_URL"

# 2. Move historic migrations.
mkdir -p supabase/migrations_archive
git mv supabase/migrations/2024* supabase/migrations_archive/
git mv supabase/migrations/2025* supabase/migrations_archive/
git mv supabase/migrations/202604* supabase/migrations_archive/

# 3. Configure supabase to ignore the archive.
# Add to supabase/config.toml:
#   [db]
#   migrations_dir = "supabase/migrations"
# (default; make sure migrations_archive isn't picked up)

# 4. On every existing env: truncate + re-mark baseline.
supabase migration repair --status reverted <every-historic-version>
supabase migration repair --status applied 00000000000001
```

Step 4 is the hairy one — `supabase migration repair` in a loop over 645 versions needs scripting. Test on staging first.

## Decision

Don't do this in 2026. Re-evaluate in 2027 once the answer to "is `supabase db reset` painful?" has been measured (anyone tracking it now? if not, that's a precondition for scheduling).
