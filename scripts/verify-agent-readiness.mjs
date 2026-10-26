#!/usr/bin/env node
// Verify the deployed HTTP contract, not just file contents. The same command
// can target local Pages, a preview URL, and production after release.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const base = (process.argv[2] ?? 'http://127.0.0.1:8788').replace(/\/$/, '');
const results = [];
function requireVaryAccept(headers) {
  const tokens = (headers.get('Vary') ?? '').split(',').map((value) => value.trim().toLowerCase());
  assert(tokens.includes('accept'), 'Vary must explicitly include the Accept token');
}
// Negative controls for the original audit evidence: Accept-Encoding is not Accept.
requireVaryAccept(new Headers({ Vary: 'User-Agent, ACCEPT, Accept-Encoding' }));
assert.throws(() => requireVaryAccept(new Headers({ Vary: 'User-Agent, Accept-Encoding' })));
assert.throws(() => requireVaryAccept(new Headers()));
async function check(name, run) {
  try {
    await run();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({ name, passed: false, error: error.message });
  }
}
async function get(path, accept, method = 'GET') {
  const response = await fetch(base + path, {
    method,
    redirect: 'manual',
    headers: accept ? { Accept: accept } : {},
    signal: AbortSignal.timeout(25000),
  });
  return { response, text: await response.text() };
}
for (const path of ['/', '/about', '/contact', '/privacy']) {
  await check(`${path} raw HTML`, async () => {
    const { response, text } = await get(path, 'text/html');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Content-Type'), /text\/html/);
    const root = text.match(/<div[^>]+id="root"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '';
    assert(
      root
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim().length > 500,
      'Root must contain more than 500 readable characters',
    );
    assert.equal((root.match(/<h1\b/g) ?? []).length, 1);
    assert(!/<h[3-6]\b/.test(root), 'No skipped heading levels');
    if (path === '/') {
      assert.match(root, /href="\/docs"/);
      const jsonLd = [
        ...text.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g),
      ].map((match) => JSON.parse(match[1]));
      const org = jsonLd.find((item) => item['@type'] === 'Organization');
      assert(org?.description && org?.contactPoint?.email);
    }
  });
  await check(`${path} Markdown negotiation`, async () => {
    const { response, text } = await get(path, 'text/markdown');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Content-Type'), /text\/markdown/);
    requireVaryAccept(response.headers);
    assert(text.startsWith('# ') && text.length > 500);
    assert(!/<html|<script/i.test(text));
  });
}
await check('Homepage content negotiation quality and 406', async () => {
  for (const [accept, type, status] of [
    ['text/html;q=0.9, text/markdown;q=0.1', 'text/html', 200],
    ['text/html;q=0.1, text/markdown;q=0.9', 'text/markdown', 200],
    ['text/markdown;q=0, */*;q=1', 'text/html', 200],
    ['application/json', 'text/plain', 406],
  ]) {
    const { response } = await get('/', accept);
    assert.equal(response.status, status);
    assert(response.headers.get('Content-Type').includes(type));
    requireVaryAccept(response.headers);
  }
});
for (const path of [
  '/some-path-that-does-not-exist-agent-check',
  '/nonexistent-agent-file.json',
  '/nonexistent-agent-file.txt',
  '/fr/fr/places',
  '/functions/agent-readiness-missing',
  '/venues/agent-readiness-resource-that-does-not-exist',
]) {
  for (const accept of ['text/html', 'text/markdown'])
    await check(`${path} ${accept} 404`, async () => {
      const { response, text } = await get(path, accept);
      assert.equal(response.status, 404);
      assert(response.headers.get('Content-Type').includes(accept));
      requireVaryAccept(response.headers);
      assert(text.length > 20);
      if (accept === 'text/markdown') assert.match(text, /llms.txt|sitemap|\/docs/);
    });
}
await check('Existing app routes remain reachable', async () => {
  for (const path of ['/venues', '/events', '/hub/plans', '/auth/callback', '/submit/feedback']) {
    const { response } = await get(path, 'text/html');
    assert.equal(response.status, 200, path);
  }
});
await check('HTTP redirects preserve locale and resolve directly', async () => {
  for (const [path, target] of [
    ['/places', '/travel'],
    ['/de/places?q=zurich', '/de/travel?q=zurich'],
  ]) {
    const { response } = await get(path, 'text/html');
    assert([301, 302, 307, 308].includes(response.status));
    assert.equal(
      new URL(response.headers.get('Location'), base).pathname,
      new URL(target, base).pathname,
    );
    const final = await fetch(new URL(response.headers.get('Location'), base), {
      headers: { Accept: 'text/html' },
    });
    assert.equal(final.status, 200);
  }
});
for (const accept of ['text/html', 'text/markdown'])
  await check(`Docs ${accept}`, async () => {
    const { response, text } = await get('/docs', accept);
    assert.equal(response.status, 200);
    assert(response.headers.get('Content-Type').includes(accept));
    requireVaryAccept(response.headers);
    assert(text.includes('authentication') || text.includes('authentication'.replace('a', 'A')));
    assert(text.includes('mcp.queer.guide/mcp') && text.includes('/api/v1/pages'));
  });
for (const accept of ['text/html', 'text/markdown'])
  await check(`Pricing ${accept}`, async () => {
    const { response, text } = await get('/pricing', accept);
    assert.equal(response.status, 200);
    assert(response.headers.get('Content-Type').includes(accept));
    requireVaryAccept(response.headers);
    assert(text.length > 500 && text.includes('Free public access') && text.includes('vendors'));
  });
await check('Pricing HEAD and unsupported representation', async () => {
  const head = await fetch(new URL('/pricing', base), { method: 'HEAD' });
  assert.equal(head.status, 200);
  requireVaryAccept(head.headers);
  assert.equal(await head.text(), '');
  const unsupported = await get('/pricing', 'application/json');
  assert.equal(unsupported.response.status, 406);
  requireVaryAccept(unsupported.response.headers);
});
await check('Official CLI is downloadable JavaScript from this deployment', async () => {
  const { response, text } = await get('/cli.mjs');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Type'), /javascript/);
  assert.equal(text, readFileSync('public/cli.mjs', 'utf8'));
});
for (const path of ['/llms.txt', '/agent.txt'])
  await check(path, async () => {
    const { response, text } = await get(path);
    assert.equal(response.status, 200);
    assert(response.headers.get('Content-Type').includes('text/plain'));
    assert(text.startsWith('# Queer Guide\n'));
    assert(text.includes('## When to use') && text.includes('/openapi.json'));
  });
let spec;
await check('OpenAPI is parseable and self-describing', async () => {
  const { response, text } = await get('/openapi.json');
  assert.equal(response.status, 200);
  assert(response.headers.get('Content-Type').includes('application/json'));
  spec = JSON.parse(text);
  assert.equal(spec.openapi, '3.1.0');
  const ids = Object.values(spec.paths).map((path) => path.get.operationId);
  assert.equal(new Set(ids).size, ids.length);
});
await check('All public page endpoints return schema-shaped content', async () => {
  const { response, text } = await get('/api/v1/pages');
  assert.equal(response.status, 200);
  assert(response.headers.get('Content-Type').includes('application/json'));
  const { pages } = JSON.parse(text);
  assert(pages.length > 4);
  for (const page of pages) {
    const result = await get('/api/v1/pages/' + page.slug);
    assert.equal(result.response.status, 200, page.slug);
    const record = JSON.parse(result.text);
    for (const field of spec.components.schemas.Page.required) assert(field in record);
    assert.equal(record.slug, page.slug);
    assert(record.paragraphs.every((item) => typeof item === 'string'));
    assert(
      record.links.every((link) => typeof link.href === 'string' && typeof link.label === 'string'),
    );
  }
});
await check('Typed catalog prefix filters are optional and validated', async () => {
  const all = JSON.parse((await get('/api/v1/pages')).text).pages;
  const filtered = await get('/api/v1/pages?prefix=travel');
  assert.equal(filtered.response.status, 200);
  assert.deepEqual(JSON.parse(filtered.text).pages, all.filter((page) => page.slug.startsWith('travel')));
  for (const suffix of ['prefix=a&prefix=b', 'prefix=' + 'x'.repeat(129)]) {
    const invalid = await get('/api/v1/pages?' + suffix);
    assert.equal(invalid.response.status, 400);
    assert.equal(JSON.parse(invalid.text).error.code, 'INVALID_PARAMETERS');
  }
});
for (const [path, method, status] of [
  ['/api/not-a-real-endpoint', 'GET', 404],
  ['/api/v1/pages/missing', 'GET', 404],
  ['/api/v1/pages/home?bad=1', 'GET', 400],
  ['/api/v1/pages', 'POST', 405],
])
  await check(`${method} ${path} JSON error`, async () => {
    const { response, text } = await get(path, undefined, method);
    assert.equal(response.status, status);
    assert(response.headers.get('Content-Type').includes('application/json'));
    const body = JSON.parse(text);
    assert(body.error.code && body.error.message && body.error.hint && body.docs);
  });
await check('HEAD and CORS', async () => {
  for (const path of ['/', '/docs', '/api/v1/pages/home']) {
    const { response, text } = await get(path, 'text/markdown', 'HEAD');
    assert.equal(response.status, 200);
    assert.equal(text, '');
    if (!path.startsWith('/api/')) requireVaryAccept(response.headers);
  }
  const { response } = await get('/api/v1/pages', undefined, 'OPTIONS');
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
});
for (const path of ['/robots.txt', '/sitemap.xml', '/sitemap-static.xml'])
  await check(path, async () => {
    const { response, text } = await get(path);
    assert.equal(response.status, 200);
    assert(!text.includes('<!DOCTYPE html>'));
    if (path.endsWith('.xml')) assert(text.includes('http://www.sitemaps.org/schemas/sitemap/0.9'));
    if (path === '/sitemap-static.xml') {
      const locations = [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
        (match) => new URL(match[1]).href,
      );
      assert(locations.some((location) => location === 'https://queer.guide/docs'));
    }
  });
const report = {
  base,
  checkedAt: new Date().toISOString(),
  varyHeaderControls: {
    acceptsCaseInsensitiveToken: true,
    rejectsAcceptEncodingOnly: true,
    rejectsMissingVary: true,
  },
  passed: results.filter((r) => r.passed).length,
  total: results.length,
  results,
};
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (report.passed !== report.total) process.exitCode = 1;
