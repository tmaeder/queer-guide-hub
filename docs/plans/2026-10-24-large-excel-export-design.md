# Large Excel export repair

The live News export from search `gay`, page 2 downloaded all 58,731 records as CSV (fresh production identity digest matched), but Excel generation crashed the in-app browser and produced no XLSX. The CSV contains 366,645,887 text characters and 354 cells exceed Excel's 32,767-character cell limit. This is a concrete failure within the already authorized all-record export task.

Keep the existing ExcelJS path for ordinary small exports. For large tables, write worksheet XML incrementally into a compressed ZIP instead of allocating millions of ExcelJS cell objects, a shared string table, and complete worksheet XML simultaneously. Yield between bounded chunks so the admin page stays responsive. Keep all records, column labels, scalar types, filenames and full-table fetching contracts.

Preserve oversized text losslessly in adjacent, explicitly labelled continuation columns; never silently truncate a field or drop a record. Compute continuation widths before writing, keep each cell within Excel's character limit without splitting surrogate pairs, and retain normal headers when no continuation is needed. Reject Excel row/column limit violations explicitly. Formula-looking values remain literal strings. A machine-readable continuation map in the workbook allows independent reconstruction and comparison with CSV.

Alternatives considered: tweaking ExcelJS shared strings still retains the per-cell object graph and huge XML; server-side exports would add privileged endpoints and deployment scope. Incremental ZIP writing is the smallest repair that keeps downloads in the existing authenticated browser workflow.

Validate real XLSX parsing, all identities beyond 1,000 rows, exact reconstruction of oversized Unicode/control text, scalar types and formula safety, existing download behavior and multi-sheet naming. Benchmark with production-shaped large text under a constrained heap, then follow protected PR CI/merge/deployment and repeat actual production News downloads before marking it passed. Continue the outstanding export matrix; no claim of all-type completion until every required case passes.
