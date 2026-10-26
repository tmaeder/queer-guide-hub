# Agent readiness follow-up — source verification

Baseline: the fresh official Is Agentic scan at `2026-10-26T20:05:21.440Z` scored **93/100**. This is an implementation checkpoint, not a predicted replacement score.

## Changes

- Advertise the existing broad authenticated MCP capability as `member` in OAuth authorization-server and RFC 9728 protected-resource metadata. Publish its actual account-level meaning in docs and OpenAPI; public REST/MCP reads remain anonymous. Existing grants, sign-in and account authorization are unchanged; separate read/write scopes are not invented.
- Add a typed optional `prefix` filter to the public page catalog, including duplicate/unknown/overlong parameter errors. Existing unfiltered reads retain their shape. The OpenAPI 3.1 description for API version 1.1.0 documents typed inputs on both operations.
- Publish a free-public-access pricing page, negotiated as HTML or Markdown and indexed in the static sitemap. Its styling follows the existing documentation page. Vendor purchases have separate prices and terms; no subscription plans or postal address are fabricated.
- Publish a dependency-free Node.js 22+ CLI at `/cli.mjs` for catalog/page reads and live public search. It supports JSON output, bounded payloads, request deadlines, safe error messages and explicit loopback overrides for local testing. It does not authenticate or write member data. The standalone script is usable without a registry; npm registry publication requires an authorized publishing account.
- Document compatible v1 additions, major versions for breaking changes and a 90-day removal notice with Deprecation/Sunset/migration guidance. There is no current v1 removal scheduled.
- Expose the existing search service's actual approximate per-IP, per-path fixed-minute counters with current IETF draft `RateLimit-Policy`/`RateLimit` fields and numeric compatibility fields. Keep the quota thresholds, 429 payload, Retry-After and CORS origin restrictions. Health/preflight bypasses do not invent remaining quotas.

## Verification at this checkpoint

- **138 focused tests** pass (API, pricing middleware, CLI and route metadata).
- **16 native MCP tests** pass, including executing the guarded built bundle and preserving original provider endpoints/RPC dispatch.
- **128 search Worker tests** pass; quota tests cover observed counters, reset seconds, exhausted quota, no increment on 429, CORS and bypasses.
- Functions and Functions-test TypeScript pass with zero errors. Search Worker TypeScript passes. Application typecheck has no new errors: 660 existing against the unchanged 772 baseline.
- Production website build and search Worker dry-run bundle pass. Redocly validates OpenAPI; its advisory warnings are missing license metadata and the intentionally unused cross-surface MCP OAuth component (public REST security stays empty).
- Local Pages and deployed preview pass **42/42 HTTP checks**, including negotiated pricing, downloaded CLI byte equality and catalog filtering. Downloaded preview CLI executes and reads filtered JSON successfully; live public search also succeeds.
- Native MCP runtime lists **102 resources**, reads embedded docs/OpenAPI, preserves 15 tools/two templates, exposes `member` in both discovery documents and passes all four public proxy reads.

Preview: https://agent-readiness-next-review.queer-guide.pages.dev

Reproduce from the repository root:

```sh
npx vitest run functions/_lib/agentReadiness.test.ts src/test/__tests__/agentCli.test.ts src/__tests__/routeMetaContract.test.ts
node --test workers/mcp/*.test.mjs
npm test --prefix workers/search-proxy
npm run typecheck:functions
npm run typecheck
node scripts/verify-agent-readiness.mjs https://agent-readiness-next-review.queer-guide.pages.dev
node scripts/verify-mcp-readiness.mjs http://127.0.0.1:9908/mcp
```

## Release and remaining inputs

Release requires fresh protected-branch CI and coordinated clearance after #4889, then the normal Pages deployment and separately guarded MCP/search Worker deployments. Retain exact source/settings rollback snapshots and verify all public interfaces again. No production DDL is part of this work.

`api.queer.guide` currently returns Cloudflare 522, has no Worker custom-domain mapping and no repository references. Current credentials cannot inspect its DNS records (403). No DNS or unknown legacy API contract is changed. The documented canonical content API is `https://queer.guide/api/v1/pages`; search uses `https://search.queer.guide`.

Search ranking/indexing, a verified public organization postal address, registry publication, a dedicated sandbox and successful signed-in account testing remain external inputs or product decisions. Rerun the official scanner after production verification; do not claim a new score from source tests alone.
