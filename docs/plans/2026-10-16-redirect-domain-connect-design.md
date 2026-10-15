# Authorized DNS setup and transfer audit

The approved Dub Links parity scope includes native DNS-provider approval. Dub's
current documentation exposes Cloudflare/Vercel auto-configuration and sending
exact instructions. Domain Connect is the applicable provider-controlled flow;
a broad platform-admin DNS token would not implement customer authorization.

Start with a fixed, signed subdomain template plus pure signing boundary, then
add current-owner/versioned setup operations, bounded discovery of supported DNS
providers/templates, explicit record review, provider approval and callback
handling. Verify current DNS through the existing ownership checker after return.
Keep ownership, provider certificate and branded routing checks separate. The
fixed record target must match the configured SaaS target. The candidate template
and signing helper alone do not enable DNS setup or claim provider availability.

Provider onboarding, public-key DNS and actual approval remain release work. Do
not expose an apparent working auto-configuration control until the provider
supports the exact approved template and the authenticated operation path exists.
Cloudflare ignores state, requires a signature and requires sig last; put bounded
operation correlation in the fixed-origin, signed redirect URI. The signature
covers the exact encoded query except key and sig. Do not accept caller-supplied
callback URLs, target hosts, arbitrary template variables or an apex application
through this subdomain signer. Its callback correlates an operation; it is not
proof of successful DNS changes. No provider account, private signing key, live
public key, DNS mutation, upstream PR or onboarding email is created here.

Domain transfer is a separate architectural gap. Current redirect resources,
folders, domains, memberships and preferences form one shared workspace; there
is no workspace entity/ID on those resources. Dub transfers the domain plus its
links between distinct accessible workspaces. Reassigning created_by would leave
all existing authorization and data in the same workspace, and cannot satisfy
that requirement. A genuine implementation needs independent workspace identity,
membership, tenant-bound resources/credentials, selection and data isolation,
then an atomic domain/link transfer with current source/destination authorization,
primary-domain exclusion and defined statistics/tag treatment. This scope remains
open and must not be represented by a creator-change button or export-only flow.

Evidence: current schema and resource APIs were inspected; the official Dub domain
transfer and auto-configuration pages, Domain Connect specification and provider
onboarding instructions were read. The candidate is checked by the official
linter in standard/Cloudflare modes, with actual RSA signature/tamper tests. No UI
or production changes are implied by this protocol foundation.
