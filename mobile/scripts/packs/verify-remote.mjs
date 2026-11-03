#!/usr/bin/env node
// Verify a published pack host exactly as the app will:
//
//   PACK_BASE_URL=https://… PACK_PUBLIC_KEY=<hex> node scripts/packs/verify-remote.mjs [--expect N]
//
// Fetches index.json, checks its ed25519 signature, then fetches every pack
// it lists and checks byte length and sha256. A publish is not done until
// this passes against the PUBLIC url: an upload that succeeded but serves a
// stale or truncated file through a cache is exactly what it catches.
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { parseArgs } from 'node:util';

export function checkIndex(text, publicKeyHex) {
  const { payload, sig } = JSON.parse(text);
  if (typeof payload !== 'string' || typeof sig !== 'string') throw new Error('index envelope is malformed');
  if (!ed25519.verify(hexToBytes(sig), utf8ToBytes(payload), hexToBytes(publicKeyHex))) {
    throw new Error('index signature does not verify with PACK_PUBLIC_KEY');
  }
  return JSON.parse(payload);
}

export function checkPack(text, entry) {
  const bytes = utf8ToBytes(text);
  if (bytes.length !== entry.bytes) return `${entry.id}: ${bytes.length} bytes, index says ${entry.bytes}`;
  const digest = bytesToHex(sha256(bytes));
  if (digest !== entry.sha256) return `${entry.id}: sha256 ${digest.slice(0, 12)}… ≠ index ${entry.sha256.slice(0, 12)}…`;
  return null;
}

async function get(url) {
  // no-store: verify what the CDN serves now, not what this runner cached.
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

async function main() {
  const { values } = parseArgs({ options: { expect: { type: 'string' } } });
  const base = (process.env.PACK_BASE_URL ?? '').replace(/\/+$/, '');
  const key = process.env.PACK_PUBLIC_KEY ?? '';
  if (!/^https:\/\//.test(base)) throw new Error('PACK_BASE_URL must be an https URL');
  if (!/^[0-9a-f]{64}$/i.test(key)) throw new Error('PACK_PUBLIC_KEY (64 hex chars) is required');

  const index = checkIndex(await get(`${base}/index.json`), key);
  const expect = values.expect ? Number(values.expect) : null;
  // Zero packs verifies trivially; refuse it rather than report success.
  if (!index.packs?.length) throw new Error('index lists no packs');
  if (expect != null && index.packs.length !== expect) {
    throw new Error(`index lists ${index.packs.length} packs, expected ${expect}`);
  }
  const problems = [];
  for (const entry of index.packs) {
    const err = checkPack(await get(`${base}/${encodeURIComponent(entry.id)}.json`), entry);
    if (err) problems.push(err);
  }
  if (problems.length) throw new Error(`${problems.length} pack(s) do not match the index:\n  ${problems.join('\n  ')}`);
  console.log(`OK: ${index.packs.length} packs verified at ${base} (index ${index.generated_at})`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
