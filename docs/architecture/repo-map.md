# Repository map

Use the [root README](../../README.md) for local setup and the [documentation index](../README.md) for system references and runbooks.

## Runtime entry points

| Area                        | Start here                                                                                                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web app                     | [`src/main.tsx`](../../src/main.tsx) mounts [`App.tsx`](../../src/App.tsx). [`routes.tsx`](../../src/routes.tsx) defines the routes.                                                   |
| Pages edge                  | [`functions/`](../../functions/) contains Cloudflare Pages middleware and endpoints for sitemaps and page metadata.                                                                    |
| Database and edge functions | [`supabase/migrations/`](../../supabase/migrations/) defines database changes. [`supabase/functions/`](../../supabase/functions/README.md) contains Deno endpoints and shared modules. |
| Cloudflare Workers          | [`workers/`](../../workers/README.md) contains independently deployed services. Each Worker defines its entry point and bindings in its own Wrangler config.                           |
| Search                      | The [search architecture](../../SEARCH_SYSTEM.md) traces requests from the search Worker to PostgreSQL and documents the indexing pipeline.                                            |
| Scraper and ingestion       | Start with the [scraper package](../../scraper/README.md) for source adapters and the [project reference](../../CLAUDE.md#architecture) for ingestion stages.                          |
| Browser extension           | The [extension package](../../extension/README.md) documents the browser submission flow.                                                                                              |
| Mobile app                  | The [mobile package](../../mobile/README.md) documents the Expo app and its local setup.                                                                                               |

## Where changes go

- Put web screens in `src/pages/` and reusable UI in `src/components/`. Follow the [frontend conventions](../../src/README.md) and keep unit tests with the code they cover.
- Put database changes in `supabase/migrations/`, Deno endpoints in `supabase/functions/`, and Pages middleware in `functions/`.
- Put one-off operator scripts in [`scripts/`](../../scripts/README.md), browser end-to-end tests in [`e2e/`](../../e2e/), and shared test guidance in [test conventions](../testing/CONVENTIONS.md).

Use the [operations runbook](../operations.md) to check live schedules and service health. Migration history records how jobs were introduced and changed. The deployed database shows which jobs are active.
