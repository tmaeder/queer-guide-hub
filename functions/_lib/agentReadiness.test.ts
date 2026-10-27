import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  preferredContent,
  isKnownAppPath,
  isEdgeEndpoint,
  appRedirect,
  markdownNotFound,
} from './agentHttp';
import {
  pageMarkdown,
  PUBLIC_PAGES,
  pageRecord,
  DOCS_MARKDOWN,
  PUBLIC_DOCUMENTS,
} from './agentContent';
import { publicPages } from '../api/v1/pages';
import { homepageJsonLd } from './jsonLd';
import { buildBodyHtml, buildNoscriptHtml } from './routeBody';
import { onRequest as apiMiddleware } from '../api/_middleware';
import { onRequest as siteMiddleware } from '../_middleware';

const request = (path: string, method = 'GET') =>
  new Request('https://queer.guide' + path, { method });

describe('HTTP representation negotiation', () => {
  it.each([
    [null, 'html'],
    ['*/*', 'html'],
    ['text/html', 'html'],
    ['text/markdown', 'markdown'],
    ['text/markdown;q=0', null],
    ['application/json', null],
    ['text/html;q=0.9, text/markdown;q=0.4', 'html'],
    ['text/html;q=0.4, text/markdown;q=0.9', 'markdown'],
    ['text/*;q=0.8, text/html;q=0', 'markdown'],
    ['text/markdown;q=0, */*;q=1', 'html'],
    ['TEXT/MARKDOWN; charset=utf-8', 'markdown'],
  ])('%s selects %s', (header, expected) => expect(preferredContent(header)).toBe(expected));
  it('returns a recoverable Markdown 404', async () => {
    const response = markdownNotFound();
    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toContain('text/markdown');
    expect(response.headers.get('Vary')).toBe('Accept');
    expect(await response.text()).toMatch(/llms.txt/);
  });
});

describe('route guard and redirects', () => {
  it.each([
    '/go/example',
    '/feeds/tags/pride',
    '/feeds/u/example',
    '/xrpc/app.bsky.feed.getFeedSkeleton',
    '/.well-known/webfinger',
  ])('preserves native endpoint %s', (path) => expect(isEdgeEndpoint(path)).toBe(true));
  it('keeps the generated route contract in sync', async () => {
    const { execFileSync } = await import('node:child_process');
    expect(() =>
      execFileSync(process.execPath, ['scripts/agent-route-manifest.mjs', '--check']),
    ).not.toThrow();
  });

  it.each([
    '/',
    '/about',
    '/privacy',
    '/venues',
    '/venues/a-slug',
    '/hub/plans',
    '/trips/shared/token',
    '/auth/callback',
    '/admin/content/venues',
    '/@valid_handle',
    '/submit/feedback',
  ])('preserves %s', (path) => expect(isKnownAppPath(path)).toBe(true));
  it.each([
    '/this-path-does-not-exist',
    '/unknown/nested',
    '/unknown.json',
    '/hub/unknown',
    '/auth/typo',
  ])('rejects %s', (path) => expect(isKnownAppPath(path)).toBe(false));
  it('resolves localized aliases and preserves their query string', () => {
    expect(appRedirect('/places', 'de', '?q=zurich')).toBe('/de/travel?q=zurich');
    expect(appRedirect('/', 'en', '')).toBeNull();
  });
});

describe('public content and discovery', () => {
  it.each(['home', 'about', 'contact', 'privacy'])('%s has substantial raw content', (slug) => {
    const page = pageRecord(slug)!;
    expect(page.paragraphs.join(' ').length).toBeGreaterThan(500);
    const html = buildBodyHtml(slug === 'home' ? '/' : '/' + slug, {
      title: page.title,
      description: '',
    });
    expect(html.match(/<h1>/g)).toHaveLength(1);
    expect(buildNoscriptHtml(slug === 'home' ? '/' : '/' + slug)).not.toContain('<h1');
    expect(pageMarkdown(PUBLIC_PAGES[slug])).toContain('# ' + page.title);
  });
  it('links docs and machine-readable discovery from the homepage', () => {
    expect(pageRecord('home')?.links.map((link) => link.href)).toContain(
      'https://queer.guide/docs',
    );
    const llms = readFileSync('public/llms.txt', 'utf8');
    expect(llms).toMatch(/^# Queer Guide/);
    expect(llms).toContain('## When to use');
    expect(llms).toContain('https://mcp.queer.guide/mcp');
    expect(readFileSync('public/agent.txt', 'utf8')).toBe(llms);
    expect(DOCS_MARKDOWN).toContain('without an account, API key');
  });
  it('publishes only supported organization details', () => {
    const document = new DOMParser().parseFromString(homepageJsonLd(), 'text/html');
    const org = JSON.parse(
      document.querySelector('script[type="application/ld+json"]')!.textContent!,
    );
    expect(org.description.length).toBeGreaterThan(40);
    expect(org.contactPoint.email).toBe('legal@queer.guide');
    expect(org.contactPoint.contactType).toBe('legal and privacy enquiries');
  });
});

describe('public REST API', () => {
  it('filters catalog slugs without changing the unfiltered response', async () => {
    const all = (await publicPages(request('/api/v1/pages')).json()) as {
      pages: { slug: string }[];
    };
    for (const prefix of ['', 'travel', 'venues', 'not-a-page', '__proto__', '🌈'.repeat(100)]) {
      const response = publicPages(request('/api/v1/pages?prefix=' + encodeURIComponent(prefix)));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        pages: all.pages.filter((p: { slug: string }) => p.slug.startsWith(prefix)),
      });
    }
    const head = publicPages(request('/api/v1/pages?prefix=travel', 'HEAD'));
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });
  it.each(['prefix=a&prefix=b', 'prefix=' + 'x'.repeat(129), 'unexpected=true'])(
    'rejects unsupported filters: %s',
    async (query) => {
      const response = publicPages(request('/api/v1/pages?' + query));
      expect(response.status).toBe(400);
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
        'INVALID_PARAMETERS',
      );
    },
  );
  it('lists and reads every published page', async () => {
    const list = (await publicPages(request('/api/v1/pages')).json()) as {
      pages: { slug: string }[];
    };
    expect(list.pages.length).toBeGreaterThan(4);
    for (const page of list.pages) {
      const response = publicPages(request('/api/v1/pages/' + page.slug));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(pageRecord(page.slug));
    }
    expect(pageRecord('toString')).toBeNull();
  });
  it.each([
    ['/api/v1/pages/missing', 'GET', 404, 'PAGE_NOT_FOUND'],
    ['/api/v1/pages/home?unexpected=yes', 'GET', 400, 'INVALID_PARAMETERS'],
    ['/api/v1/pages/%FF', 'GET', 400, 'INVALID_PATH'],
    ['/api/v1/pages', 'POST', 405, 'METHOD_NOT_ALLOWED'],
  ])('%s %s returns structured error', async (path, method, status, code) => {
    const response = publicPages(request(path, method));
    expect(response.status).toBe(status);
    const body = (await response.json()) as {
      error: { code: string; message: string; hint: string };
      docs: string;
    };
    expect(body.error.code).toBe(code);
    expect(body.error.message.length).toBeGreaterThan(10);
    expect(body.error.hint.length).toBeGreaterThan(10);
    expect(body.docs).toBe('https://queer.guide/docs');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
  it('supports CORS preflight and HEAD', async () => {
    const preflight = publicPages(request('/api/v1/pages', 'OPTIONS'));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    expect(await publicPages(request('/api/v1/pages/home', 'HEAD')).text()).toBe('');
  });
  it('converts accidental HTML API fallbacks and exceptions to JSON errors', async () => {
    for (const next of [
      async () => new Response('<html>SPA</html>', { headers: { 'Content-Type': 'text/html' } }),
      async () => {
        throw new Error('secret');
      },
    ]) {
      const response = await apiMiddleware({ next } as Parameters<typeof apiMiddleware>[0]);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.headers.get('Content-Type')).toContain('application/json');
      expect(await response.text()).not.toContain('secret');
    }
  });
  it('has unique operation IDs, typed parameters, response schemas and valid local refs', () => {
    const spec = JSON.parse(readFileSync('public/openapi.json', 'utf8'));
    expect(spec.openapi).toBe('3.1.0');
    const ids = new Set();
    for (const path of Object.values(spec.paths) as {
      get: {
        description: string;
        operationId: string;
        parameters?: { schema: { type: string } }[];
        responses: Record<string, { content: Record<string, { schema: unknown }> }>;
      };
    }[]) {
      const operation = path.get;
      expect(operation.description).toBeTruthy();
      expect(ids.has(operation.operationId)).toBe(false);
      ids.add(operation.operationId);
      for (const param of operation.parameters ?? []) expect(param.schema.type).toBeTruthy();
      for (const response of Object.values(operation.responses) as {
        content: Record<string, { schema: unknown }>;
      }[])
        expect(response.content['application/json'].schema).toBeTruthy();
    }
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      if ('$ref' in node && typeof node.$ref === 'string') {
        const resolved = node.$ref
          .split('/')
          .slice(1)
          .reduce<unknown>(
            (value, key) =>
              value && typeof value === 'object' && key in value
                ? Reflect.get(value, key)
                : undefined,
            spec,
          );
        expect(resolved).toBeTruthy();
      }
      Object.values(node).forEach(walk);
    };
    walk(spec);
  });
});

describe('published agent policies and schemas', () => {
  it.each(['text/html', 'text/markdown'])(
    'serves real pricing content negotiated as %s',
    async (accept) => {
      const response = await siteMiddleware({
        request: new Request('https://queer.guide/pricing', { headers: { Accept: accept } }),
        env: {},
        next: () => {
          throw new Error('pricing must be served without an app-shell fallback');
        },
      } as unknown as Parameters<typeof siteMiddleware>[0]);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain(accept);
      expect(response.headers.get('Vary')).toContain('Accept');
      const text = await response.text();
      expect(text.length).toBeGreaterThan(500);
      expect(text).toContain('Free public access');
      if (accept === 'text/html') {
        const doc = new DOMParser().parseFromString(text, 'text/html');
        expect(doc.querySelectorAll('h1').length).toBe(1);
        expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
          'https://queer.guide/pricing',
        );
      }
    },
  );
  it('preserves HEAD and returns 406 for unsupported pricing representations', async () => {
    for (const [method, accept, status] of [
      ['HEAD', 'text/html', 200],
      ['GET', 'application/json', 406],
    ] as const) {
      const r = await siteMiddleware({
        request: new Request('https://queer.guide/pricing', {
          method,
          headers: { Accept: accept },
        }),
        env: {},
        next: () => {
          throw new Error('unexpected fallback');
        },
      } as unknown as Parameters<typeof siteMiddleware>[0]);
      expect(r.status).toBe(status);
      if (method === 'HEAD') expect(await r.text()).toBe('');
    }
  });
  it('publishes truthful pricing, existing member scope and versioning guidance', () => {
    expect(PUBLIC_DOCUMENTS['/pricing'].markdown.length).toBeGreaterThan(500);
    expect(PUBLIC_DOCUMENTS['/pricing'].markdown).toContain('free');
    expect(PUBLIC_DOCUMENTS['/pricing'].markdown).toContain('vendors');
    expect(DOCS_MARKDOWN).toContain('90 days');
    expect(DOCS_MARKDOWN).toContain('No v1 deprecation');
    expect(DOCS_MARKDOWN).toContain('broad member access');
    expect(DOCS_MARKDOWN).toContain('https://queer.guide/cli.mjs');
  });
  it('gives every operation typed inputs while keeping REST reads anonymous', () => {
    const spec = JSON.parse(readFileSync('public/openapi.json', 'utf8'));
    expect(spec.security).toEqual([]);
    for (const value of Object.values(spec.paths) as {
      get: { security: unknown[]; parameters: { schema: { type: string } }[] };
    }[]) {
      expect(value.get.security).toEqual([]);
      expect(value.get.parameters.length).toBeGreaterThan(0);
      for (const p of value.get.parameters) expect(p.schema.type).toBe('string');
    }
    expect(
      Object.keys(spec.components.securitySchemes.MemberMcpOAuth.flows.authorizationCode.scopes),
    ).toEqual(['member']);
    expect(readFileSync('public/llms.txt', 'utf8')).toBe(readFileSync('public/agent.txt', 'utf8'));
  });
});
