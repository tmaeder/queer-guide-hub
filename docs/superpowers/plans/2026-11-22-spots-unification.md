# Spots Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One `spots` spine over `venues` and `organizations`, then one search doc, one URL tree and one detail page per real-world thing.

**Architecture:** Strangler migration on the `geo_places` pattern. P0 adds a narrow spine mirrored by AFTER triggers from both profile tables, plus a nightly drift check. Later phases (gated) fold shadow orgs, flip FKs, and move search, SEO and frontend onto the spine.

**Tech Stack:** Postgres 17 (Supabase), pg_cron, vitest text-scan tests, Playwright against prod.

Spec: `docs/superpowers/specs/2026-11-22-spots-unification-design.md`.

---

## P0 — spine, mirror, drift check — SHIPPED 2026-11-22 (#5550)

Verified on prod: 230,761 spots = venues + organizations, drift 0, live triggers mirror venue and org renames and skip unrelated updates, anon gets 401.

### File map

| File | Responsibility |
|---|---|
| `supabase/migrations/99991795350279_spots_spine.sql` | table, RLS lockdown, sync trigger fn + 2 triggers, backfill, drift log + check fn, cron + registry row, postconditions |
| `src/lib/__tests__/spotsSpine.test.ts` | text-scan guard over the migration |
| `scripts/check-pipeline-health.mjs` | new section: latest `spots_drift_log` row must be 0 and < 48h old |
| `e2e/spots-spine.spec.ts` | prod: anon cannot read `spots`; spine count matches source counts via a service-free probe |

Design choices fixed here:
- `spots` gets **no anon/authenticated grants** in P0. Nothing public reads it yet; a direct grant would need draft-org and safety rules duplicated in RLS. Public access arrives in P3 through definer RPCs that apply those rules.
- `parent_id` is NOT added in P0 (no writer until P1).
- `status` for venues is derived: `closed` when `closed_at` is set, else `active`. Orgs copy `status`.
- The sync fn returns early when no mirrored column changed, so venue updates that touch only other columns cost one comparison.

### Task 1: Failing guard test

**Files:** Create `src/lib/__tests__/spotsSpine.test.ts`

- [ ] Step 1: write the test

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const MIGRATION = 'supabase/migrations/99991795350279_spots_spine.sql';
const raw = readFileSync(MIGRATION, 'utf8');
// Strip comments so prose in the header cannot satisfy an assertion.
const sql = raw.replace(/--[^\n]*/g, '').toLowerCase();

describe('spots spine migration', () => {
  it('creates the spine with a closed kind vocabulary', () => {
    expect(sql).toMatch(/create table public\.spots/);
    expect(sql).toMatch(/kind text not null check \(kind in \('place', 'organization'\)\)/);
  });

  it('locks the table down: RLS on, no grants to anon or authenticated', () => {
    expect(sql).toMatch(/alter table public\.spots enable row level security/);
    expect(sql).toMatch(/revoke all on public\.spots from public, anon, authenticated/);
    expect(sql).not.toMatch(/grant [a-z, ]+ on public\.spots to (anon|authenticated)/);
  });

  it('mirrors BOTH profile tables on insert, update and delete', () => {
    for (const t of ['venues', 'organizations']) {
      expect(sql).toMatch(
        new RegExp(`create trigger trg_spots_sync\\s+after insert or update or delete on public\\.${t}\\s+for each row execute function public\\.spots_sync\\(\\)`),
      );
    }
  });

  it('runs the sync as definer with a pinned search_path', () => {
    const fn = sql.slice(sql.indexOf('function public.spots_sync()'));
    expect(fn.slice(0, 400)).toMatch(/security definer/);
    expect(fn.slice(0, 400)).toMatch(/set search_path to 'public', 'pg_temp'/);
  });

  it('aborts the migration when the backfill leaves drift', () => {
    expect(sql).toMatch(/if \(v ->> 'drift_count'\)::int <> 0 then\s+raise exception/);
  });

  it('schedules and registers the nightly drift check', () => {
    expect(sql).toMatch(/cron\.schedule\('spots_drift_check'/);
    expect(sql).toMatch(/insert into public\.admin_automations[\s\S]*'spots_drift_check'/);
    expect(sql).toMatch(/revoke execute on function public\.spots_drift_check\(\) from public, anon, authenticated/);
  });
});
```

- [ ] Step 2: `npx vitest run src/lib/__tests__/spotsSpine.test.ts` → FAIL (ENOENT, migration missing).

### Task 2: Migration

**Files:** Create `supabase/migrations/99991795350279_spots_spine.sql` (full SQL in the file; key parts):

- `create table public.spots (id uuid primary key, kind text not null check (kind in ('place', 'organization')), roles text[] not null default '{}', slug text not null, name text not null, category text, city_id uuid, country_id uuid, latitude numeric, longitude numeric, safety_gated boolean not null default false, duplicate_of_id uuid, status text not null, created_at timestamptz not null, updated_at timestamptz not null default now())`
- indexes: `(kind)`, `(slug)` (not unique, see spec §Slugs), `(duplicate_of_id) where not null`.
- `spots_sync()` trigger fn: upsert on INSERT/UPDATE, delete on DELETE, early return when the mirrored tuple is unchanged.
- backfill: two `insert … select … on conflict (id) do nothing`.
- `spots_drift_log` + `spots_drift_check()`: missing_venues, missing_orgs, orphans, stale_venues, stale_orgs.
- postcondition: run the check, raise on non-zero.

- [ ] Step 3: dry-run the whole file on prod inside a transaction ending in `raise exception 'rollback'`; confirm the only error is the rollback marker.
- [ ] Step 4: `npx vitest run src/lib/__tests__/spotsSpine.test.ts` → PASS.
- [ ] Step 5: mutation-test: delete one trigger, swap `<> 0` for `< 0`, add a grant to anon → each must fail; a comment-only edit must pass.
- [ ] Step 6: commit.

### Task 3: Health sentinel

**Files:** Modify `scripts/check-pipeline-health.mjs` (append a section before the final `if (FAILED)`).

- [ ] Read the newest `spots_drift_log` row. Fail when it is missing, older than 48h, or `drift_count > 0`. A 404 on the table warns (migration not applied yet) instead of failing.
- [ ] Run `node scripts/check-pipeline-health.mjs` locally with prod env if available; else `node --check`.
- [ ] Commit.

### Task 4: E2E against prod

**Files:** Create `e2e/spots-spine.spec.ts`

- [ ] anon `GET /rest/v1/spots?select=id&limit=1` returns no rows (401/403/404, or an empty array — never a row).
- [ ] anon `POST /rest/v1/rpc/spots_drift_check` is refused.
- [ ] Commit.

### Task 5: Ship and verify on prod

- [ ] Push branch, open PR, CI green, merge (migration applies via CI `db push`).
- [ ] Verify by name: `schema_migrations` row `99991795350279` named `spots_spine`.
- [ ] `select count(*) from spots` = venues + organizations; latest `spots_drift_log.drift_count` = 0.
- [ ] Live trigger check in a rolled-back txn: insert venue → spot exists; rename → spot renamed; delete → spot gone.
- [ ] Run `npx playwright test e2e/spots-spine.spec.ts` against prod.

---

## P1–P5 (gated; detailed plans written when each gate opens)

| Phase | Gate | Outline |
|---|---|---|
| P1 links — BUILT, draft PR, merge after the gate | 7 clean `spots_drift_log` nights (not before 2026-11-29) | `99991795359695_spots_p1_links.sql`: `spots.parent_id` mirrors `venues.organization_id` (no FK: a violation would abort venue writes; drift check reports `bad_parents`); after P2 only chains keep a parent. `spot_id` → `spots(id)` ON DELETE SET NULL on the 5 tables, derived from `organization_id` by `trg_spots_link`; an explicit `spot_id` in the same UPDATE wins (P2 uses this). Dry-run on prod: 106,389 parents, 764 links, drift 0. |
| P2 fold — BUILT, ships with P1 in #5561 | none at merge; the fold itself waits for `spots_fold_gate_open()` (7 clean drift nights in 8 days) | `99991795359711_spots_p2_fold.sql`: `spots_fold_batch(300)` on cron `spots_fold` (*/5) folds pure shadows only (roles `{venue}`, unclaimed, no legal name/founding/editorial, one non-duplicate venue, no merged duplicates, no link-table rows: 102,008 measured). Per org: full row + moved rows in `spot_fold_audit`, logo copied if the venue has none, org slug → `venue_slug_redirects`, 2 news mentions repointed, machine rows deleted (embeddings ~102k, findings ~854k, brand events ~192k, remediation ~11k, geo queue ~4k), `venues.organization_id` nulled, org deleted. `unfold_spot(audit_id)` restores. At merge: `cms_location_identity_insert` DISABLED (not dropped: DROP blocks venue reads), `org_spine_backfill` retired registry-first. Frontend in the same PR: venues back in `contentTypeRegistry`, venue→org CMS alias removed, venue counts link to the venue list, `/admin/content/venues` pinned to admin (the tier it had via the org editor), `/organizations/<folded-slug>` → `/venues/<slug>`. Dry-run on prod: gate held, 50 folded in 1.95 s, 50 redirects, unfold restored, drift 0. |
| P3 search + SEO | shadow count 0 | 1,266 slug collisions suffixed; unique slug index; one indexer from `spots`; `spotDetail`; `sitemap-spots.xml`; `get_spot` / `rpc_spots_ranked` definer RPCs |
| P4 frontend | 0 duplicate search docs | `/spots` list, `/spots/:slug` dispatching to the existing venue or org descriptor by kind, `SpotCard`, redirects, nav, admin `/admin/spots` (no merged detail parts: only OrgTags was a real copy, fixed 2026-11-22) |
| P5 cleanup | 30 days of P4 | drop `venues.organization_id`, old indexers, `sitemap-venues.xml`, old hooks/pages |
