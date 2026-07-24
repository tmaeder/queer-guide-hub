#!/usr/bin/env node
/**
 * Design-system audit artifact generator.
 *
 * Scans src/ for token usage (var(--token) + semantic utility classes),
 * counts design-rule lint suppressions, and diffs the token set against
 * docs/design-system/README.md. Writes public/design-audit.json, which the
 * /admin/design Audit tab renders.
 *
 * Run manually (or from CI): node scripts/design-audit.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src/index.css'), 'utf8');

// ---------------------------------------------------------------------------
// 1. Token inventory from src/index.css (:root, .dark, @theme definitions)
// ---------------------------------------------------------------------------
const DEFINED = [...css.matchAll(/(?<![\w-])--([a-z][\w-]*):/g)].map((m) => m[1]);
const tokens = [...new Set(DEFINED)].filter(
  // Layout plumbing + Tailwind-emitted color indirections aren't design levers.
  (t) => !t.startsWith('color-') && !t.startsWith('z-') && !['sidebar-width', 'admin-content-min-h', 'hover-angle'].includes(t),
);

// ---------------------------------------------------------------------------
// 2. Usage counts across src/
// ---------------------------------------------------------------------------
const SCAN_EXT = new Set(['.ts', '.tsx', '.css']);
const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') continue;
      walk(full);
    } else if (SCAN_EXT.has(entry.slice(entry.lastIndexOf('.')))) {
      files.push(full);
    }
  }
})(join(root, 'src'));

const contents = files.map((f) => readFileSync(f, 'utf8'));
const corpus = contents.join('\n');

const SEMANTIC_CLASS = {
  // radius trio + type-scale utilities count as usage of their token
  'radius-container': /\brounded-container\b/g,
  'radius-element': /\brounded-element\b/g,
  'radius-badge': /\brounded-badge\b/g,
};
for (const t of tokens) {
  if (t.startsWith('text-') && !t.endsWith('--line-height')) {
    SEMANTIC_CLASS[t] ??= new RegExp(`\\btext-${t.slice(5)}(?![\\w-])`, 'g');
  }
}
// Color tokens are consumed via Tailwind utilities (bg-background, text-muted-foreground, …)
const COLOR_UTILITY_PREFIXES = ['bg', 'text', 'border', 'ring', 'fill', 'stroke', 'outline', 'decoration', 'divide', 'placeholder'];

function countMatches(re) {
  let n = 0;
  for (const m of corpus.matchAll(re)) { void m; n += 1; }
  return n;
}

const usage = tokens.map((token) => {
  let count = countMatches(new RegExp(`var\\(--${token}\\)`, 'g'));
  const semantic = SEMANTIC_CLASS[token];
  if (semantic) count += countMatches(new RegExp(semantic.source, 'g'));
  // Heuristic for color tokens: utility classes named after the token.
  if (!token.startsWith('text-') && !token.startsWith('radius-') && !token.includes('transition') && !token.includes('tracking') && !token.includes('shadow') && !token.startsWith('font-')) {
    const cls = new RegExp(`\\b(?:${COLOR_UTILITY_PREFIXES.join('|')})-${token}(?![\\w-])`, 'g');
    count += countMatches(cls);
  }
  return { token, count };
});

// ---------------------------------------------------------------------------
// 3. Lint suppressions touching the design rules
// ---------------------------------------------------------------------------
let suppressions = 0;
for (const text of contents) {
  suppressions += (text.match(/eslint-disable[^\n]*no-restricted-syntax/g) ?? []).length;
}

// ---------------------------------------------------------------------------
// 3b. Hardcoded color literals per file (heuristic — ESLint is the enforcer;
// this surfaces WHERE the functional-exception usage lives and catches drift)
// ---------------------------------------------------------------------------
const LITERAL_RE = /["'`]#[0-9a-fA-F]{6}\b|rgba?\(\s*\d|hsla?\(\s*\d/g;
const colorLiteralFiles = files
  .map((f, i) => ({
    file: f.slice(root.length + 1),
    count: (contents[i].match(LITERAL_RE) ?? []).length,
  }))
  .filter((e) => e.count > 0)
  .sort((a, b) => b.count - a.count);
const colorLiteralTotal = colorLiteralFiles.reduce((n, e) => n + e.count, 0);

// ---------------------------------------------------------------------------
// 4. Doc drift vs docs/design-system/README.md
// ---------------------------------------------------------------------------
let docTokens = [];
try {
  const doc = readFileSync(join(root, 'docs/design-system/README.md'), 'utf8');
  docTokens = [...new Set([...doc.matchAll(/--([a-z][\w-]*)/g)].map((m) => m[1]))];
} catch {
  // missing doc = everything is undocumented
}
const tokenSet = new Set(tokens);
const docSet = new Set(docTokens);
const missingFromDocs = tokens.filter((t) => !docSet.has(t));
const staleInDocs = docTokens.filter((t) => !tokenSet.has(t) && !t.startsWith('color-'));

// ---------------------------------------------------------------------------
// 5. Write artifact
// ---------------------------------------------------------------------------
const artifact = {
  generated_at: new Date().toISOString(),
  token_count: tokens.length,
  usage: usage.sort((a, b) => b.count - a.count),
  unused: usage.filter((u) => u.count === 0).map((u) => u.token),
  eslint: { design_rule_suppressions: suppressions },
  color_literals: { total: colorLiteralTotal, files: colorLiteralFiles.slice(0, 30) },
  docs: { missing_from_docs: missingFromDocs, stale_in_docs: staleInDocs },
};

const out = join(root, 'public/design-audit.json');
writeFileSync(out, JSON.stringify(artifact, null, 2) + '\n');
console.log(
  `design-audit: ${tokens.length} tokens, ${artifact.unused.length} unused, ` +
    `${suppressions} suppressions, ${missingFromDocs.length} undocumented → ${out}`,
);
