/**
 * Safari (and every iOS browser) allows window.open() only while the click's
 * user activation is still live. An `await` spends it, so
 *
 *   onClick={async () => { const url = await fetchUrl(); window.open(url) }}
 *
 * is silently treated as a blocked popup there, while desktop Chrome tolerates
 * it. Five such call sites shipped (document download, ChatGPT OAuth, CMS
 * attachment snapshot, packing and reservation suggestions) and none was
 * caught by any test, because the failure only exists in WebKit.
 *
 * This scans every non-test source file in src/ with the TypeScript parser and
 * fails on a window.open() that follows an `await` in its own function, or
 * that sits in a .then()/.catch()/.finally()/setTimeout callback. Fix: open
 * first (when the URL is known), or use openPendingWindow() from
 * src/lib/openPendingWindow.ts and navigate it once the URL arrives.
 *
 * Scope stated rather than implied: it cannot see a window.open() inside a
 * helper that a caller invokes after an await in a DIFFERENT function.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const ROOT = join(__dirname, '..', '..', '..');
const SRC = join(ROOT, 'src');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      out.push(...sourceFiles(p));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

type Fn = ts.FunctionLikeDeclaration;
const isFn = (n: ts.Node): n is Fn =>
  ts.isFunctionDeclaration(n) ||
  ts.isFunctionExpression(n) ||
  ts.isArrowFunction(n) ||
  ts.isMethodDeclaration(n);

/** Is there an `await` in `fn` itself (not a nested function) that starts before `pos`? */
function awaitBefore(fn: Fn, pos: number): boolean {
  let found = false;
  const scan = (x: ts.Node) => {
    if (found) return;
    if (x !== fn && isFn(x)) return;
    if (ts.isAwaitExpression(x) && x.getStart() < pos) {
      found = true;
      return;
    }
    ts.forEachChild(x, scan);
  };
  ts.forEachChild(fn, scan);
  return found;
}

const DEFERRING_CALLBACK =
  /\.(then|catch|finally)$|^(setTimeout|setInterval|requestAnimationFrame)$/;

export function findAsyncWindowOpens(file: string, src: string): string[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  const hits: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && n.expression.getText(sf) === 'window.open') {
      let fn: ts.Node | undefined = n.parent;
      while (fn && !isFn(fn)) fn = fn.parent;
      if (fn && isFn(fn)) {
        const why: string[] = [];
        if (awaitBefore(fn, n.getStart())) why.push('after an await');
        const parent = fn.parent;
        if (
          parent &&
          ts.isCallExpression(parent) &&
          DEFERRING_CALLBACK.test(parent.expression.getText(sf))
        ) {
          why.push(`inside ${parent.expression.getText(sf)}()`);
        }
        if (why.length) {
          const line = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
          hits.push(`${file}:${line} window.open() ${why.join(' and ')}`);
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return hits;
}

describe('no window.open() after an await (Safari popup blocking)', () => {
  it('detects the shapes it exists for (positive control)', () => {
    // Without this, an empty match set would also satisfy the corpus check.
    const bad = [
      `const a = async () => { const u = await f(); window.open(u); };`,
      `async function b() { await g(); window.open('x'); }`,
      `f().then((u) => { window.open(u); });`,
      `setTimeout(() => window.open('x'), 10);`,
    ];
    for (const code of bad) expect(findAsyncWindowOpens('fixture.ts', code)).toHaveLength(1);
    const good = [
      `const a = async () => { window.open('x'); await f(); };`,
      `const b = () => window.open('x');`,
      `const c = async () => { const w = window.open('about:blank'); const u = await f(); w.location.href = u; };`,
      `const d = async () => { await f(); const inner = () => window.open('x'); return inner; };`,
    ];
    for (const code of good) expect(findAsyncWindowOpens('fixture.ts', code)).toEqual([]);
  });

  it('src/ contains none', () => {
    const files = sourceFiles(SRC);
    const withOpen = files.filter((f) => readFileSync(f, 'utf8').includes('window.open'));
    // The corpus check must actually be looking at something.
    expect(withOpen.length).toBeGreaterThan(10);
    const hits = withOpen.flatMap((f) =>
      findAsyncWindowOpens(relative(ROOT, f), readFileSync(f, 'utf8')),
    );
    expect(hits).toEqual([]);
  });
});
