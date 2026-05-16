/**
 * AES-256-GCM encryption for raw email bodies.
 *
 * Output layout: [12-byte IV][ciphertext+tag] — single bytea blob stored
 * in `trip_inbox_items.raw_body_encrypted`. The 32-byte key is held in the
 * INBOX_ENCRYPTION_KEY secret (base64).
 */

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importKey(b64Key: string): Promise<CryptoKey> {
  const raw = b64ToBytes(b64Key);
  if (raw.length !== 32) {
    throw new Error(`INBOX_ENCRYPTION_KEY must decode to 32 bytes, got ${raw.length}`);
  }
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt']);
}

export async function encryptBody(b64Key: string, plaintext: string): Promise<Uint8Array> {
  const key = await importKey(b64Key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(plaintext);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return out;
}

/** Encode bytes as PostgREST-friendly `\x...` hex bytea literal. */
export function bytesToPgHex(bytes: Uint8Array): string {
  let hex = '\\x';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}
