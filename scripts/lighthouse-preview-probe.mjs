import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export function previewOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Valid immutable project preview origin required'); }
  assert.ok(url.protocol === 'https:', 'HTTPS preview required');
  assert.ok(/^[a-f0-9]{8}[.]queer-guide[.]pages[.]dev$/.test(url.hostname), 'Immutable project preview required');
  assert.ok(!url.username && !url.password && !url.port && !url.search && !url.hash, 'Bare preview origin required');
  assert.ok(url.pathname === '/', 'Preview root required');
  return url.origin;
}

export function previewConfig(original, origin) {
  const config = structuredClone(original);
  assert.equal(original.ci.collect.numberOfRuns, 3);
  assert.equal(original.ci.collect.url.length, 7);
  assert.equal(original.ci.assert.assertMatrix.length, 7);
  config.ci.collect.url = original.ci.collect.url.map((value) => {
    const url = new URL(value);
    assert.equal(url.origin, 'https://queer.guide');
    return new URL(url.pathname + url.search, origin).href;
  });
  const prefix = '^https://queer' + String.fromCharCode(92) + '.guide';
  const replacement = '^' + origin.replaceAll('.', String.fromCharCode(92) + '.');
  config.ci.assert.assertMatrix = original.ci.assert.assertMatrix.map((row) => {
    assert.ok(row.matchingUrlPattern.startsWith(prefix), 'Unknown matrix origin');
    return { ...structuredClone(row), matchingUrlPattern: replacement + row.matchingUrlPattern.slice(prefix.length) };
  });
  const normalize = (value) => ({
    ...value,
    ci: {
      ...value.ci,
      collect: { ...value.ci.collect, url: [] },
      assert: { ...value.ci.assert, assertMatrix: value.ci.assert.assertMatrix.map((row) => ({ ...row, matchingUrlPattern: '' })) },
    },
  });
  assert.deepEqual(normalize(config), normalize(original), 'Only target origins may change');
  for (const url of config.ci.collect.url) {
    assert.equal(config.ci.assert.assertMatrix.filter((row) => new RegExp(row.matchingUrlPattern).test(url)).length, 1);
  }
  return config;
}

async function main() {
  const origin = previewOrigin(process.env.QG_PREVIEW_URL);
  const expected = process.env.QG_PREVIEW_EXPECTED_SHA;
  assert.ok(/^[a-f0-9]{40}$/.test(expected ?? ''), 'Expected source SHA required');
  const profile = process.env.QG_PREVIEW_PROFILE;
  assert.ok(['mobile', 'desktop'].includes(profile), 'Unknown profile');
  const command = process.argv[2];
  if (command === 'prepare') {
    const source = profile === 'desktop' ? 'lighthouserc.desktop.json' : 'lighthouserc.json';
    const raw = await readFile(new URL('../' + source, import.meta.url), 'utf8');
    const original = JSON.parse(raw);
    const config = previewConfig(original, origin);
    await writeFile('.preview-lhci-' + profile + '.json', JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
    await writeFile('lhci-preview-configuration-' + profile + '.json', JSON.stringify({
      checkedAt: new Date().toISOString(), profile, expected, origin,
      harnessCommit: process.env.GITHUB_SHA ?? null,
      originalConfigSha256: createHash('sha256').update(raw).digest('hex'),
      sevenRoutes: config.ci.collect.url,
      numberOfRuns: config.ci.collect.numberOfRuns,
      settings: config.ci.collect.settings,
      assertionsUnchanged: true,
      note: 'Preview no-index SEO failures remain errors. No audit or budget is disabled.',
    }, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ profile, origin, runs: 3, routes: 7, assertionsUnchanged: true }));
    return;
  }
  assert.equal(command, 'verify');
  const phase = process.argv[3];
  assert.ok(['before', 'after'].includes(phase));
  const options = { signal: AbortSignal.timeout(30_000) };
  const build = await fetch(origin + '/build-id.txt', options);
  const buildId = (await build.text()).trim();
  const home = await fetch(origin, options);
  const html = await home.text();
  const module = [...html.matchAll(/<script\b([^>]*)>/g)].map((match) => match[1])
    .find((attributes) => /type=["']module["']/.test(attributes) && /src=/.test(attributes));
  const src = module?.match(/src=["']([^"']+)["']/)?.[1];
  assert.ok(src, 'Missing module entry');
  const entryUrl = new URL(src, origin);
  assert.equal(entryUrl.origin, origin);
  assert.ok(entryUrl.pathname.startsWith('/assets/js/'));
  const entry = await fetch(entryUrl, options);
  const js = await entry.text();
  const proof = {
    checkedAt: new Date().toISOString(), expected, origin, phase, profile,
    build: { status: build.status, value: buildId, matches: buildId === expected },
    homepage: { status: home.status, cspPresent: !!home.headers.get('content-security-policy') },
    entry: { url: entryUrl.href, status: entry.status, releaseMatches: js.includes(expected) },
  };
  proof.passed = build.ok && buildId === expected && home.ok && proof.homepage.cspPresent && entry.ok && proof.entry.releaseMatches;
  await writeFile('lhci-preview-source-' + phase + '-' + profile + '.json', JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(proof));
  assert.ok(proof.passed, 'Preview source/security proof failed');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
