# Admin content management

How content is edited under `/admin/`, which pages are deliberately not on the
shared shell, and what still blocks the ones that could be.

## One shell for content CRUD

Every editable content type is registered in `src/config/contentTypes/` and
served by the CMS registry at `/admin/content/<id>`:

- list + search + filters — `src/components/cms/ContentListPanel/`
- editor, validation, dirty tracking, optimistic concurrency — `src/hooks/useCMSEditor.tsx`
- revisions, workflow state, comments, i18n, AI assist — same shell, per-type config

Adding a content type means adding a config, not a page. Controlled vocabularies
get a factory (`contentTypes/vocabulary.ts`) because the eight of them are
structurally identical; writing them longhand would reintroduce the duplication
that factory removed.

## Why this matters

Content CRUD used to run on three shells with different capabilities:

| | revisions | workflow | validation | a11y | i18n |
|---|---|---|---|---|---|
| CMS registry | yes | yes | yes | yes | yes |
| `TaxonomyAdminPage` (deleted) | no | no | partial | no | no |
| `AdminDataTable` | no | no | no | partial | no |

Editing a venue gave you revision history and accessible markup; editing a target
group gave you neither. Same job, silently weaker tooling, and no audit trail on
taxonomy changes that reclassify content site-wide.

## Deliberately NOT on the registry

Specialized tools, not entity CRUD. Converting them would lose capability.

**`AdminGeography`** — a hierarchy editor over the `geo_places` spine:
re-parenting nodes, integrity-violation triage, landmark spine and review. Built
on ~12 geo-specific hooks (`useGeoMoveNode`, `useGeoIntegrityViolations`,
`useLandmarkSpine`, …). A tree, not a table.

**`AdminUsers`** — roles and bans over `profiles`. Access control rather than
content; the actions are guarded operations, not form fields.

**`AdminTags`** (`/admin/settings`) — a tag *operations* console: merge review
queue, CSV import, bulk AI create, categorizer, quality and suggestion panels.
These are collection-level, and `extraPanels.render(contentId)` is per-record, so
they cannot become config. Tag CRUD itself is already on the registry
(`/admin/content/unified_tags`), and the per-tag alias editor moved there as an
`extraPanel`.

## Registry capability parity

Audited by **behaviour, not by config-key name** — several apparent gaps turned
out to be the same feature under a different name:

| capability | `AdminDataTable` | registry equivalent |
|---|---|---|
| per-row actions | `rowActions` | `ContentTypeConfig.rowActions` |
| toolbar buttons | `toolbarActions` | `ContentTypeConfig.toolbarActions` |
| filtering | `entityFilters` | `FieldConfig.filterable` (+ `dynamicOptions`) |
| Excel export | `exportColumns` | `ContentListPanel/exportContentList.ts` |
| bulk edit | `bulkEditFields` | **missing** — only `AdminTags` needs it |
| backfill jobs | `backfillJobs` | **missing** — only `AdminTags` needs it |

`ContentTypeConfig.bulkOps` looked like another gap but was dead config —
declared, never read, set by no content type — and has been removed rather than
left implying a feature that does not exist.

Two design constraints worth knowing before adding more:

- `toolbarActions` is a render **function**, not a node. Configs are module-level
  static objects, so a node would be constructed once at import and could never
  hold state; a dialog has to live inside the returned component.
- `rowActions.onSelect` is a plain callback in that same static config. It can
  copy, navigate or open a URL, but cannot open a React dialog owned by the page.
  Stateful things belong in `extraPanels` (per-record) or `toolbarActions`
  (per-collection).

## Views and inline editing

Both are properties of the **shell**, not of a config, so every registered type
gets them and a newly registered type gets them for free.

| view | how it works for any type |
|---|---|
| Table | the default list |
| Gallery | image from the type's `imageField`, type icon as fallback |
| Board | groups by any `select`/`boolean` field, or workflow status |
| Timeline | months, newest first, against a chosen date column |
| Calendar | month grid, records on their day |

The chosen view — plus the board's grouping column and the date views' column —
persists per content type in `PersistedState`, so a layout survives navigating
away and back. That is the customisable part: a view is a per-type preference,
not a global mode.

Three rules the helpers encode, each guarding a way these views can lie:

- `groupableFields` excludes free text. Grouping by a name column would produce
  one board column per record.
- `dateOf` returns `null` for a missing or unparseable value rather than
  defaulting to now, so undated records cannot silently pile onto today.
  Timeline lists them under "Undated"; Calendar reports the count beneath the
  grid instead of dropping them.
- Board and Timeline place their catch-all group **last**, so an
  incomplete-data bucket never pushes real groups off-screen.

Calendar does **not** reuse `src/components/hub/calendar/MonthGrid.tsx`. That
component is entangled with `CalendarItem`, `EventChip`, calendar layers and a
history-aggregation rule, and has one live user-facing caller; genericizing it
to serve an admin list would refactor a working surface for a secondary
consumer. Only the pure day-key logic is shared in spirit.

Inline editing wraps list cells in the existing `Editable` kit
(`src/components/admin/inline/`), which resolves field config from the registry
and owns the save — so no per-type wiring was needed. It is passed
`requireAltClick={false}`: Alt-click is right on a **public** page, where a
plain click means "read this", but in an admin list the opposite holds.

## `AdminRedirects`: one gap short

Most of it maps cleanly:

| feature | registry home |
|---|---|
| copy short URL, test redirect | `rowActions` — clipboard, `window.open` |
| bulk import, preview dialogs | `toolbarActions` |
| Excel export | generic `exportContentList` |
| type / enabled filters | `FieldConfig.filterable` |
| click-analytics viewer | `extraPanels` — per-redirect, so it belongs in the editor |
| slug + loop validation | `ContentTypeConfig.validate` |

`validateSlug` and `detectLoop` (`src/lib/redirects/validation.ts`) are
synchronous and read only the row being saved, so they fit `validate` as-is.
Cross-row or async validation was the thing most likely to block this, and it
does not: `detectLoop` compares request path to target and never queries other
redirects.

**The blocker is conditional field visibility.** `RedirectFormDialog` shows
`slug` when `type === 'SHORT'` and `source_path` when `type === 'PATH'`.
`FieldConfig` has only a static `hidden`, so a converted editor would show both
fields for every redirect and rely on `validate` to reject the wrong combination
after the fact. That is a worse editor than the one being replaced — exactly the
trade this effort exists to avoid.

Converting needs `visibleWhen?: (row) => boolean` on `FieldConfig` first.

## The larger question

`ContentListPanel` maintains its own ~576-line table (`ContentListTable`) beside
`AdminDataTable`'s ~405 — two implementations of the same job, each with its own
fetching, sorting, pagination and selection. Closing gaps one at a time makes the
registry slowly reimplement a component that already exists.

Making `ContentListPanel` render `AdminDataTable` internally would grant every
remaining capability at once and delete a table. That is the better fix and the
bigger one: the registry list is the editing surface for all 25 content types, so
it wants someone who can open the page and look at it.

## A method note

Three times during this work a feature looked expressible from its config-key
shape and turned out otherwise once the implementation was read — and twice in
the other direction, where `entityFilters` and `exportColumns` already existed
under different names. An earlier draft of this file told the next person to
build filtering the registry had had all along.

Read the implementation before promising a conversion.

## Everything else under `/admin/`

Dashboards, review queues, pipelines, imports, analytics and integrations are not
content management and are out of scope for this shell.
