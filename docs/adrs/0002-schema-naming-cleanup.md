# ADR 0002 — Schema naming cleanup

**Status:** Proposed (awaiting acceptance)
**Date:** 2026-05-01
**Decision driver:** consolidation sprint Phase 4 (deferred from main sprint)
**Related:** [0001-ui-library-consolidation](0001-ui-library-consolidation.md)

## Context

CLAUDE.md's "DB Column Names (common traps)" section catalogues four
inconsistencies that bite engineers regularly. Each represents a
column or table that was named one way in some places, another way
elsewhere, and now requires per-table mental indexing to query
correctly. Verified row counts in production (2026-05-01):

| Inconsistency | Locations | Current behavior |
|---|---|---|
| **Featured flag** | `news_articles.is_featured` (14,077 rows) vs `venues.featured` (32,219) vs `events.featured` (3,371) | Same semantic concept, two different column names. Engineers commit `featured` typos against `news_articles` and get silent SQL "column does not exist" failures, or `is_featured` against `venues` and get the same. |
| **Date types on personalities** | `birth_date` / `death_date` (date type) — older code refers to `birth_year` / `death_year` int | Migrated to date types but the int names linger in stale documentation, AI suggestions, etc. |
| **News sources type column** | `news_sources.source_type` (25 rows) — older code says `.type` | Pure rename, `type` long gone but muscle memory persists. |
| **Events name field** | `events.title` (3,371 rows) — older code says `events.name` | Same as above. |

Plus one structural inconsistency:
- **Tags table** is `unified_tags` (7,574 rows). Older code references `tags`. The `tags` table never existed under that name in current schema; the rename happened pre-history but the AI / docs keep suggesting `tags`.

These traps cost roughly 5–10 minutes per engineer per occurrence
(write query → fail → grep CLAUDE.md → rewrite). Across the team and
across new contributors, this compounds to a real velocity tax.

## Decision

**Pick one canonical name per concept and migrate via a backwards-
compatible bridge.** No big-bang. Three phases per rename:

> **2026-05-02 update:** the original ADR proposed a view alias for
> Phase A, but a view alias does not shield Supabase clients that query
> the underlying table directly (`.from('venues').select('featured')`).
> Phase A for MIG-1 instead used an **add-column + bidirectional sync
> trigger** pattern — both column names work for reads AND writes
> throughout Phase B. See migration `20260502020000` for the actual
> implementation. Other MIGs were code-only and didn't need a bridge.

1. **Phase A** — Add a backwards-compat view (or column alias) so both
   names work. Application code keeps working unchanged.
2. **Phase B** — Migrate all application reads/writes to the canonical
   name. Codemod where possible. Land in PRs of ≤ 30 files each.
3. **Phase C** — After application is fully migrated AND a 2-week
   observation window with no rollbacks, drop the old name (column or
   view alias).

This is the "two-phase column rename" pattern from PostgreSQL
operational best practice — never break production by renaming under
running code.

### Canonical names

| Concept | Pick | Why |
|---|---|---|
| Featured flag | **`is_featured`** | Boolean prefix convention (`is_*`) is more idiomatic and already used in `news_articles`. Renaming `news_articles` would touch 14k rows; renaming `venues` (32k) and `events` (3k) means 35k rows of view aliasing — but the `is_` prefix is clearer everywhere. |
| Personality dates | **`birth_date` / `death_date`** | Already canonical in current schema. ADR confirms; `birth_year`/`death_year` references in code/docs are pure cleanup. |
| News sources type | **`source_type`** | Canonical; `type` is a reserved keyword in many query contexts and a poor identifier. |
| Events name field | **`title`** | Canonical; `name` is too generic. Consistency with `news_articles.title`. |
| Tags table | **`unified_tags`** | Canonical; `tags` ambiguous (could mean tag-junction table). |

## Migrations required

### MIG-1: `is_featured` consolidation
- Phase A: `ALTER TABLE venues RENAME COLUMN featured TO is_featured;` + create view `venues_compat AS SELECT *, is_featured AS featured FROM venues;` — application-side switch can grep against this view name to find untouched call sites.
- Estimated app-layer touch: **48 files** with `.featured` or `is_featured` references (per `grep -rln` 2026-05-01).
- Same pattern for `events`.

### MIG-2: Personalities date cleanup (mostly docs)
- Schema is already correct — no DDL change.
- Action: codemod / find-and-replace `birth_year` / `death_year` references in code, comments, types. Likely <10 files.
- Update CLAUDE.md trap list to remove the entry once 0 references remain.

### MIG-3: news_sources.type → source_type
- Schema is already correct (column is `source_type`).
- Action: grep + delete any lingering `.type` references in scraper / admin code. Likely <5 files.
- Update CLAUDE.md trap list.

### MIG-4: events.name → title
- Schema is already correct (column is `title`).
- Action: grep + replace any lingering `events.name` references. Likely <10 files.
- Update CLAUDE.md trap list.

### MIG-5: tags → unified_tags
- Schema already correct (table is `unified_tags`, no `tags` table).
- Action: grep + replace any lingering `from('tags')` references in TS code. Likely <5 files.
- Update CLAUDE.md trap list.

## Sequencing

| Order | Why |
|---|---|
| 1. MIG-2, MIG-3, MIG-4, MIG-5 first | Pure code cleanup (no DDL, no migration risk). Knock these out in one PR per concept. |
| 2. MIG-1 last | Real DDL + 35k rows of view aliasing + ~48 files to migrate. Highest risk. Land only after the cleanup PRs prove the codemod approach. |

Each rename is independent; can ship in parallel branches.

## Consequences

- **Removes 5 entries from CLAUDE.md's trap list** — one of the most-quoted parts of CLAUDE.md becomes shorter.
- **AI suggestions improve** — most code-completion tools learn from the codebase. Removing the inconsistency means fewer "is this `featured` or `is_featured`?" wrong guesses.
- **Storage:** view aliases cost zero storage; column renames are atomic metadata changes.
- **CI / migrations:** ~5 new migrations, all simple. None require `CONCURRENTLY` (which the codebase can't use anyway per CLAUDE.md).
- **Breaking change risk:** view aliases mean Phase A + B can ship independently and the app keeps working throughout. Phase C (drop old name) is the only point where forgotten references break — mitigation is grep before merging Phase C.

## Action items

1. **Open a working branch per MIG.** Sequence as above.
2. **Codemod template:** for each rename, write a single `ts-morph` script that finds all references in `src/` and rewrites them. Commit the script alongside the migration.
3. **CLAUDE.md as forcing function:** after each MIG-X completes Phase B, update the trap list. When the trap list is empty, this ADR is done.
4. **Track in a follow-up issue:** "Schema naming cleanup (ADR 0002)" with checkboxes for each MIG.

## Rollback

Each Phase A is reversible with `ALTER TABLE ... RENAME COLUMN` back +
drop the alias view. Phase B is just code — `git revert`. Phase C
(drop old name) is the only irreversible step; mitigation is the
2-week observation window before each drop.

## Out of scope

- The 109 unindexed FKs and 259 unused indexes flagged by the performance advisor (see [index-cleanup-batches.md](../index-cleanup-batches.md)) — separate effort, different cadence requirements.
- The `_archive/` migration squash (Phase 4 baseline) — separate ADR if pursued.
