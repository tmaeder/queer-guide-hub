# Cape Town coverage and Lighthouse repair

Restore verified Cape Town OSM-backed ingestion and pass the existing production
Lighthouse budgets without weakening assertions or hiding failed audits.

Cape Town's matching OSM tags are absent from the discovery index (including
ways). A documented first-party seed can bridge this gap: Cafe Manhattan's
current official website explicitly identifies an LGBTQI+ owned bar and kitchen
at 74 Waterkant Street. OSM node 4802447522 has the same name and street address
but no LGBTQ tag. Keep the official relevance evidence separate from raw OSM
tags, refresh the node through the live OSM API, require matching identity and
city bounds, and expire evidence after 90 days. No inferred OSM tags, invented
venues, or successful empty claims. Coverage remains candidate-based.

For Lighthouse, first address measured causes: credentialless Wikimedia image
loads to prevent third-party cookies; split or remove synchronous startup work
identified by the CPU profile. Preserve photo attribution and normal image
fallbacks. Investigate Cloudflare's injected detection cost without broadly
turning off protection. Missing source maps are diagnostic, not a reason to
publish source contents. Use a public source-free mapping only if necessary.

Validate focused source/image/startup tests and type checks, then merge through
normal required CI, verify deployments, run a real production Cape Town import,
and collect/assert the full mobile and desktop Lighthouse matrix. Keep current
budgets unchanged and report any remaining external blocker honestly.
