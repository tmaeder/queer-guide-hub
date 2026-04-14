#!/usr/bin/env npx tsx
/**
 * Translation sync script
 * Compares each locale file against en.json and reports missing keys.
 * Usage: npx tsx scripts/sync-translations.ts
 * With --fill flag: fills missing keys with English values prefixed with [LANG]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCALES_DIR = path.join(__dirname, '../src/i18n/locales');
const EN_FILE = path.join(LOCALES_DIR, 'en.json');

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...flattenKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((curr, key) => {
    if (curr && typeof curr === 'object') return (curr as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let curr = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!curr[parts[i]] || typeof curr[parts[i]] !== 'object') {
      curr[parts[i]] = {};
    }
    curr = curr[parts[i]] as Record<string, unknown>;
  }
  curr[parts[parts.length - 1]] = value;
}

const fillMode = process.argv.includes('--fill');

const enData = JSON.parse(fs.readFileSync(EN_FILE, 'utf-8'));
const enKeys = flattenKeys(enData);

const localeFiles = fs.readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json') && f !== 'en.json');

let totalMissing = 0;

for (const file of localeFiles) {
  const lang = file.replace('.json', '');
  const filePath = path.join(LOCALES_DIR, file);
  const localeData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const localeKeys = new Set(flattenKeys(localeData));

  const missing = enKeys.filter((key) => !localeKeys.has(key));

  if (missing.length > 0) {
    console.log(`\n${lang}: ${missing.length} missing keys`);
    missing.forEach((key) => console.log(`  - ${key}`));
    totalMissing += missing.length;

    if (fillMode) {
      for (const key of missing) {
        const enValue = getNestedValue(enData, key);
        setNestedValue(localeData, key, `[${lang.toUpperCase()}] ${enValue}`);
      }
      fs.writeFileSync(filePath, JSON.stringify(localeData, null, 2) + '\n', 'utf-8');
      console.log(`  → Filled ${missing.length} keys with placeholders`);
    }
  } else {
    console.log(`${lang}: ✓ complete`);
  }
}

console.log(`\nTotal missing: ${totalMissing} keys across ${localeFiles.length} locales`);
if (totalMissing > 0 && !fillMode) {
  console.log('Run with --fill to add placeholder values for missing keys');
  process.exit(1);
}
