# Unified redirect inventory

Approved by the user on 2026-10-13. Mode: Operate; inherit the admin index styling.

The redirects index currently reads only `redirects`, which has no production
records. Production contains 19,853 URL redirect records in sixteen other
tables, plus static edge rules and client route aliases.

Replace the index with one searchable, paginated inventory showing source,
destination, status, HTTP code where applicable, and origin. Read every page of
each source rather than accepting the Data API row limit. Resolve current
canonical slugs; retain unresolved records with a visible missing-target state.
Keep source failures visible and label partial totals. Static rewrites (200)
are not redirects. Client navigation has no HTTP redirect status.

Keep manual creation, editing, import, preview, and analytics through the
existing CMS editor and tools. Automatic rules remain owned by their source;
do not copy them into the manual table or change runtime routing. Preserve
existing RLS; use only the signed-in client's current access. Cache the
inventory and render fifty rows per page. Verify pagination, source failures,
canonical destinations, filtering, manual tools, and desktop/mobile layout.
