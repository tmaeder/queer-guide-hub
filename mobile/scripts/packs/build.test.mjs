// node --test scripts/packs — the bbox decides how big every tile extract is.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { packBbox } from './build.mjs';

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
