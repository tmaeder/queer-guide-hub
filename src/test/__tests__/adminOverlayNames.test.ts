import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Every admin overlay must have an accessible name.
 *
 * A `role="dialog"` with no name announces as an unlabelled dialog — axe
 * `aria-dialog-name` / `dialog-name`, serious. Admin has ~63 overlays and
 * `e2e/a11y-dialogs.spec.ts` says in its own docblock that it covers **public
 * surfaces only**, so not one of them had ever been scanned.
 *
 * **This is a source scan rather than an e2e sweep on purpose.** Driving 63
 * admin dialogs means finding and clicking 63 triggers behind auth, and the
 * result would be slow, flaky, and would still silently skip any dialog whose
 * trigger moved. The name is a static property of the JSX, so it can be checked
 * statically and exhaustively in milliseconds.
 *
 * Two things make this possible to assert at all:
 *   - `DialogTitle` wraps `DialogPrimitive.Title`, so a `DialogTitle` anywhere in
 *     the content genuinely names the dialog.
 *   - `SheetTitle` did NOT — this Sheet is hand-rolled, not Radix, and the title
 *     was an id-less `<h2>` while `SheetContent` set no `aria-labelledby`. All 32
 *     sheets in the app were unnamed dialogs, including the 25 whose authors had
 *     added a `SheetTitle`. Fixed in `src/components/ui/sheet.tsx`; without that
 *     fix this test would be asserting a name that does not reach the browser.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..');
const DIRS = ['src/components/admin', 'src/pages/admin'];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== '__tests__' && entry !== 'node_modules') walk(full, out);
    } else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/**
 * Slice each `<Tag …>…</Tag>` element, balancing nesting and tolerating `>`
 * inside prop expressions. A regex alone mis-slices both.
 */
function elements(src: string, tag: string) {
  const out: { attrs: string; body: string; index: number }[] = [];
  const open = new RegExp(`<${tag}(?=[\\s/>])`, 'g');
  let m: RegExpExecArray | null;
  while ((m = open.exec(src))) {
    let i = m.index + m[0].length;
    let depth = 0;
    let quote: string | null = null;
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
      out.push({ attrs, body: '', index: m.index });
      continue;
    }
    const close = `</${tag}>`;
    let level = 1;
    let j = openEnd;
    while (level > 0 && j < src.length) {
      const nextClose = src.indexOf(close, j);
      if (nextClose === -1) break;
      const nested = new RegExp(`<${tag}(?=[\\s/>])`, 'g');
      nested.lastIndex = j;
      const nm = nested.exec(src);
      if (nm && nm.index < nextClose) {
        level++;
        j = nm.index + 1;
      } else {
        level--;
        j = nextClose + close.length;
      }
    }
    out.push({
      attrs,
      body: src.slice(openEnd, Math.max(openEnd, j - close.length)),
      index: m.index,
    });
  }
  return out;
}

const OVERLAYS = [
  { tag: 'DialogContent', title: 'DialogTitle' },
  { tag: 'SheetContent', title: 'SheetTitle' },
  { tag: 'AlertDialogContent', title: 'AlertDialogTitle' },
] as const;

function scan() {
  const unnamed: string[] = [];
  let overlaysFound = 0;
  const files = DIRS.flatMap((d) => walk(join(REPO_ROOT, d)));

  for (const full of files) {
    const src = readFileSync(full, 'utf8');
    const rel = relative(REPO_ROOT, full);
    for (const { tag, title } of OVERLAYS) {
      for (const el of elements(src, tag)) {
        overlaysFound++;
        // Two name sources, and only two: the matching Title component anywhere
        // in the content, or an explicit aria-label/-labelledby on the content
        // element. Deliberately NOT treating "the body is one custom component
        // that might render its own title" as named — that heuristic cannot be
        // checked, and an overlay whose name depends on a child's internals is
        // exactly the case worth making explicit.
        const named = el.body.includes(`<${title}`) || /aria-label(?:ledby)?=/.test(el.attrs);
        if (!named) {
          const line = src.slice(0, el.index).split('\n').length;
          unnamed.push(`${rel}:${line} <${tag}>`);
        }
      }
    }
  }
  return { unnamed, overlaysFound, filesScanned: files.length };
}

describe('admin overlays have an accessible name', () => {
  const { unnamed, overlaysFound, filesScanned } = scan();

  it('scans a non-trivial number of files and overlays', () => {
    // Absence of findings must not be reachable by finding nothing to check.
    expect(filesScanned).toBeGreaterThan(150);
    expect(overlaysFound).toBeGreaterThan(40);
  });

  it('every Dialog / Sheet / AlertDialog is named', () => {
    expect(
      unnamed,
      'These admin overlays render role="dialog" with no accessible name (axe ' +
        'dialog-name, serious). Add a <DialogTitle>/<SheetTitle> — visually hidden ' +
        'with className="sr-only" if there is no visible heading — or an ' +
        `aria-label on the content element.\n${unnamed.join('\n')}`,
    ).toEqual([]);
  });
});
