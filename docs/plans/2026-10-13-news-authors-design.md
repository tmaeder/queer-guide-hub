# News author management

Approved by the user on 2026-10-13.

Add News Authors to the Editorial admin navigation at /admin/news-authors. Preserve the existing news_articles.author text model and public author filter. Provide server-paginated substring search over all nonempty bylines, article counts, and a paginated article drilldown linking to the existing CMS editor. Include archived and duplicate articles so corrections apply to the complete corpus.

Rename changes one exact byline across its articles. Existing destination names require the explicit merge action. Merge moves articles from one exact name to an existing destination. Both actions require a confirmation showing source and destination, reject invalid bylines, and validate the expected source count to avoid applying a stale preview. Database functions enforce editorial staff authorization and return affected counts. Loading, empty, error/retry, mutation pending, and responsive table states use established admin components.

Verify UI workflows, pagination and errors with component tests; verify SQL authorization, validation, collision handling, count checks and atomic updates using rollback-only database fixtures. Deliver the source and additive migration, without publishing a frontend release unless requested.
