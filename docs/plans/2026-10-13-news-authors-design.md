# News author management

Approved by the user on 2026-10-13.

Add News Authors to the Editorial admin navigation at /admin/news-authors. Preserve the existing news_articles.author text model and public author filter. Provide server-paginated substring search over all nonempty bylines, article counts, and a paginated article drilldown linking to the existing CMS editor. Include archived and duplicate articles so corrections apply to the complete corpus.

Rename changes one exact byline across its articles. Existing destination names require the explicit merge action. Merge moves articles from one exact name to an existing destination. Both actions require a confirmation showing source and destination, reject invalid bylines, and validate the expected source count to avoid applying a stale preview. Database functions enforce editorial staff authorization and return affected counts. Loading, empty, error/retry, mutation pending, and responsive table states use established admin components.

Verify UI workflows, pagination and errors with component tests; verify SQL authorization, validation, collision handling, count checks and atomic updates using rollback-only database fixtures. Deliver the source and additive migration, without publishing a frontend release unless requested.

## Verification and delivery

Implemented in AdminNewsAuthors and useNewsAuthorsAdmin, with navigation and route wiring. The two additive RPCs were applied to the connected Supabase project. The security advisor reports their intentional authenticated SECURITY DEFINER exposure; both use the established assert_admin_or_internal guard, revoke anonymous access, and pin search_path. Live queries verified moderator reads, nonstaff rejection, invalid-name rejection, anonymous grants, and populated results without changing existing bylines.

The isolated PostgreSQL regression covers rename, merge, collisions, stale previews, invalid names, pagination, singleton authors and authorization. UI/navigation tests: 39 passed. Typecheck: no new errors against the existing baseline. Lint and production Vite build passed. Desktop/mobile browser fixtures verified rendering, CMS links, the merge dialog, and no page overflow at 390 px. Frontend source is ready; a frontend production release was not requested.

Interface follows the existing admin header, tonal table, inputs, buttons and confirmation-dialog components. The table owns horizontal overflow; page controls wrap on small screens.

## Author article navigation correction

The user requested a dedicated article page on 2026-10-13. The Articles action and article-count link now navigate to /admin/news-authors/articles?author=<exact byline>, with page number in the URL. A guarded admin_news_author_articles RPC returns all matching records, including undated articles excluded by the ordinary table read policy. The page provides total counts, pagination, CMS editor links, back navigation and loading/error/empty states. Public article visibility policies are unchanged.

Validation: 64 focused navigation, UI, registry and typography tests; lint and typecheck without new errors; production build; isolated SQL checks for exact names, undated/archived/merged inclusion, pagination and access control. Live rollback queries confirm article totals match author management and staff/nonstaff authorization. Applied RPC history version: 20261013184137.
