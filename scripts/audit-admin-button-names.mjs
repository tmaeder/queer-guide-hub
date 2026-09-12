#!/usr/bin/env node
/**
 * Find admin `<Button>`s with no accessible name.
 *
 * An icon-only button with no `aria-label` is an axe `button-name` violation
 * (critical, WCAG 4.1.2) and announces as "button" with no indication of what it
 * does. Admin has ~63 dialogs and dozens of dense toolbars, and
 * `e2e/a11y-admin.spec.ts` visits 8 of 41 routes while `e2e/a11y-dialogs.spec.ts`
 * states it is public surfaces only — so most of these sit where no axe scan
 * has ever looked.
 *
 * **Why a script and not a grep.** Two naive approaches both give wrong answers,
 * and I ran both before writing this:
 *   - a loose scan that strips `{...}` expressions counts `<Button>{label}</Button>`
 *     as empty and reports ~85, most of them false;
 *   - a scan that only looks for `aria-label` misses `title`, `sr-only` children
 *     and a visible text child, and over-reports again.
 *
 * The Radix `Tooltip` case is reported SEPARATELY and deliberately. A tooltip
 * supplies `aria-describedby` when open — a description, never a name — so those
 * buttons are still unnamed, but they are a different fix (the author thought
 * they had handled it) and a different risk (sighted-mouse users do get the
 * label). Lumping them together is how a real count becomes an argument.
 *
 * Usage: node scripts/audit-admin-button-names.mjs [--json]
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const DIRS = ['src/components/admin', 'src/pages/admin'];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== '__tests__' && entry !== 'node_modules') walk(full, out);
    } else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/**
 * Slice out balanced JSX elements named `tag`, handling nesting and
 * self-closing forms. A regex cannot do this: `<Button>` bodies contain nested
 * elements and `>` inside expressions.
 */
function elements(src, tag) {
  const found = [];
  const open = new RegExp(`<${tag}(?=[\\s/>])`, 'g');
  let m;
  while ((m = open.exec(src))) {
    // Walk to the end of the opening tag, tracking quotes and braces so a `>`
    // inside a prop expression does not terminate it early.
    let i = m.index + m[0].length;
    let depth = 0;
    let quote = null;
    let selfClosing = false;
    for (; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) {
        selfClosing = src[i - 1] === '/';
        break;
      }
    }
    const openEnd = i + 1;
    const attrs = src.slice(m.index, openEnd);
    if (selfClosing) {
      found.push({ start: m.index, end: openEnd, attrs, body: '' });
      continue;
    }
    // Balance nested same-tag elements to find the matching close.
    let level = 1;
    let j = openEnd;
    const nestedOpen = new RegExp(`<${tag}(?=[\\s/>])`, 'g');
    const close = `</${tag}>`;
    while (level > 0 && j < src.length) {
      const nextClose = src.indexOf(close, j);
      nestedOpen.lastIndex = j;
      const nextOpenMatch = nestedOpen.exec(src);
      const nextOpen = nextOpenMatch && nextOpenMatch.index < (nextClose === -1 ? Infinity : nextClose)
        ? nextOpenMatch.index
        : -1;
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        level++;
        j = nextOpen + 1;
      } else {
        level--;
        j = nextClose + close.length;
      }
    }
    found.push({ start: m.index, end: j, attrs, body: src.slice(openEnd, j - close.length) });
  }
  return found;
}

/** Does the body contain text a screen reader would read as the name? */
function hasTextChild(body) {
  // Drop nested elements and expressions, then see if any literal text remains.
  const stripped = body
    .replace(/<[^>]*>/g, ' ')
    .replace(/\{[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.length > 0;
}

/** An expression child like `{label}` or `{t('x')}` may well be the name. */
function hasExpressionChild(body) {
  const withoutTags = body.replace(/<[^>]*\/>/g, ' ').replace(/<[^>]*>/g, ' ');
  return /\{[^{}]*(\{[^{}]*\}[^{}]*)*\}/.test(withoutTags);
}

function hasIconChild(body) {
  return /<[A-Z][A-Za-z0-9]*\b[^>]*\/>/.test(body) || /<[A-Z][A-Za-z0-9]*\b[^>]*>/.test(body);
}

const results = { unnamed: [], tooltipOnly: [] };

for (const dir of DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const src = readFileSync(file, 'utf8');
    const rel = relative(ROOT, file);
    for (const el of elements(src, 'Button')) {
      const { attrs, body, start } = el;
      if (/aria-label|aria-labelledby|title=/.test(attrs)) continue;
      if (/sr-only/.test(body)) continue;
      if (hasTextChild(body)) continue;
      if (hasExpressionChild(body)) continue; // could be the name — not our call
      if (!hasIconChild(body)) continue; // empty button, a different problem
      const line = src.slice(0, start).split('\n').length;
      // Is it wrapped in a Radix TooltipTrigger within a few lines above?
      const before = src.slice(Math.max(0, start - 400), start);
      const bucket = /TooltipTrigger/.test(before) ? 'tooltipOnly' : 'unnamed';
      results[bucket].push({ file: rel, line });
    }
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(results, null, 2));
} else {
  console.log(`Unnamed icon-only Buttons (no name from any source): ${results.unnamed.length}`);
  for (const r of results.unnamed) console.log(`  ${r.file}:${r.line}`);
  console.log(
    `\nInside a Radix Tooltip (aria-describedby is a DESCRIPTION, never a name): ${results.tooltipOnly.length}`,
  );
  for (const r of results.tooltipOnly) console.log(`  ${r.file}:${r.line}`);
  console.log(`\nTotal needing an aria-label: ${results.unnamed.length + results.tooltipOnly.length}`);
}
