#!/usr/bin/env node
/**
 * Block duplicate keys inside a single locale JSON object.
 *
 * Why this exists: `JSON.parse` silently keeps the LAST occurrence of a
 * duplicate key and reports no error, so `scripts/sync-translations.ts` — which
 * flattens via `JSON.parse` — cannot see one. A duplicate key has previously
 * caused the Cloudflare Pages build to fail silently and never deploy, with no
 * error surfaced anywhere in CI.
 *
 * This scanner therefore tokenizes the raw text instead of parsing it, tracking
 * the set of key names seen per object scope.
 *
 * Run: `node scripts/check-i18n-duplicate-keys.mjs`
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIRS = ['src/i18n/locales', 'public/locales'];

/**
 * Tokenize JSON text and report every key that appears twice in the same object.
 * @param {string} text
 * @returns {{ key: string, path: string, line: number }[]}
 */
function findDuplicateKeys(text) {
  /** @type {{ key: string, path: string, line: number }[]} */
  const dups = [];
  /** @type {{ type: 'object' | 'array', keys: Set<string>, label: string, lastKey: string | null }[]} */
  const stack = [];
  // Only a string appearing where a key is expected (right after `{` or a `,`
  // inside an object) is a key. A string in value position never is.
  let expectKey = false;
  let i = 0;

  const lineAt = (index) => {
    let line = 1;
    for (let n = 0; n < index; n++) if (text[n] === '\n') line++;
    return line;
  };
  const currentPath = () =>
    stack
      .map((f) => f.label)
      .filter(Boolean)
      .join('.');

  while (i < text.length) {
    const ch = text[i];

    if (ch === '"') {
      const start = i;
      i++;
      let value = '';
      while (i < text.length) {
        const c = text[i];
        if (c === '\\') {
          value += text[i] + (text[i + 1] ?? '');
          i += 2;
          continue;
        }
        if (c === '"') {
          i++;
          break;
        }
        value += c;
        i++;
      }
      const frame = stack[stack.length - 1];
      if (expectKey && frame && frame.type === 'object') {
        if (frame.keys.has(value)) {
          const path = currentPath();
          dups.push({
            key: value,
            path: path ? `${path}.${value}` : value,
            line: lineAt(start),
          });
        } else {
          frame.keys.add(value);
        }
        frame.lastKey = value;
        expectKey = false;
      }
      continue;
    }

    if (ch === '{') {
      const parent = stack[stack.length - 1];
      stack.push({
        type: 'object',
        keys: new Set(),
        label: parent?.type === 'object' ? (parent.lastKey ?? '') : '',
        lastKey: null,
      });
      expectKey = true;
      i++;
      continue;
    }

    if (ch === '[') {
      const parent = stack[stack.length - 1];
      stack.push({
        type: 'array',
        keys: new Set(),
        label: parent?.type === 'object' ? (parent.lastKey ?? '') : '',
        lastKey: null,
      });
      expectKey = false;
      i++;
      continue;
    }

    if (ch === '}' || ch === ']') {
      stack.pop();
      expectKey = false;
      i++;
      continue;
    }

    if (ch === ',') {
      expectKey = stack[stack.length - 1]?.type === 'object';
      i++;
      continue;
    }

    i++;
  }

  return dups;
}

let failed = 0;
let scanned = 0;

for (const dir of DIRS) {
  if (!existsSync(dir)) continue;
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  for (const file of files) {
    const full = join(dir, file);
    const text = readFileSync(full, 'utf8');
    scanned++;
    const dups = findDuplicateKeys(text);
    for (const d of dups) {
      failed++;
      console.error(`✗ ${full}:${d.line} duplicate key "${d.path}"`);
    }
  }
}

if (failed > 0) {
  console.error(
    `\n${failed} duplicate i18n key(s) found across ${scanned} file(s).\n` +
      'JSON.parse keeps only the last occurrence, so this would ship silently ' +
      'and can break the Cloudflare Pages build with no error.',
  );
  process.exit(1);
}

console.log(`✓ No duplicate i18n keys (${scanned} file(s) scanned).`);
