# Admin content management

How content is edited under `/admin/`, and which pages are deliberately not on
the shared shell.

## One shell for content CRUD

Every editable content type is registered in `src/config/contentTypes/` and
served by the CMS registry at `/admin/content/<id>`:

- list + search + filters — `src/components/cms/ContentListPanel/`
- editor, validation, dirty tracking, optimistic concurrency — `src/hooks/useCMSEditor.tsx`
- revisions, workflow state, comments, i18n, AI assist — same shell, per-type config

Adding a content type means adding a config, not a page. Controlled
vocabularies get a factory (`contentTypes/vocabulary.ts`) because the eight of
them are structurally identical; writing them longhand would reintroduce the
duplication that factory removed.

## Why this matters

Before consolidation, content CRUD ran on three shells with different
capabilities:

| | revisions | workflow | validation | a11y | i18n |
|---|---|---|---|---|---|
| CMS registry | yes | yes | yes | yes | yes |
| `TaxonomyAdminPage` (deleted) | no | no | partial | no | no |
| `AdminDataTable` | no | no | no | partial | no |

Editing a venue gave you revision history and accessible markup; editing a
target group gave you neither. Same job, silently weaker tooling, and no audit
trail on taxonomy changes that reclassify content site-wide.

## Deliberately NOT on the registry

These are specialized tools, not entity CRUD. Converting them would lose
capability. Do not "unify" them without first replacing what they do.

**`AdminGeography`** — a hierarchy editor over the `geo_places` spine:
re-parenting nodes, integrity-violation triage, landmark spine and review. Built
on ~12 geo-specific hooks (`useGeoMoveNode`, `useGeoIntegrityViolations`,
`useLandmarkSpine`, …). A tree, not a table.

**`AdminUsers`** — roles and bans over `profiles`. Access control rather than
content. The actions are guarded operations, not form fields, and a generic
editor would be the wrong shape for them.

**`AdminRedirects`** — plain CRUD over `redirects`, but it carries `rowActions`
including a live "test this redirect" that opens the `redirect-handler` edge
function, plus bulk-edit and toolbar actions. `ContentTypeConfig` has no
`rowActions` equivalent, so moving it to the registry today would be a
downgrade. Convert only after the registry grows row actions.

**`AdminTags`** (`/admin/settings`) — a tag *operations* console: merge review
queue, CSV import, bulk AI create, categorizer, quality and suggestion panels.
These are collection-level, and `extraPanels.render(contentId)` is per-record,
so they cannot become config. Tag CRUD itself lives in the registry
(`/admin/content/unified_tags`), and the per-tag alias editor moved there as an
`extraPanel`.

## What blocks further convergence

`AdminTags` and `AdminRedirects` both keep a table the registry cannot yet
replace. Alias editing — the gap closed above — turned out to be only one of
several. `AdminDataTable` configs use capabilities that `ContentTypeConfig` has
no equivalent for:

| capability | `AdminTableConfig` | `ContentTypeConfig` |
|---|---|---|
| `rowActions` | yes | **yes** (added) |
| `toolbarActions` | yes | **no** |
| `bulkEditFields` | yes | **no** |
| `entityFilters` | yes | **no** |
| `exportColumns` | yes | **no** |
| `backfillJobs` | yes | **no** |

So the remaining `AdminDataTable` pages are not lingering duplication to be
mopped up — they are using a richer list surface. Converting one today trades
row actions and bulk edit for revisions and workflow, which is a sideways move
at best.

`rowActions` is now on `ContentTypeConfig` — declare `{ id, label, icon,
visible?, onSelect }` and the list renders it beside Edit. It is deliberately
narrower than the `AdminDataTable` version (no destructive variant, no bulk or
toolbar forms) until something needs more.

**No page can convert on that alone.** `AdminRedirects`, the obvious first
candidate, also needs `toolbarActions` for its import dialog and Excel export,
plus somewhere for its click-analytics viewer. `entityFilters` is the next
biggest gap — most of these lists are unusable without faceting.

**The real next step**, in order: `entityFilters`, then `toolbarActions`, then
convert `AdminRedirects` as the smallest proof. Until then, leave these pages
alone; a partial conversion loses tooling.

## Everything else under `/admin/`

Dashboards, review queues, pipelines, imports, analytics and integrations are
not content management and are out of scope for this shell.
