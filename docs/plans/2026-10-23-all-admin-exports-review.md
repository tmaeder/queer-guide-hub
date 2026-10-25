# Admin Excel and CSV export review

## Intended behavior

A standard Excel or CSV export contains every record the current admin is authorized to read, regardless of list search, filters, archived/merged view, selected rows, or page. Keep permission checks on the existing data sources. Explicitly selected-record actions retain that narrower scope and say “Export selected.” Analytics exports remain explicitly named reports.

## Approach

Use the existing shared CMS export pipeline for every registered content type and embedded workspace, rather than copying export implementations into each page. A new server export service would add deployment and permission complexity without addressing the current toolbar wiring problem. Keep the specialized guarded user/contact APIs and the combined multi-source redirect inventory.

## Findings and fixes

- The shared CMS toolbar had started forwarding list filters, search and lifecycle visibility into both formats. Remove that scope API entirely. Keep title/primary-key ordering for deterministic pagination.
- Embedded and hidden-header panels lost their export controls. Share the two format actions across normal, workspace and hidden-header tools; replace the hotel's duplicate bespoke Excel action.
- The generic fetch helper treated a short API response as the end, even when the server's cap was lower than the requested page size. Use exact counts and advance by the number of returned rows. If no count is supplied, read until an empty page. Reject failed pages, premature termination, changing counts and duplicate/missing CMS IDs rather than downloading partial files.
- Redirects exported only the filtered inventory. Re-fetch every inventory source, reject incomplete inventories, and offer both formats independently of list filters/page.
- Users had only an Excel action. Add CSV against the same protected, paginated RPC projection. Reject premature empty pages.
- Contacts exported the visible cursor page. Start at the beginning of the protected export projection, follow every cursor, reject repeated cursors/duplicate IDs/failures, and offer both formats.
- Selected-row CSV used a separate serializer without the shared UTF-8 BOM/formula protection and used one API request. Reuse the shared CSV writer and paged reads, and label selected exports explicitly.

## Verification

Registry-wide tests exercise both formats with 1,007 records, duplicate titles and 200-record API caps. Toolbar tests activate search, filters and later pages, and cover hidden headers and workspaces. Fetch tests cover empty tables, exact multiples, unavailable counts, smaller server caps, failures and invalid batches. Actual Excel single-sheet and multi-sheet files are reopened and checked against every input row, including Unicode. Existing CSV escaping/BOM/formula tests and taxonomy workbook/CSV tests remain covered. Specialized redirect, user, contact and selected-row tests cover their respective paging and failure paths.

Validation completed: 168 distinct focused tests passed across the combined and targeted runs, including 74 registry export cases across 37 configurations. Targeted lint passed, the repository typecheck ratchet reported no new errors, and the production Vite build succeeded.

These are isolated code/test changes. Production validation requires deployment of this branch; earlier production tag-download evidence does not validate these new changes.
