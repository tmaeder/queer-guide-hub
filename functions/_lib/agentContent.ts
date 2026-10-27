import { STATIC_ROUTE_BODY, type RouteBody } from './routeBody';

export const DOCS_MARKDOWN = `# Queer Guide public API and agent documentation

Queer Guide is a community-led guide to LGBTQ+ life, venues, events, travel, news and knowledge.

## When to use Queer Guide

Use Queer Guide to discover LGBTQ+ places and events, research destinations, and understand queer community terminology. Use the public content API for introductory guide pages and canonical links; use the existing public MCP server for search and entity details. Cite the source URL and check dates. Travel and rights information can change: do not describe a destination or venue as guaranteed safe.

## Getting started and authentication

The read-only REST endpoints below are free to access without an account, API key, trial or sales conversation. They do not write data or return member profiles, messages or private trip plans. No separate REST sandbox or API-key generation is required for these reads. Member actions in the app and authenticated MCP require sign-in. There is no published write API in this specification.

## REST endpoints

- GET /api/v1/pages — lists the introductory public pages available through this API.
- GET /api/v1/pages?prefix=travel — filters the catalog by a slug prefix (at most 128 characters).
- GET /api/v1/pages/{slug} — returns a page title, paragraphs, canonical URL and related links. Use home for the homepage.
- GET /openapi.json — OpenAPI 3.1 specification, with typed schemas and operation IDs.

Example requests:

\`\`\`sh
curl -sS https://queer.guide/api/v1/pages
curl -sS https://queer.guide/api/v1/pages/home
curl -sS -H 'Accept: text/markdown' https://queer.guide/
\`\`\`

The API serves introductory text and links, not an export of all live venue or event records. Reuse canonical links to explore the live guide. The privacy page response is a summary; consult the full policy on the website before sharing personal data.

## Errors and request limits

Errors use application/json with an error object containing code, message and hint, plus a docs URL. Unknown resources return 404, unsupported methods return 405, and invalid parameters return 400. Retry transient 5xx errors with exponential backoff. Honour HTTP 429 and Retry-After when supplied by the platform. No fixed per-client introductory REST quota is promised; cache public reads and avoid bulk polling.

The public search service uses an existing per-IP, per-path fixed-minute quota: 60 requests for search, recommendations and similar results, and 120 for autocomplete. Its RateLimit-Policy and RateLimit response fields follow the current IETF rate-limit draft; numeric RateLimit-Limit, RateLimit-Remaining and RateLimit-Reset compatibility fields are also provided. Reset values are seconds until the window ends. Counters are approximate under concurrent requests; advertised availability is not a reservation. A 429 includes Retry-After, which takes precedence. These headers are exposed through CORS. Health checks and preflight do not consume the quota or advertise a remaining count.

## Versioning and deprecation policy

The /api/v1 public content contract is versioned. New optional fields and endpoints may be added within v1; breaking changes require a new major URL version. We will announce removal of a supported major version in these docs at least 90 days before removal. A deprecated version will carry the RFC 9745 Deprecation header and a Link to migration guidance; a scheduled removal will also carry the RFC 8594 Sunset header. No v1 deprecation or removal is currently scheduled. Clients should tolerate unknown response fields and cache canonical URLs.

## Pricing and trying the API

Public REST and public MCP reads are free: no credit card, account, API key or trial period. See [Pricing and access](https://queer.guide/pricing). Try GET /api/v1/pages/home to inspect a real response without changing data. There is no separate hosted sandbox and no write REST API. Booking and marketplace vendors determine their own prices and terms.

## Official CLI

Download the dependency-free Node.js 22+ CLI from [queer-guide.mjs](https://queer.guide/cli.mjs). It supports public catalog reads and live search; it does not sign in or write member data. Source and tests live in the official Queer Guide repository. A package-registry release is not required to use this standalone CLI.

\`\`\`sh
curl -fsS https://queer.guide/cli.mjs -o queer-guide.mjs
node queer-guide.mjs pages --prefix travel
node queer-guide.mjs page home --json
node queer-guide.mjs search "Zurich" --json
\`\`\`

## Markdown and discovery

The homepage and these docs support Accept: text/markdown and Accept: text/html with Vary: Accept. Quality weights are honoured; unsupported representations return 406 on these negotiated pages. Unknown pages requested as Markdown return a Markdown 404 with recovery links. HTML remains the default for browsers.

- [OpenAPI specification](https://queer.guide/openapi.json)
- [Agent instructions](https://queer.guide/llms.txt)
- [Sitemap](https://queer.guide/sitemap.xml)
- [About](https://queer.guide/about)
- [Contact](https://queer.guide/contact)
- [Privacy](https://queer.guide/privacy)

## Model Context Protocol

The existing public read-only MCP endpoint is https://mcp.queer.guide/mcp (no sign-in). It supports search for venues, events, cities, people and news, entity details, and travel knowledge. Connect with an MCP client using Streamable HTTP, initialize, then discover the current tools with tools/list. The authenticated endpoint is https://mcp.queer.guide/authed; use its sign-in flow for member actions. The MCP service is deployed separately from this website. Discover current capabilities through initialize rather than assuming REST and MCP expose the same features.

The authenticated service advertises the OAuth scope \`member\` in its authorization-server and RFC 9728 protected-resource metadata. This single scope describes existing signed-in member access: submit places/events, save and list your favorites, and create and list your trips, subject to the existing account permissions. It is broad member access, not a separately restricted read-only grant. Use the anonymous endpoint when you only need public information. Existing grants and sign-in behavior are retained; no separate read/write scopes are advertised.
`;

export const PRICING_MARKDOWN = `# Queer Guide pricing and access

## Free public access

Queer Guide is free to browse. The public introductory REST API and public read-only MCP server are also free to use. There is no credit card requirement, API key fee, trial expiry or sales conversation for public reads. Explore [the guide](https://queer.guide/) or try the [public page catalog](https://queer.guide/api/v1/pages).

## Accounts and member actions

Public search does not require sign-in. Member features such as saving favorites, planning trips and submitting contributions require a Queer Guide account and remain subject to the website's terms and privacy policy. Public API access does not grant access to member profiles, messages or private trip plans. The [developer documentation](https://queer.guide/docs) explains authentication and the public interfaces.

## Donations and external purchases

Optional [donations](https://queer.guide/donate) support the platform; a donation is not required to read public content. Products, accommodation, tickets and other offers linked from Queer Guide can have prices set by their vendors. Availability, currency, taxes and cancellation terms depend on the specific offer. Check the vendor's current checkout before committing to any purchase. A free Queer Guide interface does not make those external goods or services free.

## API usage

Use public reads responsibly, cache responses and honor throttling. There is no separate hosted sandbox: the documented introductory read endpoints can be tried without changing data. For corrections or questions about access, [contact Queer Guide](https://queer.guide/contact).
`;

export const PUBLIC_DOCUMENTS: Record<
  string,
  { title: string; description: string; markdown: string }
> = {
  '/docs': {
    title: 'Queer Guide public API and agent documentation',
    description: 'Public REST API, OpenAPI, Markdown and MCP instructions for Queer Guide.',
    markdown: DOCS_MARKDOWN,
  },
  '/pricing': {
    title: 'Queer Guide pricing and free public access',
    description:
      'Free public guide, REST API and MCP access, optional donations and external vendor pricing.',
    markdown: PRICING_MARKDOWN,
  },
};

export const PUBLIC_PAGES: Record<string, RouteBody> = Object.fromEntries(
  Object.entries(STATIC_ROUTE_BODY).map(([path, page]) => [
    path === '/' ? 'home' : path.slice(1),
    page,
  ]),
);

export function pageRecord(slug: string) {
  const page = Object.hasOwn(PUBLIC_PAGES, slug) ? PUBLIC_PAGES[slug] : undefined;
  if (!page) return null;
  return {
    slug,
    title: page.h1,
    url: `https://queer.guide${slug === 'home' ? '/' : '/' + slug}`,
    paragraphs: page.paragraphs,
    links: (page.links ?? []).map((link) => ({
      ...link,
      href: link.href.startsWith('/') ? `https://queer.guide${link.href}` : link.href,
    })),
  };
}

export function pageMarkdown(page: RouteBody): string {
  return `# ${page.h1}\n\n${page.paragraphs.join('\n\n')}\n\n## Explore Queer Guide\n\n${(page.links ?? []).map((link) => `- [${link.label}](${link.href.startsWith('/') ? 'https://queer.guide' + link.href : link.href})`).join('\n')}\n`;
}
