#!/usr/bin/env node
// Validate that required env vars are present before `npm run dev` boots.
// Without this, vite happily starts and the app 500s on first Supabase call.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const envPath = join(root, '.env');

const REQUIRED = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
];

const OPTIONAL_WITH_WARNING = [
  'VITE_SEARCH_PROXY_URL',
  'VITE_API_URL',
];

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const fileEnv = parseEnvFile(envPath);
const combined = { ...fileEnv, ...process.env };

const missing = REQUIRED.filter((k) => !combined[k] || combined[k].includes('your-'));
const placeholders = OPTIONAL_WITH_WARNING.filter((k) => !combined[k] || combined[k].includes('your-'));

if (missing.length > 0) {
  console.error('\n❌ Missing required env vars:');
  for (const k of missing) console.error(`   ${k}`);
  console.error('\nCopy .env.example to .env and fill in the values, or export them in your shell.\n');
  process.exit(1);
}

if (placeholders.length > 0) {
  console.warn('\n⚠️  Optional env vars are unset or placeholder (some features may not work):');
  for (const k of placeholders) console.warn(`   ${k}`);
  console.warn('');
}

console.log('✓ Env check passed');
