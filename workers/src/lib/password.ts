/**
 * Password hashing using Web Crypto API (PBKDF2).
 * Replaces Supabase Auth's bcrypt-based password handling.
 */

const encoder = new TextEncoder();
const ITERATIONS = 100_000;
const KEY_LENGTH = 32; // 256 bits

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt);
  const hash = await crypto.subtle.exportKey('raw', key) as ArrayBuffer;

  // Store as salt:hash (both base64)
  return `${arrayToBase64(salt)}:${arrayToBase64(new Uint8Array(hash))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltB64, hashB64] = stored.split(':');
  if (!saltB64 || !hashB64) return false;

  const salt = base64ToArray(saltB64);
  const key = await deriveKey(password, salt);
  const hash = new Uint8Array(await crypto.subtle.exportKey('raw', key) as ArrayBuffer);
  const expected = base64ToArray(hashB64);

  if (hash.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash[i] ^ expected[i];
  return diff === 0;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'HMAC', hash: 'SHA-256', length: KEY_LENGTH * 8 },
    true,
    ['sign'],
  );
}

function arrayToBase64(arr: Uint8Array): string {
  let binary = '';
  for (const b of arr) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToArray(b64: string): Uint8Array {
  const binary = atob(b64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return arr;
}
