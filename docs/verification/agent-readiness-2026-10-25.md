# Agent readiness implementation — 2026-10-25

The website changes are implemented on `fix/agent-readiness`. Public review deployment: <https://agent-readiness-review.queer-guide.pages.dev>. The website is awaiting its coordinated production release. The separate MCP repair was deployed and verified on 2026-10-25 at 22:06 UTC; release instructions and the original baseline fingerprint are in `workers/mcp/README.md`.

## Changes mapped to the audit

| Audit item | Implementation and limits |
| --- | --- |
| 1. Content without JavaScript | Homepage and static introductory pages now receive real HTML content for all user agents. Homepage, About, Contact and Privacy each have over 500 readable characters and one H1. React still replaces the root as before. |
| 2. Agent-friendly 404s | Unknown app paths and missing machine files return HTTP 404. `Accept: text/markdown` receives a Markdown error with docs, llms.txt and sitemap recovery links. Existing detail, locale and landing-page 404s also negotiate Markdown. |
| 3. Redirect hygiene | Deterministic existing public aliases resolve through real HTTP 301 responses; locale and query behavior follows the existing client redirects. Homepage is content, not an empty redirect-looking shell. |
| 4. OpenAPI | `/openapi.json` is a validated OpenAPI 3.1 specification for the new public content API. |
| 5. JSON errors | Public API errors have `error.code`, `error.message`, `error.hint` and `docs`, with appropriate 400/404/405/500 statuses. Accidental API HTML fallbacks and unhandled exceptions become JSON errors. Existing successful API responses remain intact. |
| 6. MCP resources | Recovered the deployed `queer-guide-mcp` Worker through Cloudflare's authenticated API. City/country resource lists called RPCs that intentionally reject anonymous execution. Added two permanent documentation resources and adapted four public discovery reads to the website's existing gated public search service. All 15 tool definitions, both templates, OAuth and all seven bindings remain present. Live verification listed 102 resources and read both documentation resources plus city/country records. No database grants changed. |
| 7. Markdown negotiation | Homepage, static introductory pages and `/docs` serve HTML or Markdown at the same URL, honour q-values and emit `Vary: Accept`. Unsupported representations return 406 on these pages. |
| 8. Brand discoverability | Meaningful brand/product content is present in raw homepage HTML. Search placement, earned links and press mentions require indexing time and editorial/outreach decisions; no ranking improvement is claimed. |
| 9. Public API | Anonymous `GET /api/v1/pages` and `GET /api/v1/pages/{slug}` expose actual introductory guide content and canonical links. This is not a full venue/event export; existing public MCP remains the live search interface. |
| 10. Homepage API/docs links | Raw homepage links to `/docs` and `/openapi.json`. The interactive footer includes an ordinary document link to `/docs`, retaining the existing styling. |
| 11. Developer discovery | Predictable `/docs`, `/openapi.json`, `/llms.txt` and `/agent.txt` URLs; docs included in the static sitemap and product-named headings. Search-engine appearance remains external. |
| 12. Organization description | Added a factual Organization description. |
| 13. Onboarding | Documentation provides working anonymous reads and explains that no API key, payment or account is needed. No separate sandbox, write API or API-key workflow has been invented. Authenticated MCP still uses its existing sign-in flow. |
| 14–15. Typed/function-callable schema | Unique operation IDs, operation descriptions, typed parameters, request-free GET operations, explicit response schemas and error schemas. Local schema references checked, and Redocly validation passes. |
| 16. Organization completeness | Added the published legal/privacy contact email and contact type. No verifiable postal address was found on the public legal or privacy pages. An actual organization mailing address is still needed before adding a PostalAddress. |
| 17. Trust pages | About, Contact and Privacy have substantive non-JavaScript introductions. Privacy is explicitly labelled a summary; the full existing CMS policy and interactive page remain unchanged. |
| 18. When-to-use instructions | `llms.txt` and `agent.txt` name specific use cases, REST and MCP access, attribution, freshness and privacy boundaries. |

## Verification

- Production Vite build: passed after installing this checkout's lockfile dependencies. The initial shared dependency tree was missing `web-vitals`; no dependency files were changed to resolve that local mismatch.
- Edge TypeScript: `tsc -p tsconfig.functions.json --noEmit`, passed.
- Regression suite: 80 tests passed across agent HTTP/content/API/schema behavior, footer, edge error design tokens, JSON-LD breadcrumbs, native gateways and feed generation.
- MCP native tests: 15 passed, covering registration, query mapping/privacy/limits/errors/stream bounds, generated-bundle dispatch and baseline/anchor refusal. The existing CI worker-test loop discovers these through the dependency-free MCP package.
- Local website HTTP verification: 37/37 checks passed; includes every page returned by the new API, HTML/Markdown negotiation, headings, redirects, error bodies, CORS, HEAD, docs, OpenAPI, instructions, robots and sitemaps.
- Public preview HTTP verification: run `node scripts/verify-agent-readiness.mjs https://agent-readiness-review.queer-guide.pages.dev` to reproduce the full endpoint check. The final preview report is saved with the task artifacts.
- MCP local protocol verification: successful initialize, initialized notification, resources/list, both resources/read calls, unknown-resource protocol error, tools/list and resources/templates/list. All 15 existing tools and both existing templates remain present. New resources have descriptions, stable URIs, matching MIME types and substantial readable contents.
- MCP production verification at 22:07 UTC: 102 listed resources; both documentation reads and representative city/country reads passed; all eight public read tools responded successfully. Search, autocomplete, recommendations, related items, entity lookup, event windows and on-this-day returned actual results. Knowledge returned no passages, which does not establish editorial coverage. Seven root/OAuth boundary checks passed. Exact deployed source, all seven bindings/settings and MCP domains matched the release snapshot.
- OpenAPI: `npx @redocly/cli lint --extends minimal public/openapi.json`, passed.
- Route-manifest freshness, Pages routing checks, focused ESLint and whitespace checks: passed. Pages retains its pre-existing warning about excluded static-asset paths; this change does not expand billable middleware invocations to all asset requests.

The native endpoint inventory is generated from the Functions tree, in addition to the React route inventory. This prevents the new 404 guard from intercepting existing Atom feeds, XRPC, well-known discovery or short-link handlers. The generated manifest is checked in tests and regenerated before builds.

## Release and remaining decisions

Release the website through the existing main-branch Pages workflow after review, then run the HTTP verifier against <https://queer.guide>. MCP production deployment `69bb0714d70d4092bf09e8edfb9f5760` is already verified; reproduce its checks with `scripts/verify-mcp-readiness.mjs` and `scripts/verify-mcp-public-tools.mjs`. Original and immediately preceding source/settings snapshots are retained as task artifacts for rollback. Successful authenticated account flows still require an authorized test account; no sign-in emails, OAuth clients, private member actions or data writes were performed by this verification.

Provide a real public organization mailing address for PostalAddress. Decide whether a broader data API, write API, key management or dedicated sandbox is a product requirement; public reads currently need none of those. Submit the updated sitemap through the site's search-console account after release and allow recrawling; external search results and the independent Is Agentic score must be re-audited rather than predicted.

Published contact and privacy evidence: <https://queer.guide/legal> and <https://queer.guide/privacy>, read live on 2026-10-25. Neither page provides a postal address. MCP baseline evidence: live initialize advertised resources and resources/list returned an empty array before the repair.
