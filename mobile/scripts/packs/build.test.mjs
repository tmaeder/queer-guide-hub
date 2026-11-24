// node --test scripts/packs — the bbox decides how big every tile extract is.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import { extractTiles, packBbox } from './build.mjs';

const zh = [
  { longitude: 8.5417, latitude: 47.3769 },
  { longitude: 8.53, latitude: 47.37 },
  { longitude: 8.55, latitude: 47.39 },
];

test('covers the places plus padding', () => {
  const [w, s, e, n] = packBbox(zh);
  for (const p of zh) {
    assert.ok(p.longitude > w && p.longitude < e && p.latitude > s && p.latitude < n);
  }
});

test('a single misgeocoded venue on another continent does not widen the box', () => {
  const withStray = [...zh, { longitude: -74.0, latitude: 40.7 }];
  assert.deepEqual(packBbox(withStray), packBbox(zh));
});

test('null-island and missing coordinates are ignored', () => {
  assert.equal(packBbox([{ longitude: 0, latitude: 0 }, { longitude: null, latitude: null }]), null);
  assert.deepEqual(packBbox([...zh, { longitude: 0, latitude: 0 }]), packBbox(zh));
});

test('one venue still yields a usable box (minimum span)', () => {
  const [w, s, e, n] = packBbox([zh[0]]);
  assert.ok(e - w > 0.08 && n - s > 0.05);
});

test('extractTiles retries a failed extract, then gives up after three', async () => {
  const { mkdtempSync, writeFileSync, chmodSync, readFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'pmt-'));
  // Fake pmtiles: fails until the counter file reaches FAILS, then writes the output.
  const bin = join(dir, 'pmtiles');
  writeFileSync(
    bin,
    `#!/bin/sh\nn=$(cat "${dir}/n" 2>/dev/null || echo 0); n=$((n+1)); echo $n > "${dir}/n"\n[ $n -gt "$FAILS" ] || exit 1\necho tiles > "$3"\n`,
  );
  chmodSync(bin, 0o755);
  process.env.PMTILES_BIN = bin;
  const bbox = [8.4, 47.3, 8.6, 47.4];
  try {
    process.env.FAILS = '2';
    const out = await extractTiles('src.pmtiles', bbox, dir, 'zuerich', 0);
    assert.equal(out.file, 'zuerich.pmtiles');
    assert.equal(readFileSync(join(dir, 'n'), 'utf8').trim(), '3');
    writeFileSync(join(dir, 'n'), '0');
    process.env.FAILS = '3';
    await assert.rejects(extractTiles('src.pmtiles', bbox, dir, 'zuerich', 0), /extract failed/);
  } finally {
    delete process.env.PMTILES_BIN;
    delete process.env.FAILS;
  }
});
