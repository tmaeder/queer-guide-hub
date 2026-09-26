#!/usr/bin/env node
/**
 * Ratchet gate for untranslated UI strings.
 *
 * WHY THIS EXISTS. `npm run i18n:check` reported every locale "✓ complete"
 * while 985 of 3,739 keys per locale shipped to users as the literal string
 * `"[ES] Retry"`. The check it runs, `sync-translations.ts`, compares KEY SETS
 * only — and `--fill` writes a placeholder for every missing key, so running
 * the documented fix is what makes the gate pass. A locale could be 100 %
 * placeholder and still be reported complete.
 *
 * Measured 2026-09-19: 9,699 placeholders and 370 dead keys across ten
 * locales, none of it reported by anything.
 *
 * ## Why a ratchet and not zero
 *
 * 9,699 placeholders cannot be fixed in the change that adds the gate. A
 * check that ships red is a check people learn to scroll past — this repo has
 * removed that shape twice already (the dedup backlog rule, the
 * `never_succeeded` sentinel). So the baseline records today's count and the
 * gate fails only on GROWTH. Lower a number, run `npm run i18n:baseline`, and
 * it can never come back.
 *
 * ## Two counters, deliberately separate
 *
 * - `placeholders`: `"[XX] english text"` — a key that is present, passes
 *   every key-set check, and renders the language tag to a human.
 * - `extra`: a key the locale carries that `en.json` no longer has. Dead
 *   weight, never reported before, and the reason a locale can have MORE keys
 *   than English while being less translated.
 *
 * They are separate because they are fixed by different work — one needs a
 * translator, the other needs a delete — and folding them into one number
 * would let a deletion spree mask a translation regression.
 *
 * Usage:
 *   node scripts/check-i18n-placeholders.mjs            # gate (exit 1 on growth)
 *   node scripts/check-i18n-placeholders.mjs --write     # re-baseline
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES_DIR = resolve(ROOT, 'src/i18n/locales');
const BASELINE = resolve(ROOT, 'scripts/i18n-placeholder-baseline.json');

/** Written by `sync-translations.ts --fill`: "[ES] <english text>". */
const PLACEHOLDER_RE = /^\[[A-Z]{2}\]\s/;

const write = process.argv.includes('--write');

function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, key));
    else out[key] = v;
  }
  return out;
}

const en = flatten(JSON.parse(readFileSync(resolve(LOCALES_DIR, 'en.json'), 'utf8')));
const enKeys = new Set(Object.keys(en));

// Positive control. An empty parse also satisfies "nothing grew", which would
// turn this file green while measuring nothing — the vacuous-assertion class.
if (enKeys.size < 100) {
  console.error(`✗ parsed only ${enKeys.size} keys from en.json — the flattener is broken, not the locales`);
  process.exit(1);
}

const localeFiles = readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json') && f !== 'en.json');
if (localeFiles.length === 0) {
  console.error('✗ no locale files found — this gate would pass having checked nothing');
  process.exit(1);
}

const current = {};
const samples = {};
for (const file of localeFiles) {
  const lang = file.replace('.json', '');
  const data = flatten(JSON.parse(readFileSync(resolve(LOCALES_DIR, file), 'utf8')));
  const keys = Object.keys(data);

  const placeholderKeys = keys.filter(
    (k) => typeof data[k] === 'string' && PLACEHOLDER_RE.test(data[k]),
  );
  const extraKeys = keys.filter((k) => !enKeys.has(k));

  current[lang] = { placeholders: placeholderKeys.length, extra: extraKeys.length };
  samples[lang] = { placeholders: placeholderKeys.slice(0, 3), extra: extraKeys.slice(0, 3) };
}

if (write) {
  writeFileSync(BASELINE, JSON.stringify({ locales: current }, null, 2) + '\n');
  console.log(`Wrote baseline for ${Object.keys(current).length} locales → ${BASELINE}`);
  const tot = Object.values(current).reduce(
    (a, c) => ({ placeholders: a.placeholders + c.placeholders, extra: a.extra + c.extra }),
    { placeholders: 0, extra: 0 },
  );
  console.log(`  ${tot.placeholders} placeholders, ${tot.extra} dead keys`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error(`✗ ${BASELINE} is missing — run: npm run i18n:baseline`);
  process.exit(1);
}
const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')).locales ?? {};

let failed = false;
let improved = false;
console.log('Untranslated UI strings (placeholders) and dead keys');
console.log('====================================================');

for (const lang of Object.keys(current).sort()) {
  const cur = current[lang];
  // A locale absent from the baseline is NEW. Hold it to zero rather than to
  // an implicit allowance — a new language should not arrive pre-broken.
  const base = baseline[lang] ?? { placeholders: 0, extra: 0 };

  for (const metric of ['placeholders', 'extra']) {
    const delta = cur[metric] - base[metric];
    if (delta > 0) {
      const eg = samples[lang][metric].join(', ');
      console.error(
        `✗ ${lang}: ${metric} ${base[metric]} → ${cur[metric]} (+${delta})` +
          (eg ? `  e.g. ${eg}` : ''),
      );
      failed = true;
    } else if (delta < 0) {
      improved = true;
      console.log(`✓ ${lang}: ${metric} ${base[metric]} → ${cur[metric]} (${delta})`);
    }
  }
}

const tot = Object.values(current).reduce(
  (a, c) => ({ placeholders: a.placeholders + c.placeholders, extra: a.extra + c.extra }),
  { placeholders: 0, extra: 0 },
);

if (failed) {
  console.error('');
  console.error('✗ Untranslated UI strings grew.');
  console.error('  A "[XX] English text" value is NOT a translation — it renders the language');
  console.error('  tag to a human. `sync-translations.ts --fill` writes these, so filling a');
  console.error('  missing key satisfies every key-set check while making the page worse.');
  console.error('  Translate the new keys, or re-baseline deliberately: npm run i18n:baseline');
  process.exit(1);
}

console.log('');
console.log(
  `✓ no growth — ${tot.placeholders} placeholders, ${tot.extra} dead keys across ${localeFiles.length} locales`,
);
if (improved) {
  console.log('  Some counts fell. Lock it in: npm run i18n:baseline');
}
