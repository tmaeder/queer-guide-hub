# Search polish

Preserve the site's paper/ink palette, editorial display type, and coloured route markers. Keep existing search, discovery, guide, trip and saved-search destinations.

## Findings and changes

- The empty overlay spent too much vertical space on discovery and clipped mode labels. Use a responsive intent grid, two columns of desktop discovery, wrapped mode choices, a visible browse disclosure, and a viewport-bounded scrolling body.
- The results toolbar dominated the page. Replace its large filled panel with a compact divided row, keep scope controls aligned to the content gutter, and make result rows responsive with separated actions.
- Clickable tags lacked keyboard access. Render native buttons with selection state. Use the shared image primitive for failed image recovery.
- Requests could overwrite newer queries. Snapshot request filters and discard outdated completions, including during the next query's debounce.
- Pagination could collapse previously accumulated rows. Accumulate completed responses by query/filter/sort identity and deduplicate by entity type and id.
- Saved searches and navigation did not restore every filter. Derive filters from the URL and serialize audiences, dates, prices, flags and zero-valued geographic coordinates.
- Clearing filters also cleared the query. Preserve the query when clearing filters, and allow an empty form submission to remove the query deliberately.
- Failures looked like zero results with no recovery action. Render failure copy with a retry action, including filter-only searches.

## Validation

Focused existing search tests, new out-of-order response and page-zero regressions, and URL round-trip tests. Browser checks at desktop and 390px mobile widths. The live Germany query returned the country first and German places, events and history afterward. A later live request timed out; recovery state and retry were checked. A pagination check reproduced unrelated popular venues in a later response. Remove the search worker’s popularity top-up from query results, and return a retryable 503 for a failed search backend. No database changes were made.

Worker verification: all 98 service tests passed and the Worker typecheck passed. Frontend search tests passed, including 19 final page/card tests, and lint passed. The full frontend typecheck was stopped after more than 15 minutes without completion; it is not confirmed.

Production release: search Worker version `1f64c19e-76c3-4f05-a903-627b0fa0a4f3`; frontend commit `50598833c488b766d0f9ff4c8458084b527d7c58`. Release built on the existing production base `78ea7377a`, preserving concurrent product releases. The release workflow repaired stale asset cache entries. Live Germany pagination and event-only browsing returned matching results. A signed-in check found saved budgets excluding unpriced entities from All results; budgets now apply only inside venue/event/marketplace scopes, with seven regression cases.
