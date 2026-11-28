import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  extractOfficialMarks,
  normalizeReviewedImage,
  originalAssetUrls,
  identityMatch,
  safeReviewSvg,
  embeddedLogoRaster,
  equivalentReviewedPixels,
  recoverHtmlStyles,
  eventLogoEditionConflict,
  verifiedNativeLogoProof,
  revalidateInlineLogo,
} from './lib/official-logo-review.mjs';
import { supportedLogoReview } from '../../supabase/functions/_shared/logo-review-questions.ts';
const target = { entity_name: 'Eleventh Street Diner', entity_table: 'venues' };
const parse = (html) => extractOfficialMarks(html, target, 'https://eleventhstreetdiner.com/');
test('parent logo class and numeral alias establish a declared official masthead', () => {
  const page = parse(
    '<title>11th Street Diner</title><header><div class="logo-area"><a href="/"><img src="/logo.png" alt="logo"></a></div></header>',
  );
  assert.equal(page.candidates[0].strong, true);
  assert.equal(identityMatch(target.entity_name, '11th STREET DINER'), true);
});
test('Wix responsive commas stay inside asset URLs and the original wins', () => {
  const page = parse(
    '<title>11th Street Diner</title><header><a href="/"><img alt="11th Street Diner Logo" srcset="https://static.wixstatic.com/media/customer.png/v1/fill/w_289,h_114,al_c/mark.png 289w, https://static.wixstatic.com/media/customer.png/v1/fill/w_578,h_228,al_c/mark.png 578w"></a></header>',
  );
  assert.equal(page.candidates[0].sourceUrl, 'https://static.wixstatic.com/media/customer.png');
  assert.equal(
    page.candidates.some((c) => c.sourceUrl.includes('eleventhstreetdiner.com/mark')),
    false,
  );
});
test('a publisher does not acquire the listed target identity from a page title', () => {
  const page = parse(
    '<title>Eleventh Street Diner | Food Directory</title><script type="application/ld+json">{"@type":"Organization","name":"Food Directory","logo":"/logo.png"}</script><header><a href="/"><img alt="Food Directory" src="/directory-logo.png"></a></header>',
  );
  assert.equal(page.candidates.find((c) => c.source === 'official_jsonld').strong, false);
  assert.equal(identityMatch(target.entity_name, 'FOOD DIRECTORY'), false);
});
test('brand names containing press are retained while social logos are excluded', () => {
  const page = extractOfficialMarks(
    '<title>Express Club</title><header><a href="/"><img alt="Express Club logo" src="/express-logo.png"></a><img alt="Instagram logo" src="/instagram-logo.png"></header>',
    { entity_name: 'Express Club', entity_table: 'venues' },
    'https://expressclub.com/',
  );
  assert.equal(page.candidates.length, 1);
  assert.match(page.candidates[0].sourceUrl, /express-logo/);
});
test('verified local SVG references survive; external and executable references fail', () => {
  assert.equal(
    safeReviewSvg('<svg><defs><path id="a" d="M1 1"/></defs><use href="#a"/></svg>'),
    true,
  );
  for (const content of [
    '<svg><use href="https://evil.test/a"/></svg>',
    '<svg onload="evil()"></svg>',
    '<svg><image href="file:///etc/passwd"/></svg>',
    '<!DOCTYPE svg [<!ENTITY a SYSTEM "file:///etc/passwd">]><svg/>',
  ])
    assert.equal(safeReviewSvg(content), false);
});
test('restore native WordPress and Shopify originals without enlarging pixels', () => {
  assert.equal(
    originalAssetUrls('/wp-content/uploads/logo-120x40.png', 'https://example.com/')[0],
    'https://example.com/wp-content/uploads/logo.png',
  );
  assert.equal(
    originalAssetUrls('/cdn/shop/files/logo_350x@2x.png', 'https://example.com/')[0],
    'https://example.com/cdn/shop/files/logo.png',
  );
  assert.equal(
    originalAssetUrls('/cdn/shop/files/logo_300x300.png?width=120', 'https://example.com/')[0],
    'https://example.com/cdn/shop/files/logo.png',
  );
});
test('small raster sources fail; vectors rasterize and light marks gain readable ground', async () => {
  const tiny = await sharp({ create: { width: 128, height: 128, channels: 3, background: 'blue' } })
    .png()
    .toBuffer();
  await assert.rejects(
    () => normalizeReviewedImage({ bytes: tiny, contentType: 'image/png' }),
    /source_resolution/,
  );
  const out = await normalizeReviewedImage({
    inline:
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="40"><text x="0" y="32" fill="#ffeeaa" font-size="32">OFFICIAL WORDMARK</text></svg>',
  });
  assert.equal(out.onInk, true);
  assert.ok(out.width / out.height <= 12);
  assert.ok(out.height >= 48);
});
test('uncertain judgment, missing answer and conflicting edition cannot publish', () => {
  const good = {
    answers: {
      own_identity: { type: 'noul', noul: 0.99 },
      declared_logo: { type: 'noul', noul: 0.99 },
      conflicting_edition: { type: 'noul', noul: 0.01 },
    },
  };
  assert.equal(supportedLogoReview(good), true);
  assert.equal(
    supportedLogoReview({
      answers: { ...good.answers, declared_logo: { type: 'noul', noul: 0.8 } },
    }),
    false,
  );
  assert.equal(
    supportedLogoReview({
      answers: { ...good.answers, conflicting_edition: { type: 'noul', noul: 0.9 } },
    }),
    false,
  );
  assert.throws(() => supportedLogoReview({ answers: {} }));
});
test('native source dimensions win over CDN thumbnail transforms', async () => {
  const { officialLogoCandidates, genericLogoAsset } =
    await import('../../supabase/functions/_shared/logo-quality.ts');
  const html =
    '<title>Blue Bar</title><header><img class="logo" alt="Blue Bar" src="https://static.wixstatic.com/media/blue.png/v1/fill/w_512,h_512/blue.png"></header>';
  const candidates = officialLogoCandidates(
    html,
    'Blue Bar',
    'https://bluebar.com/',
    'https://bluebar.com/',
  );
  assert.equal(candidates[0].url, 'https://static.wixstatic.com/media/blue.png');
  assert.equal(candidates[0].automatic, true);
  assert.equal(candidates.find((c) => c.url.includes('/v1/')).automatic, false);
  assert.equal(
    genericLogoAsset(
      'https://site.com/wp-content/plugins/visual-portfolio/assets/images/logo-dark.svg',
    ),
    true,
  );
});
test('a repurposed betting domain cannot verify a former bar logo', async () => {
  const { officialLogoCandidates } =
    await import('../../supabase/functions/_shared/logo-quality.ts');
  const picks = officialLogoCandidates(
    '<title>Dillingers Best Online Casinos Ireland</title><header><img class="logo" alt="Dillingers" src="/logo.svg"></header>',
    'Dillingers',
    'https://dillingers.ie/',
    'https://dillingers.ie/',
  );
  assert.equal(
    picks.some((p) => p.automatic),
    false,
  );
});
test('a logo-named flyer in an article is a document candidate, not a masthead', () => {
  const p = parse(
    '<title>Eleventh Street Diner</title><main><article><header><img src="/logo-flyer.png" alt="Eleventh Street Diner logo"></header></article></main>',
  );
  assert.equal(p.candidates[0].source, 'official_document_logo');
  assert.equal(p.candidates[0].strong, false);
});
test('explicit namesake address conflicts are held; shared offices and city aliases work', async () => {
  const { officialLogoLocalityConflict } =
    await import('../../supabase/functions/_shared/logo-quality.ts');
  const page = (cities) =>
    '<script type="application/ld+json">' +
    JSON.stringify({
      '@type': 'Organization',
      name: 'Blue Bar',
      address: cities.map((addressLocality) => ({ '@type': 'PostalAddress', addressLocality })),
    }) +
    '</script>';
  assert.equal(officialLogoLocalityConflict(page(['Oakland']), 'Blue Bar', 'Madrid'), true);
  assert.equal(
    officialLogoLocalityConflict(page(['Oakland', 'Madrid']), 'Blue Bar', 'Madrid'),
    false,
  );
  assert.equal(officialLogoLocalityConflict(page(['Wien']), 'Blue Bar', 'Vienna'), false);
  assert.equal(officialLogoLocalityConflict(page(['Oakland']), 'Different Club', 'Madrid'), false);
});

test('a full-frame raster SVG export uses native pixels, while clipped and scaled fragments do not unwrap', async () => {
  const raster = await sharp({
    create: { width: 400, height: 200, channels: 4, background: 'transparent' },
  })
    .composite([
      {
        input: Buffer.from(
          '<svg width="400" height="200"><rect x="20" y="20" width="360" height="160" fill="red"/></svg>',
        ),
      },
    ])
    .png()
    .toBuffer();
  const wrapper = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><image width="400" height="200" transform="scale(.1)" href="data:image/png;base64,${raster.toString('base64')}"/></svg>`;
  assert.deepEqual(embeddedLogoRaster(wrapper), raster);
  const normalized = await normalizeReviewedImage({ inline: wrapper });
  assert.equal(normalized.originalWidth, 400);
  assert.equal(normalized.width, 400);
  assert.equal(embeddedLogoRaster(wrapper.replace('scale(.1)', 'scale(.2)')), null);
  assert.equal(
    embeddedLogoRaster(wrapper.replace('width="400"', 'clip-path="url(#crop)" width="400"')),
    null,
  );
});
test('mixed black and white foreground stays visible on neutral ground; pixel equivalence rejects changed artwork', async () => {
  const source = {
    inline:
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><rect x="0" width="180" height="100" fill="black"/><rect x="220" width="180" height="100" fill="white"/></svg>',
  };
  const a = await normalizeReviewedImage(source);
  assert.equal(a.background, 'neutral');
  const encoded = await sharp(a.png).png({ compressionLevel: 9 }).toBuffer();
  assert.equal(await equivalentReviewedPixels(a.png, encoded), true);
  const changed = await sharp(a.png).negate().png().toBuffer();
  assert.equal(await equivalentReviewedPixels(a.png, changed), false);
});

test('malformed unrelated inline CSS does not prevent verification of an intact masthead image', () => {
  const page = parse(
    '<title>11th Street Diner</title><button style="background: url(foo">Menu</button><header><a href="/"><img class="logo" alt="11th Street Diner" src="/logo.svg"></a></header>',
  );
  assert.equal(page.candidates[0].strong, true);
  assert.match(page.candidates[0].sourceUrl, /logo.svg$/);
});

test('CSS recovery removes parsed HTML styles while preserving SVG paint and logo attributes', () => {
  const clean = recoverHtmlStyles(
    '<style>bad{background:url(</style><header style="background:red"><img alt="Logo" src="/logo.png"><svg xmlns="http://www.w3.org/2000/svg"><style>.brand{fill:red}</style><path class="brand" style="stroke:white" d="M0 0L10 10"/></svg></header>',
  );
  const page = parse(clean);
  assert.match(clean, /<header>/);
  assert.doesNotMatch(clean, /<header style=/);
  assert.match(clean, /\.brand\{fill:red\}/);
  assert.match(clean, /stroke:white/);
  assert.match(clean, /src="\/logo.png"/);
  assert.ok(page);
});

test('edition validation uses the recorded event date when the display name omits a year', () => {
  const event = {
    entity_table: 'events',
    entity_name: 'City Pride',
    event_start_date: '2027-06-01',
  };
  assert.equal(eventLogoEditionConflict(event, 'City Pride 2026'), true);
  assert.equal(eventLogoEditionConflict(event, 'City Pride 2027'), false);
  assert.equal(eventLogoEditionConflict(event, 'City Pride'), false);
  assert.equal(
    eventLogoEditionConflict({ ...event, entity_name: 'City Pride 2026' }, 'City Pride 2026'),
    true,
  );
  assert.equal(
    eventLogoEditionConflict({ ...event, entity_table: 'organizations' }, 'Since 2020'),
    false,
  );
});

test('native dimension proof belongs to this asset and must cover this rendition', () => {
  const evidence = {
    source_url: 'https://cdn.example/logo.png?width=512',
    original_width: 512,
    original_height: 256,
  };
  const proof = {
    verified: true,
    source: evidence.source_url,
    native: { width: 1000, height: 500 },
  };
  assert.equal(verifiedNativeLogoProof(proof, evidence), true);
  assert.equal(
    verifiedNativeLogoProof({ ...proof, source: 'https://cdn.example/other.png' }, evidence),
    false,
  );
  assert.equal(
    verifiedNativeLogoProof({ ...proof, native: { width: 300, height: 200 } }, evidence),
    false,
  );
});
test('inline SVG publication rechecks the live declaration and rejects changed artwork', async () => {
  const html =
    '<title>Eleventh Street Diner</title><header><a class="logo" href="/"><svg xmlns="http://www.w3.org/2000/svg" width="300" height="100"><rect x="10" y="10" width="200" height="70" fill="red"/></svg></a></header>';
  const p = parse(html),
    c = p.candidates.find((c) => c.inline),
    n = await normalizeReviewedImage({ inline: c.inline });
  const evidence = { original_sha256: n.originalHash, background: n.background };
  const checked = await revalidateInlineLogo(
    html,
    target,
    'https://eleventhstreetdiner.com/',
    evidence,
    n.png,
  );
  assert.equal(checked.originalHash, n.originalHash);
  const pixels = await sharp(checked.png).removeAlpha().raw().toBuffer();
  assert.ok(pixels.some((red, i) => i % 3 === 0 && red > 200 && pixels[i + 1] < 50));
  const onInk = await revalidateInlineLogo(
    html,
    target,
    'https://eleventhstreetdiner.com/',
    { ...evidence, reviewed_background: 'ink' },
    n.png,
  );
  assert.equal(onInk.background, 'ink');
  await assert.rejects(
    () =>
      revalidateInlineLogo(
        html.replace('fill="red"', 'fill="blue"'),
        target,
        'https://eleventhstreetdiner.com/',
        evidence,
        n.png,
      ),
    /inline_source_changed/,
  );
});

test('currentColor uses declared brand color without inheriting browser link blue', () => {
  const html = (color) =>
    `<title>Eleventh Street Diner</title><header><a class="logo" href="/" ${color ? 'style="color:' + color + '"' : ''}><svg width="300" height="100"><path fill="currentColor" d="M0 0H300V100H0Z"/></svg></a></header>`;
  assert.match(parse(html()).candidates.find((c) => c.inline).inline, /fill: black/);
  assert.match(
    parse(html('red')).candidates.find((c) => c.inline).inline,
    /fill: rgb\(255, 0, 0\)/,
  );
});

test('inherited author color on a logo link resolves past the browser link default', () => {
  const html = (color) =>
    `<title>Eleventh Street Diner</title><style>a { color: inherit }</style><header ${color ? 'style="color:' + color + '"' : ''}><a class="logo" href="/"><svg width="300" height="100" fill="currentColor"><path d="M0 0H300V100H0Z"/></svg></a></header>`;
  assert.match(parse(html()).candidates.find((c) => c.inline).inline, /fill: black/);
  assert.match(
    parse(html('red')).candidates.find((c) => c.inline).inline,
    /fill: rgb\(255, 0, 0\)/,
  );
});

test('manual identity evidence is bound to the exact entity, page and declared inline source', async () => {
  const html =
      '<title>LUSH Minneapolis</title><header><a class="logo" href="/"><svg width="300" height="100"><rect width="290" height="90" fill="red"/></svg></a></header>',
    job = { entity_table: 'venues', entity_id: 'fixture', entity_name: 'LUSH Lounge and Theater' };
  const page = extractOfficialMarks(html, job, 'https://example.com/'),
    c = page.candidates.find((x) => x.inline),
    n = await normalizeReviewedImage({ inline: c.inline });
  const proof = {
    method: 'manual_official_source_verification',
    ...job,
    official_page: 'https://example.com/',
    source_url: c.sourceUrl,
    evidence:
      'Official business page names LUSH in Minneapolis and identifies its lounge and theater.',
  };
  const evidence = {
    original_sha256: n.originalHash,
    source_url: c.sourceUrl,
    official_identity_review: proof,
  };
  assert.equal(
    (await revalidateInlineLogo(html, job, 'https://example.com/', evidence, n.png)).originalHash,
    n.originalHash,
  );
  await assert.rejects(
    () =>
      revalidateInlineLogo(
        html,
        { ...job, entity_id: 'other' },
        'https://example.com/',
        evidence,
        n.png,
      ),
    /identity_changed/,
  );
  await assert.rejects(
    () => revalidateInlineLogo(html, job, 'https://other.example/', evidence, n.png),
    /identity_changed/,
  );
  await assert.rejects(
    () =>
      revalidateInlineLogo(
        html.replace('fill="red"', 'fill="blue"'),
        job,
        'https://example.com/',
        evidence,
        n.png,
      ),
    /source_changed/,
  );
});
