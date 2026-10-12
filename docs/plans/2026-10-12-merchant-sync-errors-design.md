# Merchant sync errors and automatic feedback

Approved by the user on 2026-10-12.

Use Shopify's supported Storefront API for blocked public feeds, verify returned currencies, and bound each invocation while persisting pagination progress. Correct GARÇON's source configuration based on its actual storefront. Preserve disabled merchants and existing product identity.

Record merchant failures in the existing admin feedback inbox, including failures caught inside successful batch responses. Group repeated failures, backfill the current failures, and verify recovery and reporting in production. Make runtime reporter delivery survive response completion.

Validation: mocked upstream failures, pagination/currency checks, live representative Shopify syncs, large catalog progress, GARÇON source test, and feedback occurrence/dedup verification.

## Implemented and verified

Deployed source-shopify-public, marketplace-sync-merchants, and source-shop-crawl. Shopify now uses API version 2026-10, 50 products per page, at most two pages per invocation, verified market currencies and a persistent cursor. Redirects preserve the GraphQL POST; failed feed pages no longer masquerade as catalog completion. GARÇON uses Magento Product microdata with apparel metadata. ABUniverse's European endpoint is pinned to its verified EUR market.

All 72 original failures were re-run successfully in production. Zero merchants remained with an error sync status. Large catalogs continue their remaining refresh pages through the existing hourly workflow; Queer Lit's cursor advanced across successive invocations without its former resource-limit failure.

All 72 original failures have deduplicated feedback records linked to the visible Merchant sync failures story in /admin/feedback. Database triggers capture persisted merchant errors even inside HTTP 200 batches, resolve recovered reports and reopen recurring failures. The shared runtime reporter awaits bounded delivery through the feedback RPC without depending on API_ERROR_SECRET.

Validation: 15 upstream/redirect/delivery regression tests; transaction-rolled-back database assertions for duplicate counts, recovery, recurrence and story visibility; live merchant syncs; browser verification of OK statuses and 72 linked feedback members. The security advisor reported no findings against the new private trigger functions, whose execute privilege is revoked from public clients.

Repository checks: npm run test:merchant-sync passed all 15 tests; targeted ESLint, Prettier and diff checks passed. The typecheck ratchet passed with no new error groups (768 existing diagnostics against a baseline of 794). Server-only regression tests are kept outside the browser TypeScript graph.
