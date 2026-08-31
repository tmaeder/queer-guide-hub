# Admin archive / delete / restore — design

Date: 2026-08-29
Branch: `claude/admin-archive-delete-options-70056a`

## Problem

Three separate defects, found by auditing every admin destructive surface and every
public read path.

**1. The CMS Archive button is cosmetic.** `/admin/content/:type` covers 26 content
types. Its Archive action writes `workflow_state` into the `cms_content_metadata`
sidecar (`src/hooks/useCMSContentMetadata.ts:57`). No public query reads that table,
and the admin list itself does not join it
(`src/components/cms/ContentListPanel/useContentListController.ts:209`) — only
`cms_pages` has a real `workflow_state` column. Archiving a venue changes nothing:
it stays public, stays in search, and still reads "Published" in the list.

**2. `/admin/users` bulk Delete runs `DELETE FROM profiles`.** `AdminUsers.tsx:233`
sets `tableName: 'profiles'`, and the shared bulk bar
(`src/components/admin/data-table/DataTableBulkActions.tsx:91`) issues a raw
PostgREST delete. The GDPR path `delete_my_account` exists precisely because that
table has NO-ACTION FK blockers, storage objects and an `auth.users` row that a bare
delete leaves behind.

**3. Archiving does not reliably hide a row.** Measured per surface:

| entity | search | public list | detail page | sitemap | crawler HTML |
|---|---|---|---|---|---|
| venues | yes | yes | yes | yes | yes |
| personalities | yes | yes | yes | yes | yes |
| events | yes | yes | **no** | yes | **no** |
| marketplace | yes | yes | **no** | n/a | n/a |
| cities | **no** | partial | **no** | yes | **no** |

Venues and personalities are the template. The rest leak.

There is also no hard-delete RPC for any content entity, no trash, no undo, no
reason capture; seven entity types (hotel, organization, news, country, milestone,
group, guide) have no archive mechanism at all; and single-row `deleteRow`
(`src/hooks/usePageFetchers.ts:996`) skips the audit log its bulk sibling writes.

## Decisions

- Archive semantics stay **per entity**, declared in the content-type registry —
  not one uniform `archived_at` column. The three existing conventions each mean
  something distinct (a `presumed_closed` venue is a live business we think shut; a
  `ghost` city is not a place; `review_status='archived'` is an editorial call), and
  a new column on 15 tables means teaching every read path, every RLS policy and
  every search indexer about it on a disk-constrained DB with unscoped search
  triggers.
- Delete stays **one click away on every list**, next to Archive — but goes through
  an RPC that snapshots the row first. Placement is the product decision; the raw
  PostgREST `.delete()` is not.
- Hard delete is **recoverable for 30 days** via a row snapshot, then not. The UI
  says so rather than implying permanence.
- **Phase B ships first.** It is a live SEO/correctness bug independent of any new
  UI, and shipping an archive button on top of leaky read paths means the button
  lies.

## Phase B — make "archived" mean invisible

Bounded, mostly one-line, no new concepts.

| id | change |
|---|---|
| B1 | `search_documents_index_cities` excludes `shell_status IN ('ghost','merged')`, plus a one-shot eviction of rows already indexed. The sync trigger deletes-then-reinserts, so narrowing the WHERE is self-evicting for future writes only. |
| B2 | `useOptimizedCities` and `fetchCity` (`src/hooks/usePlaces.tsx`) gain the `shell_status` filter `cities_directory()` already has. |
| B3 | `fetchEventBySlugOrId` and `fetchMarketplaceListingBundle` (`src/hooks/usePageFetchers.ts`) gain their status filters. |
| B4 | `cityDetail` and `eventDetail` (`functions/_lib/detail.ts`) select `seo_indexable` and return `indexable`, closing the same hole `villageDetail` had. |
| B5 | Repair the `marketplace_listings` RLS OR-chain: `status='active' OR venue_id IS NULL OR …` makes the status test a no-op for every listing without a venue. |

**RLS on venues / events / cities is deliberately NOT changed.** The three real leak
vectors are the search indexer, the client hooks and the edge renderers — and the
edge renderers run service-role, so RLS cannot reach them. Meanwhile a ghost city is
still referenced by `personalities.city_id`, so an anon-blocking policy would break
embeds on pages that legitimately name a birthplace. The marketplace policy is fixed
because it is broken on its own terms, not as defence in depth.

### Verification (Phase B)

Measure a known-archived row end-to-end **on prod after deploy**, with a positive
control at every step — a filter that hides everything passes an absence test just
as well as a correct one.

For each of: a `shell_status='ghost'` city, a `status='cancelled'` event, a
`status='inactive'` marketplace listing —

1. absent from `/search`
2. detail page 404s or is `noindex`
3. absent from crawler HTML (`curl -A Googlebot`)
4. **positive control:** an equivalent live row is still present at all three.

## Phase A — lifecycle dispatchers

```
admin_lifecycle_audit
  id, entity_type, entity_id, action ('archive'|'restore'|'delete')
  actor uuid, reason text, created_at
  row_snapshot jsonb        -- delete only
  child_refs   jsonb        -- rows cleared from FK-referencing tables
  restored_at  timestamptz
```

| RPC | Behaviour |
|---|---|
| `archive_entity(p_type, p_id, p_reason)` | Dispatches per type. Reuses `archive_city_as_nonplace`, `archive_personality_as_nonperson`, `decide_venue_nonvenue`, `_existence_apply_archive`. New SQL only for the 7 types with none. |
| `restore_entity(p_type, p_id)` | Inverse, from the snapshot each existing RPC already writes. |
| `delete_entity(p_type, p_id, p_reason)` | Snapshot row + child refs, then delete. |
| `restore_deleted_entity(p_audit_id)` | Re-INSERT from `row_snapshot`, stamp `restored_at`. |

All `SECURITY DEFINER`, `set search_path`, gated by `assert_admin_or_internal()`,
revoked from `anon`. Shape mirrors the existing `merge_entities` / `unmerge_entities`
dispatcher pair.

### Per-type dispatch table (researched against prod 2026-08-29)

Reuse, no new SQL:

| type | archive | restore |
|---|---|---|
| city | `archive_city_as_nonplace(id, reason, '{}')` | `unarchive_city(id)` |
| personality | `archive_personality_as_nonperson(id, reason, '{}')` | `unarchive_personality(id)` |
| venue | `decide_venue_nonvenue(id, true, reason)` | `restore_venue_from_nonvenue(id)` |
| event | `_existence_apply_archive('event', id, reason, '{}', actor)` | `_existence_apply_reopen('event', id, actor)` |
| marketplace | `_existence_apply_archive('marketplace', …)` | `_existence_apply_reopen('marketplace', …)` |

New SQL, but the column already exists and its CHECK already admits the value:

| type | archive state |
|---|---|
| guide | `status='archived'` — the value is in `guides_status_check` and **nothing has ever written it** |
| milestone | `status='archived'` — in `milestones_status_check` |
| queer_village | `shell_status='ghost'` + `seo_indexable=false` — `queer_villages_shell_status_check` is exactly `('real','ghost')` |
| organization | `status='archived'` — column is free text (no CHECK), default `'active'` |

**Four types have nowhere to put "archived" at all: `hotels`, `news_articles`,
`countries`, `community_groups`.** None has a `status`, `visibility` or
`review_status` column. They carry only `seo_indexable`, which governs crawlers
and the sitemap — it does **not** remove a row from the site or from search. So
for these four, "archive" cannot be expressed without a schema change, and
pretending otherwise would ship a button that deindexes but does not hide —
the same class of defect Phase B exists to fix.

That decision is deliberately left open rather than guessed: the options are a
shared `archived_at` column on just these four, or reusing `seo_indexable` and
narrowing what Archive claims to do for them. It needs a product call, and it
is the first thing to settle before Phase A is built.

**`delete_entity('tag', …)` refuses when the tag has usage.** `unified_tags` is
referenced by `tags text[]` on 13 entity tables plus two junction tables — that is
what `merge_tag_concept` exists to repoint, and a hard delete orphans all of it
silently. The error names the count and points at merge/deprecate.

**Snapshot-restore is not a time machine.** It restores the row at its original id,
so slugs and inbound links work again. It does not restore rows that cascaded away
unless they are in `child_refs`, and it cannot restore a search embedding or an R2
image a cron reclaimed meanwhile. Hence the 30-day cap.

## Phase A (UI) — registry contract + admin surfaces

`ContentTypeConfig` gains a `lifecycle` block declaring the RPC type key and which
column/value means archived, so the list can render the badge, offer the filter and
default to hiding archived rows. Same shape as the existing `admin.dedup`
capability.

Surfaces: row action + bulk bar on `/admin/content/:type`, the editor's workflow
panel writing through `archive_entity` instead of the sidecar, a per-type Trash tab
and a cross-type `/admin/trash`.

## Phase C — users

- Refactor `delete_my_account` into `_delete_user_data_core(p_user_id)` plus the
  existing self-only wrapper, and add an admin wrapper `admin_delete_user`.
- `admin_anonymize_user(p_user_id, p_reason)` — strip name, email, avatar, bio,
  location; keep the row so authored venues/events keep referential integrity.
- Edge function for the storage purge and the `auth.users` row, mirroring
  `supabase/functions/delete-account/index.ts`.
- Remove Delete from the `/admin/users` bulk bar. Account deletion is never bulk.
- Suspend/ban already exists (`UserModerationActions`) and is unchanged.

## Phase D — taxonomies

Route the tag row-action delete through `deprecate_unused_tags` /
`restore_deprecated_tag` rather than a hard `DELETE FROM unified_tags`; vocab terms
get the same via `merge_vocab_term` / `unmerge_vocab_term`. Hard delete remains
available through `delete_entity` under the usage guard above.

## Out of scope

- No uniform `archived_at` column.
- No RLS change on venues/events/cities (rationale above).
- No retention cron in the first cut; the 30-day cap is enforced in the Trash query,
  and a purge job is a follow-up.

---

# Phase E — the deferred items, 2026-08-30

Everything above shipped. This closes the four things it left open.

## The four non-archivable types: three yes, one no

The open decision was "a shared `archived_at` on those four, or reuse
`seo_indexable`". Measured, and the answer splits.

**hotels, news_articles, community_groups get `archived_at`** (migration
`20261029100000`). These are leaves. The three archive conventions already in
the schema each mean something specific, so collapsing them would be lossy — but
these three tables have no convention at all, so a column is purely additive,
and a timestamp records *when*, which a status enum cannot.

**Countries do not, and this is permanent.** Not "no column available" — the
reason is topological. `countries` is a parent: 5,757 cities, 30,887 venues and
48,741 events carry a `country_id`, every child page embeds the parent for its
name and legal status, and `location_is_high_risk()` resolves the safety gate
through the same row — so an archived country would silently un-gate content in
a criminalizing jurisdiction. 246 of 250 have dependent content, so even a
guarded button would refuse 98% of the time. `archive_entity` and
`delete_entity` both refuse `'country'` and say why, and the count is computed
per row so the message is true for the row in front of the admin.

**Enforcement is RLS, not per-call-site filters.** These three tables are read
from ~65 places in `src/hooks` alone; filtering each is a losing game where one
miss means the archived row is still on the site. Each table had exactly one
SELECT policy, so the policy is a real chokepoint. What RLS does not reach is
patched by hand: the search indexers and six anon `SECURITY DEFINER` news RPCs,
and the Pages Functions, which read with the service role.

**Restore replays the prior `seo_indexable`.** 22,019 of 45,221 news articles
are already `seo_indexable=false` from the quality gate, so a restore that set
it `true` would have re-indexed half the news corpus. The pre-archive value goes
into the audit row and comes back out.

## Two defects found while doing it

**The villages search indexer never filtered `shell_status`** — 45 of the 176
villages in `search_documents` (26%) were ghosts: deindexed for crawlers,
`seo_indexable=false`, and fully findable in on-site search. Character-for-
character the cities defect fixed in `20261016110000`, one entity later. It also
meant `archive_entity('queer_village')` — which writes exactly that
`shell_status='ghost'` — never removed a village from search.

**Two tables could not enqueue a reindex at all.** A narrowed WHERE only bites
when something enqueues the row for `search_reindex_drain`. `queer_villages` had
no search trigger whatsoever (which is *why* those ghosts accumulated —
`run_village_trust_recompute` ghosts villages nightly and nothing told search),
and the `community_groups` trigger is column-scoped with a list predating
`archived_at`. The village trigger is deliberately unscoped: its indexer reads
fifteen columns, and a scoped list is precisely the trap the groups trigger
sprang. The migration asserts the coupling at apply time, and it was
mutation-tested — it raises on the unfixed schema.

**`hotelDetail` ignored `seo_indexable`** — seventh instance of that class. The
column is non-false on all 325 hotels, so the gate was dead code that looked
alive.

## Trash, retention, bulk

- **`/admin/trash`** — cross-type, grouped, with a per-row countdown to snapshot
  expiry. Reads `admin_lifecycle_audit` directly; it already carries an
  admin/moderator RLS read policy, so an RPC wrapper would be a second gate to
  maintain and nothing else. The copy states what restore does *not* bring back.
- **Retention** — `prune_admin_lifecycle_snapshots(30)`, nightly. It nulls the
  **snapshot**, never the audit row: who deleted what and why is permanent, the
  recovery payload is what has a shelf life. Registered in `admin_automations`
  before the cron, per the registry-of-record contract.
- **Bulk archive** — routed through `archive_entity` per row rather than one
  `.in()` update, because several branches record a prior-state snapshot their
  restore reads back; a bulk column write would set the column and skip the
  snapshot, producing rows that archive but cannot be restored. Failures report
  a count *and* the first reason. The button is hidden for a type that declares
  a lifecycle with no archivable state.

## Still open

- The per-type Trash **tab** from Phase A was never built; `/admin/trash` covers
  the need and the row action covers the rest.
- Bulk **restore** is not wired — only bulk archive. Restore stays per-row.
