# Advanced table import

Upload CSV/TSV/semicolon-delimited files or an Excel worksheet from a content table's tools. Choose a sheet, map source columns to configured editable fields, and match records exactly by ID or a configured scalar field. Preview every row before applying. List search, filters and pagination never constrain matching.

Modes: create only, update only, create or update, and enrich existing (fill missing values). Empty cells preserve stored values by default; clearing is an explicit correction option. System, computed, hidden and read-only fields cannot be written, except real FK columns emitted by editable pickers. Transactional organisation locations use the existing RPC locations argument rather than a virtual column write. Immutable identifiers can be assigned on creation but cannot change on update. An ID column identifies records and is never reassigned.

Parse quoted/multiline text and typed Excel cells without evaluating formulas. Reject malformed rows, duplicate headers/mappings/identities, ambiguous matches, invalid field types, and required/custom validation failures. Offer templates and a downloadable row report. The review shows create/update/unchanged/error counts and before/after differences, with row exclusion and a final explicit apply action.

Read matching candidates independently of the displayed list, across all API pages. Preserve authenticated RLS and configured editor API/RPC/create resolver paths. Use optimistic concurrency for changes, stop on account changes, and never retry an uncertain create automatically. Apply rows sequentially with progress/cancellation; retain per-row outcomes and avoid retrying successful rows. A batch can partially succeed and the report must state that honestly. Database triggers remain responsible for the existing audit trail.

Verification must cover parsing, mapping, match ambiguity and capped pages, four modes, blank/clear policy, immutable/read-only fields, field/custom validators, stale updates, governed save paths, cancellation, partial failure and duplicate prevention, plus the upload/map/preview/apply UI. Production writes require deliberate user application; do not upload test changes to real records merely to demonstrate the UI.

Implementation limits: 10 MB and 20,000 rows per file, with previews paginated 50 rows at a time. This covers the existing tag catalogue in one upload when using a compact import sheet. Navigation away aborts after the current write. Cancellation marks remaining rows together rather than queuing a render per row.

City creation retains the resolver evidence bar (coordinates or Wikidata ID plus country) and uses a table-import actor rather than the interactive admin waiver. Remaining uploaded fields are applied to the newly created row; a failure reports the created ID and stops. The separate organisation relationship editor is not bypassed by uploading virtual relationship columns.
