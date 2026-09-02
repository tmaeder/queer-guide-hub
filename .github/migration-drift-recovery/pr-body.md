Opened automatically because prod has migration versions with no file in this repo.

**This is remediation, not a change to prod.** Every migration here is already applied. `db push` matches on version and skips an applied one, so nothing in this PR will re-run. The files exist so that:

- `migration-versions` stops failing on **every PR in the repo** — an applied version with no file reds changes that never touched SQL;
- `db push` stops refusing with *"Remote migration versions not found in local migrations directory"*, which blocks the whole deploy queue, not just one change;
- a rebuild from zero produces the same schema.

## Where the content came from

Two sources, in order of preference:

1. **The authoring commit**, when the migration exists on some branch — keeps the real file, comments and reasoning intact.
2. **`schema_migrations.statements`**, otherwise — reconstructed and verified by md5 against a digest computed server-side over the same join.

`statements` holds the *parsed* statements. Trailing semicolons are stripped (re-added on rebuild), and **the original comment header is not recorded**. For files from source 2 the reasoning that accompanied the migration is gone; the file header says so.

## What to check before merging

**Read what each migration actually did.** A migration that arrived via `apply_migration` was applied without review once already — merging it unread skips review a second time.

Anything the tool could not verify is deliberately **not** in this PR. It is reported in the run log and left for a human, so the detector keeps failing loudly rather than the problem being papered over with a plausible-looking file.

## Why this is automated at all

`apply_migration` stamps a version and commits nothing, so the follow-up commit is a separate step that is easy to skip — and skipping it halts CI for everyone, not just the author. On 2026-08-29 that happened five times in one day, each time until a human noticed a red check and hand-recovered it. The recovery is mechanical; noticing was the slow part.
