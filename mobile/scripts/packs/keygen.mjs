#!/usr/bin/env node
// Generate an ed25519 key pair for signing offline city packs.
//
//   node scripts/packs/keygen.mjs
//
// The PRIVATE key goes into the build machine's secret store as
// PACK_SIGNING_KEY and nowhere else. The PUBLIC key is baked into app builds
// as EXPO_PUBLIC_PACK_PUBLIC_KEY. Rotating means shipping a new app build,
// because old builds only trust the key they were built with.
import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToHex } from '@noble/hashes/utils.js';

const secret = ed25519.utils.randomSecretKey();
const pub = ed25519.getPublicKey(secret);
process.stdout.write(
  `PACK_SIGNING_KEY=${bytesToHex(secret)}\nEXPO_PUBLIC_PACK_PUBLIC_KEY=${bytesToHex(pub)}\n`,
);
