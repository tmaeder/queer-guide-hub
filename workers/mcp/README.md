# Queer Guide MCP readiness repair

The production MCP service is the Cloudflare Worker `queer-guide-mcp` in the Queer Guide account, serving `https://mcp.queer.guide/mcp` and `/authed`. It was deployed on 2026-06-06 and was not represented in this repository. Its deployed, readable JavaScript was recovered through Cloudflare's authenticated Worker script download API on 2026-10-25. No matching source checkout or repository was found in the available local projects or GitHub repositories.

The recovered `src/resources.ts` implementation registers city and country templates whose list callbacks call `get_recommendations`. RPC errors are caught and converted into an empty array. Consequently the SDK advertises resources but `resources/list` returns an empty list. This repair adds permanent agent guidance and OpenAPI resources independently of those RPCs.

Live tool verification also found that search, autocomplete, recommendations and related-item discovery used database RPCs whose anonymous execution was intentionally revoked. `public-queries.mjs` adapts exactly those reads to the existing website service at `https://search.queer.guide`: `/search`, `/autocomplete`, `/recommendations` and `/similar`. That service retains its existing public-content gates. The adapter forwards only public query fields, never user/session identifiers, tokens, embeddings or privileged content flags. Related results are normalized to MCP entity cards. Requests have deadlines, reject redirects, bound response bytes and preserve structured tool errors without reflecting upstream error bodies. Search embedding is performed by the public service rather than duplicated by MCP.

All 15 tool definitions, the existing templates, OAuth, member actions, Durable Objects and bindings remain present. No database grant or backend configuration is changed. Public HTTP is used so the recovered service requires no new binding or secret.

The follow-up discovery repair publishes the existing signed-in capability as
the OAuth scope `member` in authorization-server metadata (`scopesSupported` in
the deployed provider) and RFC 9728 protected-resource metadata. This is broad
member access under existing account rules, not a new granular authorization
model. Public reads remain anonymous, existing grants keep their original scope
values, and token exchange/sign-in behavior is unchanged. `member-metadata.mjs`
is self-contained tested source; the builder guards both OAuth metadata anchors
against the original recovered fingerprint. Do not advertise narrower scopes
unless their restrictions are implemented and tested.

## Source and reproducibility

- `agent-resources.mjs` is the readable and tested resource registration source.
- `public-queries.mjs` contains the public-read adapter and its explicit field allowlist.
- `recovery.json` records the SHA-256 of the original, unmodified entrypoint, not a subsequently repaired deployment. Retain that original download for reproducible builds.
- `recover.mjs` downloads the deployed source and settings without storing credentials. Set `CLOUDFLARE_ACCOUNT_ID` and a `CLOUDFLARE_API_TOKEN` with Workers Scripts read permission, then run `node workers/mcp/recover.mjs`.
- Build the repair with `node workers/mcp/build-resource-repair.mjs workers/mcp/.recovered/index.js workers/mcp/.generated`.
- The builder refuses an unexpected baseline hash or ambiguous registration, RPC or embedding anchors. It adds resources, adapts the four public RPC reads and removes the unavailable source-map reference. Vendor code is not checked into this repository. A fresh download after deployment is a rollback snapshot; do not replace the recorded original fingerprint simply to make the builder accept it.
- Tests: `npm test --prefix workers/mcp` or `node --test workers/mcp/*.test.mjs`. The existing CI worker-test loop discovers this package automatically. The package contains dependency-free tests, not reconstructed vendor dependencies.
- Protocol verification: `node scripts/verify-mcp-readiness.mjs <endpoint> [report.json]`.
- Public-read verification: `node scripts/verify-mcp-public-tools.mjs <endpoint> [report.json]`. Use `--proxy-only` in a local runtime without the production database/AI bindings.

## Release

The generated entrypoint is a repair of the existing service. Upload it without rebundling. Preserve the original compatibility date and flags, existing Durable Object namespace and class, KV namespace, rate-limit configuration, AI binding, variables, secret bindings, OAuth configuration and routes. Do not create new Durable Object migrations or namespace IDs. Keep an exact download of the current live source and settings as a rollback snapshot and verify it has not changed immediately before upload. For the first repair, this matches `recovery.json`; for subsequent repairs, record and verify the actual preceding deployment fingerprint. After release run both verifiers against the public endpoint and test authenticated account flows with an authorized test account. Restore the immediately preceding entrypoint to roll back.

Recover and bring the original complete MCP project into source control before broader service development. This repair retains the deployed dependencies and does not upgrade them without the original lockfile.
