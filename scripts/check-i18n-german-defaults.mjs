#!/usr/bin/env node
/**
 * P0-2 follow-up — block regressions where `t(key, defaultValue)` smuggles
 * German strings as the canonical fallback default. The codebase uses
 * English as source language; German lives in src/i18n/locales/de.json.
 *
 * Run: `node scripts/check-i18n-german-defaults.mjs`
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const GERMAN_HINTS = [
  'Hilfe',
  'Notruf',
  'Krisen-Hotlines',
  'Krisenhotlines',
  'Du bist nicht allein',
  'Akute Gefahr',
  'Wähle',
  'Alle Länder',
  'Alle Themen',
  'ersetzt keine',
  'Versuche',
  'Beratungsstellen',
];

const TARGET_DIRS = ['src/pages', 'src/components'];
const ALLOWED_EXT = new Set(['.ts', '.tsx']);

/** @type {string[]} */
const files = [];
function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) {
      walk(full);
    } else if (ALLOWED_EXT.has(extname(name))) {
      files.push(full);
    }
  }
}
for (const d of TARGET_DIRS) walk(d);

/** @type {Array<{file: string, line: number, text: string}>} */
const offenders = [];

const tCallRe = /\bt\(\s*(['"`])[^'"`]+\1\s*,\s*(['"`])([^'"`]+)\2/g;

for (const file of files) {
  const src = readFileSync(file, 'utf-8');
  src.split('\n').forEach((line, i) => {
    let m;
    tCallRe.lastIndex = 0;
    while ((m = tCallRe.exec(line)) !== null) {
      const fallback = m[3];
      for (const hint of GERMAN_HINTS) {
        if (fallback.includes(hint)) {
          offenders.push({ file, line: i + 1, text: line.trim() });
          break;
        }
      }
    }
  });
}

if (offenders.length > 0) {
  console.error(
    `\n✘ Found ${offenders.length} t(key, defaultValue) calls with German fallbacks.\n` +
      `  Defaults must be in English (source language); German goes in src/i18n/locales/de.json.\n`,
  );
  for (const o of offenders) {
    console.error(`  ${o.file}:${o.line}  ${o.text}`);
  }
  process.exit(1);
}
console.log('✓ No German fallback defaults in t() calls.');
