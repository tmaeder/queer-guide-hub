import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * The raw Tailwind type scale is banned, and until now nothing banned it.
 *
 * `docs/design-system/README.md` defines an editorial ladder of semantic tokens
 * (`text-headline`, `text-title`, `text-body-lg`, `text-15`, `text-13`,
 * `text-2xs`…) and a rank table saying which belongs at which nesting level.
 * `eslint.config.js` enforces radius, shadows, chromatic classes, colour
 * literals, odd-step spacing and `font-extrabold` — but
 * `grep -n "text-2xl" eslint.config.js` returns nothing. There is no selector
 * and no source scan, in either tree, so `text-2xl font-bold` drifted back in
 * 224 times.
 *
 * **This is a vitest scan and not another `no-restricted-syntax` selector, for
 * two reasons that the config's own comments already warn about.**
 *
 * 1. Flat config replaces a rule WHOLESALE per file — the last matching block
 *    wins — so a selector has to be restated in every block that could match,
 *    and one omission silently disables it (precedent: #2049, where the public
 *    block dropped the hex selector and nobody noticed).
 * 2. `Literal[value=/…/]` cannot match a `TemplateLiteral` quasi. Every
 *    className rule in that config is bypassable by switching `"…"` to
 *    `` `…` ``, and two admin sites were already hiding `text-2xl` that way
 *    (`pipeline-builder/tabs/HealthTab.tsx`, `tabs/NewsTab.tsx`). This scans raw
 *    file text, so quoting style is irrelevant.
 *
 * **The budgets may only ever SHRINK.** A hard zero would have to land as one
 * enormous sweep across both trees; a ceiling lets the count come down in
 * reviewable passes while making an increase impossible. Lower the number in the
 * same commit that removes the sites — never raise it.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..');
const SRC = join(REPO_ROOT, 'src');

/**
 * Admin is tracked separately from the public tree because the two are cleared
 * by different passes, and a single total would let a regression in one hide
 * behind an improvement in the other.
 */
const BUDGETS = {
  admin: 26,
  public: 165,
} as const;

/**
 * Inline `style={{ fontSize }}` is a SECOND, larger, wholly ungoverned type
 * scale, and nothing could see it — not the eslint `text-[` selector, not the
 * class scan above, because it is not a class at all.
 *
 * Measured when this was added: **345 sites, 92 admin and 253 public, across 13
 * distinct values** — 0.55rem, 0.6rem, 0.65rem, 0.68rem, 0.7rem, 0.72rem,
 * 0.78rem, 0.8rem, 0.85rem, 0.875rem, 0.9em, 13px, 14px. That is more sites than
 * the class-based scale had, and it is precisely the "arbitrary text-[19px]"
 * problem the config's own rule message says the type scale replaced — simply
 * written in a form no selector matches.
 *
 * Capped rather than cleared: 345 token decisions is its own pass, and the
 * public 253 are outside the admin remit. The cap is what stops it growing while
 * it waits.
 */
const INLINE_FONT_SIZE = /fontSize:\s*['"`]/g;

/** `text-lg`, `text-xl`, `text-2xl` … `text-9xl`. Not `text-2xs`/`text-xs2`. */
const RAW_TYPE_SCALE = /\btext-(lg|xl|[2-9]xl)\b/g;

const INLINE_BUDGETS = {
  admin: 92,
  public: 253,
} as const;

/** Files whose own purpose is to name these classes. */
const EXEMPT = [
  // The design-token catalog and its drift test describe the scale.
  'src/components/admin/design/tokenCatalog.ts',
  'src/lib/utils.ts',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== 'node_modules' && entry !== '__tests__') walk(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

interface Hit {
  file: string;
  line: number;
  cls: string;
}

interface ScanResult {
  admin: Hit[];
  public: Hit[];
  inlineAdmin: Hit[];
  inlinePublic: Hit[];
  filesScanned: number;
}

function scan(): ScanResult {
  const admin: Hit[] = [];
  const pub: Hit[] = [];
  const inlineAdmin: Hit[] = [];
  const inlinePublic: Hit[] = [];
  const files = walk(SRC);

  for (const full of files) {
    const rel = relative(REPO_ROOT, full);
    if (EXEMPT.includes(rel)) continue;
    const src = readFileSync(full, 'utf8');
    const isAdmin = /^src\/(components\/admin|pages\/admin)/.test(rel);
    for (const m of src.matchAll(RAW_TYPE_SCALE)) {
      const hit = {
        file: rel,
        line: src.slice(0, m.index).split('\n').length,
        cls: m[0],
      };
      (isAdmin ? admin : pub).push(hit);
    }
    for (const m of src.matchAll(INLINE_FONT_SIZE)) {
      const hit = {
        file: rel,
        line: src.slice(0, m.index).split('\n').length,
        cls: 'style fontSize',
      };
      (isAdmin ? inlineAdmin : inlinePublic).push(hit);
    }
  }
  return { admin, public: pub, inlineAdmin, inlinePublic, filesScanned: files.length };
}

function report(hits: Hit[], budget: number, tree: string): string {
  const byFile = new Map<string, number>();
  for (const h of hits) byFile.set(h.file, (byFile.get(h.file) ?? 0) + 1);
  const worst = [...byFile.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([f, n]) => `  ${n}× ${f}`)
    .join('\n');
  return (
    `${tree} tree has ${hits.length} raw type-scale classes, budget ${budget}.\n` +
    `Use the semantic ladder in docs/design-system/README.md. In admin, the\n` +
    `repeated "text-2xl font-bold" stat figure is what AdminStatTile/AdminStat\n` +
    `already are.\n` +
    `If you REMOVED sites, lower BUDGETS.${tree} in this same commit.\n${worst}`
  );
}

describe('raw Tailwind type scale is capped and may only shrink', () => {
  const { admin, public: pub, inlineAdmin, inlinePublic, filesScanned } = scan();

  it('scans a non-trivial number of files (a broken walk must not read as clean)', () => {
    expect(filesScanned).toBeGreaterThan(500);
  });

  it('finds hits at all (positive control — a dead regex would pass everything)', () => {
    expect(admin.length + pub.length).toBeGreaterThan(0);
  });

  it('admin tree stays within budget', () => {
    expect(admin.length, report(admin, BUDGETS.admin, 'admin')).toBeLessThanOrEqual(BUDGETS.admin);
  });

  it('public tree stays within budget', () => {
    expect(pub.length, report(pub, BUDGETS.public, 'public')).toBeLessThanOrEqual(BUDGETS.public);
  });

  it('catches the class inside a template literal, which no eslint selector can', () => {
    // Guards the scan's own reason for existing. If this ever fails, the regex
    // has been narrowed to quoted strings and the bypass is open again.
    const sample = 'const c = `flex text-2xl ${x}`;';
    expect([...sample.matchAll(RAW_TYPE_SCALE)].map((m) => m[0])).toEqual(['text-2xl']);
  });

  it('does not fire on the micro-scale tokens it must leave alone', () => {
    const sample = 'text-2xs text-xs2 text-3xs text-15 text-13 text-headline text-title';
    expect([...sample.matchAll(RAW_TYPE_SCALE)]).toEqual([]);
  });

  it('admin inline style fontSize stays within budget', () => {
    expect(
      inlineAdmin.length,
      report(inlineAdmin, INLINE_BUDGETS.admin, 'admin inline fontSize'),
    ).toBeLessThanOrEqual(INLINE_BUDGETS.admin);
  });

  it('public inline style fontSize stays within budget', () => {
    expect(
      inlinePublic.length,
      report(inlinePublic, INLINE_BUDGETS.public, 'public inline fontSize'),
    ).toBeLessThanOrEqual(INLINE_BUDGETS.public);
  });

  it('sees inline fontSize at all (positive control)', () => {
    // The whole point of this half is that no class-based rule can see it, so a
    // silently non-matching regex would leave 345 sites ungoverned and green.
    expect(inlineAdmin.length + inlinePublic.length).toBeGreaterThan(0);
    const sample = `<p style={{ fontSize: '0.7rem' }}>x</p>`;
    expect([...sample.matchAll(INLINE_FONT_SIZE)]).toHaveLength(1);
  });
});
