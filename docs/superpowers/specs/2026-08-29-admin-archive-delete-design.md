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
