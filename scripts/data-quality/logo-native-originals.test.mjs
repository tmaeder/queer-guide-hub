import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import {
  officialLogoOriginalUrls,
  transformedLogoRequest,
  resolveQualityLogo,
  officialLogoCandidates,
} from '../../supabase/functions/_shared/logo-quality.ts';

function png(w, h, blank = false) {
  const chunk = (name, b) => {
    const c = Buffer.alloc(b.length + 12);
    c.writeUInt32BE(b.length);
    c.write(name, 4);
    b.copy(c, 8);
    return c;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * (w * 4 + 1) + 1 + x * 4;
      const v = blank ? 255 : (x + y) % 2 ? 20 : 240;
      raw[i] = raw[i + 1] = raw[i + 2] = v;
      raw[i + 3] = 255;
    }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const rules = [
  { value: 'helloasso.com', match_mode: 'suffix', class: 'aggregator' },
  { value: 'facebook', match_mode: 'label', class: 'social' },
  { value: 'wordpress', match_mode: 'label', class: 'builder' },
];
const noProvider = async () => ({ outcome: 'not_indexed', logo: null });

test('Next image renditions expose their safe native source rather than an enlarged response', () => {
  const rendition = 'https://venue.example/_next/image?url=%2Flogo.webp&w=750&q=75';
  assert.deepEqual(officialLogoOriginalUrls(rendition, 'https://venue.example/'), [
    'https://venue.example/logo.webp',
    rendition,
  ]);
  assert.equal(transformedLogoRequest(rendition), true);
  for (const source of [
    'http://127.0.0.1/logo.png',
    'http://[::1]/logo.png',
    'file:///tmp/logo.png',
    'data:image/png;base64,AAAA',
  ]) {
    const unsafe =
      'https://venue.example/_next/image?url=' + encodeURIComponent(source) + '&w=1200';
    assert.deepEqual(officialLogoOriginalUrls(unsafe, 'https://venue.example/'), [unsafe]);
  }
});

test('Bento native logos remove generated padding, paint and resizing while retaining asset versions', () => {
  const rendition =
    'https://images.getbento.com/brand_logo-white.png?w=1200&fit=fill&auto=compress%2Cformat&h=600&bg=EDEDF1&pad=100&v=2';
  assert.deepEqual(officialLogoOriginalUrls(rendition, 'https://venue.example/'), [
    'https://images.getbento.com/brand_logo-white.png?v=2',
    rendition,
  ]);
  assert.equal(transformedLogoRequest(rendition), true);
  assert.equal(
    transformedLogoRequest('https://images.getbento.com/brand_logo-white.png?v=2'),
    false,
  );
  assert.deepEqual(
    officialLogoOriginalUrls(
      'https://unrelated.example/logo.png?w=500&bg=red',
      'https://venue.example/',
    ),
    ['https://unrelated.example/logo.png?w=500&bg=red'],
  );
});

test('a large Next or Bento rendition cannot automatically replace a tiny native logo', async () => {
  const original = globalThis.fetch;
  try {
    for (const rendition of [
      'https://example.com/_next/image?url=%2Flogo.png&w=1200&q=75',
      'https://images.getbento.com/logo.png?w=1200&h=600&bg=EDEDF1',
    ]) {
      const native = officialLogoOriginalUrls(rendition, 'https://example.com/')[0];
      globalThis.fetch = async (url) => {
        if (String(url) === native)
          return new Response(png(128, 128), { headers: { 'content-type': 'image/png' } });
        if (String(url) === rendition)
          return new Response(png(512, 512), { headers: { 'content-type': 'image/png' } });
        return new Response(
          '<script type="application/ld+json">' +
            JSON.stringify({
              '@type': 'BarOrPub',
              name: 'Blue Bar',
              url: 'https://example.com/',
              logo: rendition,
            }) +
            '</script>',
          { headers: { 'content-type': 'text/html' } },
        );
      };
      const result = await resolveQualityLogo(
        'Blue Bar',
        'https://example.com/',
        rules,
        new Set(),
        noProvider,
      );
      assert.ok(result.candidate);
      assert.equal(result.candidate.automatic, false);
    }
    const unsafe = 'https://example.com/_next/image?url=http%3A%2F%2F127.0.0.1%2Flogo.png&w=1200';
    const html =
      '<script type="application/ld+json">' +
      JSON.stringify({
        '@type': 'BarOrPub',
        name: 'Blue Bar',
        url: 'https://example.com/',
        logo: unsafe,
      }) +
      '</script>';
    assert.equal(
      officialLogoCandidates(html, 'Blue Bar', 'https://example.com/', 'https://example.com/').some(
        (c) => c.automatic,
      ),
      false,
    );
  } finally {
    globalThis.fetch = original;
  }
});
