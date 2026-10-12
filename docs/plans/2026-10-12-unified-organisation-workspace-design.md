# Unified Organisation workspace

Approved by the user on 2026-10-12.

Use `/admin/content/organizations` as the single Organisation workspace. Replace
the capped Business directory with the existing paginated CMS directory and
its search, filters, saved views and record editor. Retain Hotels, Merchants,
Brands and Partners operational tabs, including trust-gated ownership review.

Add business relationships to the Organisation editor. Identity and locations
remain in their existing tabs; commercial linking and scoped merchant/partner
settings live in a Relationships tab. Relationships execute their existing
authorized RPCs immediately and must communicate that save boundary clearly.
Venue locations must retain an Organisation owner; do not expose the old
unlink operation for locations. New Organisations must be saved before linking.

Keep one Organisation navigation entry. Redirect `/admin/business` and its
record links to the workspace, preserving tabs and record IDs. Update internal
links and compatibility routes. Preserve existing admin permissions, quality
review routing and operational workflows. Verify redirects, record deep links,
workspace tabs, relationship failures, filter deep links and navigation access.

## Validation

Implemented the unified workspace and compatibility redirects. Verified 236
focused list, route, navigation and relationship tests; editor/location suites
also pass. Type checking reports no new errors against the existing baseline.
Production build and bundle-shape check pass. Browser preview confirms domain
search against public Organisation rows and no document overflow at 390px.
The preview has no authenticated admin session; commercial writes were covered
with mocked RPC tests, not executed against production.
