# Captured event descriptions

Sixteen active AgendaQ events have fuller HTML descriptions in their registered source while their native descriptions remain short. Another 270 such source records belong to completed events; the ordinary future-event worker does not claim those. These are observed candidates, not credited repairs.

The content worker now reads bounded original fragments through the installed parse5 HTML parser (pinned edge import 8.0.1). It preserves paragraph text, decodes entities once and omits scripts, styles, hidden content and inactive markup. Oversized, deeply nested, short, boilerplate or reconstructed-markup output stays unresolved. No scrape or inference is needed.

The captured-copy path requires the exact AgendaQ canonical URL, title, slug and start/end instants. It preserves any description provenance and any existing prose that differs from the source's short summary. A source ID and payload hash are retained in the native completion signal. Existing field guards, worklist eligibility, leases, budgets and scheduling remain.

Migration `99991792712269_event_gap_captured_source_copy.sql` extends the two bounded claim projections, preserving their worklist rules. Nine parser/worker Deno tests pass, including an actual mocked worker completion at zero model budget with zero page requests and inference attempts. Edge typecheck, scoped ESLint and the migration grammar check pass. The native projection and actual fills require post-release verification; no production copy has yet been filled by this revision.
