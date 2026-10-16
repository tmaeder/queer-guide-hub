import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { subpathFixture } from './lib/redirect-subpath-fixture.mjs';
const originCalls = [];
const { setup, runtime } = await subpathFixture('https://website.example.com', '/campaign/r', 'links.example.com', async request => {
  originCalls.push({ url: request.url, method: request.method, body: await request.text() });
  return new Response('Original website body', { status: 200, headers: { 'X-Fixture-Website': 'preserved' } });
});
try {
  for (const suffix of ['', '/', '/community', '/community%2Fencoded', '//another.example/path']) {
    for (const method of ['GET', 'HEAD']) {
      const query = '?utm_source=website&tag=one&tag=two&raw=%2f%2F+%20&qg_qr=1';
      const response = await runtime.dispatchFetch('https://website.example.com/campaign/r' + suffix + query, { method, redirect: 'manual', headers: { Cookie: 'origin_fixture=value', Authorization: 'Bearer origin-fixture' } });
      assert.equal(response.status, 307);
      assert.equal(await response.text(), '');
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.equal(response.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
      assert.equal(response.headers.get('Set-Cookie'), null);
      const destination = new URL(response.headers.get('Location'));
      assert.equal(destination.origin, 'https://links.example.com');
      assert.equal(destination.pathname, suffix || '/');
      assert.equal(destination.search, query);
    }
  }
  assert.equal(originCalls.length, 0, 'Redirect creation fetched origin or destination');
  const install = await runtime.dispatchFetch('https://website.example.com/campaign/r/community?qg_handoff=install&utm_campaign=autumn', { redirect: 'manual' });
  assert.equal(install.headers.get('Location'), 'https://links.example.com/community?qg_handoff=install&utm_campaign=autumn');
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const response = await runtime.dispatchFetch('https://website.example.com/campaign/r/community', { method, redirect: 'manual', ...(['POST','PUT','PATCH'].includes(method) ? { body: 'private-origin-form' } : {}) });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('Allow'), 'GET, HEAD');
    assert.equal(await response.text(), '');
  }
  for (const origin of ['http://website.example.com','https://other.example.com']) {
    assert.equal((await runtime.dispatchFetch(origin + '/campaign/r/community', { redirect: 'manual' })).status, 404);
  }
  assert.equal(originCalls.length, 0, 'Wrong origin or unsupported method reached origin');
  for (const path of ['/','/about','/campaign/river','/campaign/R/community','/campaign/rubbish','/campaign/r/%2e%2e/about']) {
    const source = new URL('https://website.example.com' + path + '?keep=original').href;
    const response = await runtime.dispatchFetch(source, { redirect: 'manual' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('X-Fixture-Website'), 'preserved');
    assert.equal(await response.text(), 'Original website body');
    assert.equal(originCalls.at(-1).url, source);
  }
  const post = await runtime.dispatchFetch('https://website.example.com/contact', { method: 'POST', body: 'original=website', redirect: 'manual' });
  assert.equal(post.status, 200);
  assert.equal(originCalls.at(-1).method, 'POST');
  assert.equal(originCalls.at(-1).body, 'original=website');
  mkdirSync('tmp/subpath-runtime', { recursive: true });
  writeFileSync('tmp/subpath-runtime/worker.js', setup.configuration);
  console.log('Actual generated workerd subpath adapter: exact origin and segment boundary, fixed target, encoded suffix/duplicate query/install/QR preservation, empty GET/HEAD temporary redirects, method denial and unchanged origin fallback pass. No external requests.');
} finally { await runtime.dispose(); }
