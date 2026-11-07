// node --test scripts/packs — the publish verifier must reject exactly what
// the app would reject, or a green publish means nothing.
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { signIndex } from './build.mjs';
import { checkIndex, checkPack } from './verify-remote.mjs';

const secret = ed25519.utils.randomSecretKey();
const pub = bytesToHex(ed25519.getPublicKey(secret));
const pack = JSON.stringify({ format: 1, id: 'zuerich', venues: [] });
const entry = {
  id: 'zuerich',
  bytes: Buffer.byteLength(pack),
  sha256: bytesToHex(sha256(new TextEncoder().encode(pack))),
};
const signed = signIndex({ format: 1, generated_at: 'x', packs: [entry] }, bytesToHex(secret));

test('a correctly signed index and matching pack pass', () => {
  assert.equal(checkIndex(signed, pub).packs[0].id, 'zuerich');
  assert.equal(checkPack(pack, entry), null);
});

test('an index signed by another key is refused', () => {
  const other = bytesToHex(ed25519.getPublicKey(ed25519.utils.randomSecretKey()));
  assert.throws(() => checkIndex(signed, other), /does not verify/);
});

test('a tampered payload is refused even with the original signature', () => {
  const env = JSON.parse(signed);
  env.payload = env.payload.replace('zuerich', 'berlin');
  assert.throws(() => checkIndex(JSON.stringify(env), pub), /does not verify/);
});

test('a stale or truncated pack is reported, not passed', () => {
  assert.match(checkPack(pack.slice(0, -1), entry), /bytes/);
  const sameLength = pack.replace('zuerich', 'zuerick');
  assert.match(checkPack(sameLength, entry), /sha256/);
});

test('a tile archive is checked against the signed digest', async () => {
  const { checkTiles } = await import('./verify-remote.mjs');
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const tilesEntry = {
    id: 'zuerich',
    tiles: { file: 'zuerich.pmtiles', bytes: 4, sha256: bytesToHex(sha256(bytes)) },
  };
  assert.equal(checkTiles(bytes, tilesEntry), null);
  assert.match(checkTiles(new Uint8Array([1, 2, 3, 5]), tilesEntry), /sha256/);
  assert.match(checkTiles(new Uint8Array([1, 2, 3]), tilesEntry), /bytes/);
  assert.equal(checkTiles(bytes, { id: 'x' }), null);
});
