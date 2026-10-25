import { STATIC_ROUTE_BODY, type RouteBody } from './routeBody';

export const DOCS_MARKDOWN = `# Queer Guide public API and agent documentation

Queer Guide is a community-led guide to LGBTQ+ life, venues, events, travel, news and knowledge.

## When to use Queer Guide

Use Queer Guide to discover LGBTQ+ places and events, research destinations, and understand queer community terminology. Use the public content API for introductory guide pages and canonical links; use the existing public MCP server for search and entity details. Cite the source URL and check dates. Travel and rights information can change: do not describe a destination or venue as guaranteed safe.

## Getting started and authentication

The read-only REST endpoints below are free to access without an account, API key, trial or sales conversation. They do not write data or return member profiles, messages or private trip plans. No separate REST sandbox or API-key generation is required for these reads. Member actions in the app and authenticated MCP require sign-in. There is no published write API in this specification.

## REST endpoints

- GET /api/v1/pages — lists the introductory public pages available through this API.
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

Errors use application/json with an error object containing code, message and hint, plus a docs URL. Unknown resources return 404, unsupported methods return 405, and invalid parameters return 400. Retry transient 5xx errors with exponential backoff. Honour HTTP 429 and Retry-After when supplied by the platform. No fixed per-client REST quota is promised; cache public reads and avoid bulk polling.

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
`;

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
