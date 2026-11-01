import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  PACK_FORMAT,
  PackError,
  type PackIndex,
  type PackIndexEntry,
  type PackPayload,
  type SignedIndex,
} from './format';

const HEX = /^[0-9a-f]+$/i;

function isEntry(e: unknown): e is PackIndexEntry {
  const v = e as Record<string, unknown>;
  return (
    !!v &&
    typeof v.id === 'string' &&
    /^[a-z0-9-]+$/.test(v.id) &&
    typeof v.name === 'string' &&
    typeof v.country === 'string' &&
    typeof v.generated_at === 'string' &&
    typeof v.bytes === 'number' &&
    typeof v.sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(v.sha256) &&
    typeof v.venues === 'number'
  );
}

/**
 * Verify and parse the signed index.
 *
 * `lastSeen` is the generated_at of the newest index this device has
 * accepted; an older one is refused, so a host that is compromised or
 * replaying a cached file cannot roll packs back to stale safety data.
 */
export function verifyIndex(
  text: string,
  publicKeyHex: string | undefined,
  lastSeen?: string | null,
): PackIndex {
  if (!publicKeyHex || publicKeyHex.length !== 64 || !HEX.test(publicKeyHex)) {
    throw new PackError('not_configured', 'No pack verification key in this build');
  }
  let signed: SignedIndex;
  try {
    signed = JSON.parse(text) as SignedIndex;
  } catch {
    throw new PackError('bad_format', 'Index is not JSON');
  }
  if (typeof signed?.payload !== 'string' || typeof signed?.sig !== 'string' || !HEX.test(signed.sig)) {
    throw new PackError('bad_format', 'Index envelope is malformed');
  }
  let ok = false;
  try {
    ok = ed25519.verify(hexToBytes(signed.sig), utf8ToBytes(signed.payload), hexToBytes(publicKeyHex));
  } catch {
    ok = false;
  }
  if (!ok) throw new PackError('bad_signature', 'Index signature does not verify');

  const index = JSON.parse(signed.payload) as PackIndex;
  if (index.format !== PACK_FORMAT || !Array.isArray(index.packs) || !index.packs.every(isEntry)) {
    throw new PackError('bad_format', `Unsupported index format ${String(index.format)}`);
  }
  if (lastSeen && index.generated_at < lastSeen) {
    throw new PackError('rollback', 'Index is older than one this device already accepted');
  }
  return index;
}

export function sha256Hex(text: string): string {
  return bytesToHex(sha256(utf8ToBytes(text)));
}

/** Verify a pack file against the digest its (already verified) index entry pins. */
export function verifyPack(text: string, entry: PackIndexEntry): PackPayload {
  if (sha256Hex(text) !== entry.sha256) {
    throw new PackError('digest_mismatch', `Pack ${entry.id} does not match its signed digest`);
  }
  const pack = JSON.parse(text) as PackPayload;
  if (pack.format !== PACK_FORMAT) throw new PackError('bad_format', `Pack format ${pack.format}`);
  if (pack.id !== entry.id) throw new PackError('id_mismatch', `Pack ${pack.id} is not ${entry.id}`);
  if (!Array.isArray(pack.venues) || !Array.isArray(pack.hotlines)) {
    throw new PackError('bad_format', 'Pack body is malformed');
  }
  return pack;
}
