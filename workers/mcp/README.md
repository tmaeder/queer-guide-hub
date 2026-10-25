# Queer Guide MCP resource repair

The production MCP service is the Cloudflare Worker `queer-guide-mcp` in the Queer Guide account, serving `https://mcp.queer.guide/mcp` and `/authed`. It was deployed on 2026-06-06 and was not represented in this repository. Its deployed, readable JavaScript was recovered through Cloudflare's authenticated Worker script download API on 2026-10-25. No matching source checkout or repository was found in the available local projects or GitHub repositories.

The recovered `src/resources.ts` implementation registers city and country templates whose list callbacks call `get_recommendations`. RPC errors are caught and converted into an empty array. Consequently the SDK advertises resources but `resources/list` returns an empty list. This repair adds permanent agent guidance and OpenAPI resources independently of those RPCs. Existing recommendation templates, all 15 tools, OAuth, Durable Objects and bindings remain in the recovered bundle.

## Source and reproducibility

- `agent-resources.mjs` is the readable and tested resource registration source.
- `recovery.json` records the SHA-256 of the unmodified deployed entrypoint.
- `recover.mjs` downloads the deployed source and settings without storing credentials. Set `CLOUDFLARE_ACCOUNT_ID` and a `CLOUDFLARE_API_TOKEN` with Workers Scripts read permission, then run `node workers/mcp/recover.mjs`.
- Build the repair with `node workers/mcp/build-resource-repair.mjs workers/mcp/.recovered/index.js workers/mcp/.generated`.
- The builder refuses an unexpected baseline hash or registration function. It changes only resource registration and removes the unavailable source-map reference. Vendor code is not checked into this repository.
- Unit test: `node --test workers/mcp/agent-resources.test.mjs`.
- Protocol verification: `node scripts/verify-mcp-readiness.mjs <endpoint> [report.json]`.

## Release

The generated entrypoint is a repair of the existing service, not a replacement application. Upload it without rebundling. Preserve the original compatibility date and flags, existing Durable Object namespace and class, KV namespace, rate-limit configuration, AI binding, variables, secret bindings, OAuth configuration and routes. Do not create new Durable Object migrations or namespace IDs. Keep the downloaded source and settings as a rollback snapshot and check that production still matches `recovery.json` immediately before upload. After release run the protocol verifier against the public endpoint and test the authenticated sign-in flow with an authorized test account. Restore the original entrypoint to roll back.

Recover and bring the original complete MCP project into source control before making broader service changes. This narrow repair avoids reconstructing or upgrading its dependencies without the original lockfile.
