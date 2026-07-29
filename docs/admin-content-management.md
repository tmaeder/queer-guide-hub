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

**Open follow-up:** `AdminTags` still embeds a duplicate `unified_tags` table
alongside its ops panels. The parity gap that justified it (alias editing) is
closed, so the table can now be dropped in favour of a link to the registry —
left undone because verifying it needs a signed-in admin session.

## Everything else under `/admin/`

Dashboards, review queues, pipelines, imports, analytics and integrations are
not content management and are out of scope for this shell.
