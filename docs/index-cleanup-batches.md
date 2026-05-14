# Index cleanup batches — Phase 4 sub-project

Backlog from the Supabase performance advisor against project
`xqeacpakadqfxjxjcewc`, captured 2026-05-01.

**Why this is a doc, not a migration.** "Unused" means the index hasn't
been hit in the observation window — a daily report or quarterly query
will not appear here. Drop is safe **only after** the team confirms no
known query needs the index. Bulk-dropping risks silently slowing
edge-case paths.

## 1. Unused indexes (259 total)

Dropping all 259 reclaims write amplification on every covered table
(insert/update/delete pays a per-index cost).

### Recommended cadence

13 batches of ~20 indexes each. Each batch:

1. PR with the migration (`DROP INDEX IF EXISTS ...` × 20).
2. Apply to staging, observe for 48h.
3. Apply to prod.
4. Wait **1 week** before next batch — gives daily/weekly query patterns time to surface.
5. Run advisor again before next batch; if anything regresses, pause.

### Top-loaded tables (start here, biggest return)

| Table | Unused indexes |
|---|---|
| `venues` | 11 |
| `events` | 10 |
| `trip_places` | 8 |
| `news_articles` | 7 |
| `feedback_stories` | 7 |
| `content_metadata` | 6 |
| `community_submissions` | 6 |
| `personalities` | 5 |
| `content_threads` | 5 |
| `content_changes` | 5 |
| `cities` | 5 |

### Full list

The complete list is too long to inline (259 rows). Reproduce on demand:

```bash
# via Supabase MCP
# get_advisors(type=performance) → filter name="unused_index"
# extract: schema, table, index name from .detail
```

Or read the cached advisor output at:
`~/.claude/projects/-Users-tobiasmaeder-QG--claude-worktrees-strange-fermi-1ecf8d/<session>/tool-results/mcp-...-get_advisors-1777641715809.txt`

### Skip patterns (don't auto-drop)

- Any index named `*_pkey` — primary keys, never in this list anyway
- Any unique index — even if "unused" by SELECT, it's enforcing a constraint
- Indexes on columns referenced in active RLS policy `qual` / `with_check` — Postgres uses them implicitly
- Indexes prefixed `ix_` (some custom naming convention) — verify they're not part of a partial-index strategy

## 2. Unindexed foreign keys (109 total)

The inverse problem. A FK column without a covering index means every
parent-row delete (or many UPDATEs to the parent's PK) triggers a full
scan of the child table. Add `CREATE INDEX` per FK.

**Less risky than dropping** — adding an index can't break a query;
it can only help or use disk. Cadence can be faster: batches of 30,
two weeks for the whole sweep.

### Top-loaded tables

| Table | Missing FK indexes |
|---|---|
| `public.group_notifications` | 5 |
| `public.festivals` | 5 |
| `public.cms_content` | 4 |
| `public.post_comments` | 3 |
| `public.cms_pages` | 3 |
| `public.cms_content_metadata` | 3 |
| `umami.website_event` | 2 |
| `public.trips` | 2 |
| `public.scrape_runs` | 2 |
| `public.queer_villages` | 2 |

### `n8n.*` and `umami.*` schemas

109 FK list includes some `n8n.*` and `umami.*` table FKs. These
schemas are owned by the third-party tools (n8n workflow engine,
Umami analytics). **Don't add indexes to schemas you don't own** —
the upstream project will likely add them in a future release;
your custom indexes will conflict.

Filter to `public` schema only when batching.

## 3. The other deferred batches

- **Batch 3 — SECURITY DEFINER audit** (65 functions) — separate doc/engagement; needs per-function classification (deliberate vs accidental). Can't be mass-tightened.
- **Batch 5 — MFA settings** — Supabase dashboard; not a migration.

## 4. What's been done already

See [consolidation-2026-Q2-addendum-db-advisors.md](consolidation-2026-Q2-addendum-db-advisors.md):
- Batch 1 (drop scratch tables) — applied 2026-05-01
- Batch 2 (search_path + RLS InitPlan + dedupe news_sources policy) — applied 2026-05-01
- 1 ERROR remaining (security_definer_view on `user_submission_reputation`) — needs view-level review.
- 1 multiple_permissive remaining (`personality_internal_notes` SELECT) — recent migration, needs review.
