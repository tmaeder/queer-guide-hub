# Redirect link tools

User approved continuation on 2026-10-13 after the proposed tracking, prefill,
and QR scope. Prefill means destination and campaign creation fields; allow
explicit destination query parameters for pages that support them.

Add a row-level link builder and a top-level creation entry point. Prefill the
canonical destination from the selected inventory rule, and retain campaign
settings when duplicating a managed link. Expose source, medium, campaign, term,
and content fields instead of requiring JSON. Create a managed SHORT rule only
when the admin saves it. Show its copied/shareable URL and locally generated
PNG/SVG QR downloads. Validate concrete destinations before generating links.

Restore the /go/:slug public handler by forwarding requests to the existing
Supabase redirect resolver with the query and request context preserved. HEAD
requests resolve without writing visit events. Do not cache tracked redirects.

Show manual-link click totals on the inventory and a visit report with a date
range, daily/country/referrer summaries, and recent visits. Reports page through
all matching events and expose failures. Other inventory rules can create a
managed campaign link; do not imply they already have click-event history.

Verification: parameter encoding, fragments, duplication/prefill, actual QR
payload, downloads, create errors, full event pagination, reports, and the
public handler's GET/HEAD/query/error behavior. Apply existing admin-only access.
