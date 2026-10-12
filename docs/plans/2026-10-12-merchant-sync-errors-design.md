# Merchant sync errors and automatic feedback

Approved by the user on 2026-10-12.

Use Shopify's supported Storefront API for blocked public feeds, verify returned currencies, and bound each invocation while persisting pagination progress. Correct GARÇON's source configuration based on its actual storefront. Preserve disabled merchants and existing product identity.

Record merchant failures in the existing admin feedback inbox, including failures caught inside successful batch responses. Group repeated failures, backfill the current failures, and verify recovery and reporting in production. Make runtime reporter delivery survive response completion.

Validation: mocked upstream failures, pagination/currency checks, live representative Shopify syncs, large catalog progress, GARÇON source test, and feedback occurrence/dedup verification.
