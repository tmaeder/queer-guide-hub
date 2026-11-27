import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

// Exercise Workers' real wire encoding. A web-standard Response unit test
// cannot catch automatic re-compression of an already gzipped HTML stream.
const html = '<!doctype html><title>Public document</title><h1>Public content</h1>';
const bundle = await build({
  stdin: {
    contents: `import {publicDocumentDelivery} from './functions/_lib/publicDocumentDelivery.ts';
      export default {fetch(request) {return publicDocumentDelivery(request, '/',
        new Response(${JSON.stringify(html)}, {headers:{'Content-Type':'text/html'}}));}}`,
    resolveDir: process.cwd(), sourcefile: 'public-document-fixture.ts', loader: 'ts',
  },
  bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022',
});
const runtime = new Miniflare(convertV4MiniflareOptions({ workers: [{
  name: 'public-document-delivery', modules: true, script: bundle.outputFiles[0].text,
  compatibilityDate: '2026-11-01',
}] }));
try {
  for (const encoding of ['gzip', 'identity', 'gzip;q=0']) {
    const response = await runtime.dispatchFetch('https://queer.guide/', {
      headers: { 'Accept-Encoding': encoding },
    });
    assert.equal(response.status, 200);
    // dispatchFetch decodes the wire once, exactly like a browser. A second
    // layer would leave gzip bytes here and render a blank/garbled document.
    assert.equal(await response.text(), html);
    assert.match(response.headers.get('Cache-Control'), /no-transform/);
  }
  console.log('Public document Workers encoding: gzip and identity render intact.');
} finally { await runtime.dispose(); }
