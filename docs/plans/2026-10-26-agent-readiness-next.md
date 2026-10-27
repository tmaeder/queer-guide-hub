# Agent readiness follow-up

The fresh official audit scores 93/100. Continue the existing request to improve readiness while preserving public access, member behavior and visual design.

Prioritize accurate metadata and useful public interfaces over new infrastructure: (1) describe the existing single authenticated MCP member access level in OAuth discovery; (2) add a typed, optional prefix filter to the page catalog, explicit version/deprecation guidance, and truthful free public-access pricing; (3) provide a dependency-free official read-only CLI for public pages and live search; (4) expose the existing search service's actual quota counters and fixed window in current IETF draft fields. A new granular permission model, write API or sandbox would introduce product/security behavior beyond these gaps and is deferred.

The MCP `member` scope describes the existing signed-in account capability, including member reads and writes subject to existing account rules. Public reads stay anonymous. Discovery is additive: existing grants, token exchange and sign-in are unchanged. Do not advertise separate read/write scopes without enforcing them.

The CLI must be useful without package-registry credentials: publish a standalone script on the official website with public page and search commands, JSON output, bounded responses, timeouts and structured errors. Prepare a registry package only if it can be published under an authorized identity; local npm authentication is currently absent.

Use existing documentation page styling for pricing. Public introductory REST and public MCP reads are currently free; external vendors determine booking/marketplace prices. Publish no invented subscription plans, postal address, quota or search-ranking guarantees. No separate sandbox is needed to try side-effect-free reads; document that limitation accurately.

Tests cover changed filtering/error contracts, OAuth metadata through the guarded bundle build, CLI success/failure behavior, and quota headers against real counters. Validate OpenAPI and live/preview HTML, Markdown, API, discovery, CLI and native endpoints. Preserve rollback bundles and all Worker settings before deployment. The unused `api.queer.guide` host currently returns Cloudflare 522 and has no repository references; inspect its actual configuration before considering any host change.
