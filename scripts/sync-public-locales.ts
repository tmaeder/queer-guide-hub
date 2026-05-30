#!/usr/bin/env npx tsx
/**
 * Public locales sync / guard.
 *
 * `src/i18n/locales/` is the single source of truth for translations.
 * Only `en.json` is bundled inline (src/i18n/index.ts); every other locale is
 * fetched at runtime from `public/locales/{{lng}}.json` via i18next-http-backend.
 * Those two dirs silently drifted in the past — non-English edits made in
 * src/i18n/locales/ never reached users because public/ was never regenerated.
 *
 * This script makes public/locales/ a build artifact of src/i18n/locales/:
 *   --write   copy every src/i18n/locales/*.json → public/locales/*.json
 *             (normalized: 2-space indent + trailing newline). Wired into
 *             "prebuild" so production always ships what src/ contains.
 *   --check   (default) fail if any public file is missing, extra, or differs
 *             from its normalized src counterpart. Wired into "i18n:check" so
 *             the two dirs can't silently diverge again.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC_DIR = path.join(__dirname, '../src/i18n/locales');
const PUB_DIR = path.join(__dirname, '../public/locales');

const normalize = (raw: string): string => JSON.stringify(JSON.parse(raw), null, 2) + '\n';

const jsonFiles = (dir: string): string[] =>
  fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();

const mode = process.argv.includes('--write') ? 'write' : 'check';

const srcFiles = jsonFiles(SRC_DIR);

if (mode === 'write') {
  fs.mkdirSync(PUB_DIR, { recursive: true });
  for (const file of srcFiles) {
    const content = normalize(fs.readFileSync(path.join(SRC_DIR, file), 'utf-8'));
    fs.writeFileSync(path.join(PUB_DIR, file), content, 'utf-8');
  }
  // Remove any stale public locale files that no longer exist in src.
  const srcSet = new Set(srcFiles);
  for (const file of jsonFiles(PUB_DIR)) {
    if (!srcSet.has(file)) fs.rmSync(path.join(PUB_DIR, file));
  }
  console.log(`✓ Synced ${srcFiles.length} locale files → public/locales/`);
  process.exit(0);
}

// check mode
const problems: string[] = [];
const pubSet = new Set(jsonFiles(PUB_DIR));

for (const file of srcFiles) {
  const expected = normalize(fs.readFileSync(path.join(SRC_DIR, file), 'utf-8'));
  const pubPath = path.join(PUB_DIR, file);
  if (!pubSet.has(file)) {
    problems.push(`  missing in public/locales: ${file}`);
    continue;
  }
  pubSet.delete(file);
  const actual = fs.readFileSync(pubPath, 'utf-8');
  if (actual !== expected) {
    problems.push(`  out of sync: public/locales/${file} differs from src/i18n/locales/${file}`);
  }
}
for (const extra of pubSet) {
  problems.push(`  stale in public/locales (no src counterpart): ${extra}`);
}

if (problems.length > 0) {
  console.error(
    `\n✘ public/locales/ is out of sync with src/i18n/locales/ (${problems.length} issue(s)):\n` +
      problems.join('\n') +
      `\n\n  src/i18n/locales/ is canonical. Run \`npm run i18n:sync\` to regenerate public/locales/.\n`,
  );
  process.exit(1);
}
console.log(`✓ public/locales/ matches src/i18n/locales/ (${srcFiles.length} files)`);
