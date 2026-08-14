import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guard on `Input`'s fill/foreground coupling.
 *
 * The subway-map rebrand (2026-08-09) changed the field from an INVERTED plate
 * (`bg-inverse-surface` + `text-background`) to an ink-bordered paper box
 * (`bg-background` + `text-foreground`), which makes the historical failure
 * mode much harder to hit — overriding the fill with any light surface still
 * leaves readable ink type. The guard stays because the coupling itself is
 * what was fragile, not one particular pair of tokens: a caller that repaints
 * the fill and not the type is still asserting a contrast ratio it never
 * measured.
 *
 * The original incident: `UniversalSearchBar` passed `bg-transparent`, leaving
 * `text-background` over the container's `bg-muted` — **white on #f5f5f5,
 * 1.09:1**. It failed `Playwright + axe a11y suite` and `Lighthouse a11y >= 95`
 * on every PR while main sat red.
 *
 * This lives in the REQUIRED `test` job on purpose. The two checks that caught
 * it are not required, and `axe full route sweep` — the only thing that would
 * scan every route — cancels on the runner timeout on every single run, so it
 * gates nothing. Same reasoning as `tokenContrast.test.ts`.
 */

/** Tailwind `text-*` utilities that set SIZE or ALIGNMENT, never colour. */
const NON_COLOUR_TEXT = new Set([
  'xs',
  'sm',
  'base',
  'lg',
  'xl',
  '2xl',
  '3xl',
  '4xl',
  '5xl',
  '6xl',
  '7xl',
  '8xl',
  '9xl',
  'left',
  'center',
  'right',
  'justify',
  'start',
  'end',
  'balance',
  'pretty',
  'wrap',
  'nowrap',
  'clip',
  'ellipsis',
  // project scale (src/index.css @theme)
  'hero',
  'hero-xl',
  'display',
  'headline',
  'title',
  'body-lg',
  '15',
  '13',
  'xs2',
  '2xs',
  '3xs',
]);

const setsColour = (cls: string) => {
  const m = /^text-(.+)$/.exec(cls);
  if (!m) return false;
  const suffix = m[1].replace(/\/\d+$/, ''); // strip opacity, e.g. text-foreground/70
  return !NON_COLOUR_TEXT.has(suffix);
};

const overridesPlateBackground = (cls: string) => /^bg-/.test(cls) && cls !== 'bg-background';

/**
 * The field has THREE coupled halves, not two: `input.tsx` also sets
 * `placeholder:text-muted-foreground`. A caller that restores only the value
 * colour still leaves the placeholder on the primitive's assumption. That is
 * not the lesser half of the bug: the field that failed axe was EMPTY, so the
 * node axe measured was the placeholder.
 */
const setsPlaceholderColour = (cls: string) => {
  const m = /^placeholder:(text-.+)$/.exec(cls);
  return m ? setsColour(m[1]) : false;
};

/**
 * Exported so the detector itself is tested against known-good/known-bad input —
 * a repo-wide scan that finds nothing proves nothing on its own.
 */
/**
 * The three primitives that share the fill/foreground coupling. `Textarea` and
 * `SelectTrigger` were migrated off the PASTE-UP inverted plate onto `Input`'s
 * ink-on-paper box (2026-08-11) — the same shape means the same failure mode,
 * so they belong in the same guard rather than waiting for their own incident.
 *
 * `SelectTrigger` renders no placeholder (a select always shows a value or
 * `SelectValue`'s own child), so requiring `placeholder:text-*` of it would be
 * a false positive. The primitives that DO set a placeholder colour are listed
 * here; the requirement is derived from that, not assumed for all three.
 */
const PLATE_PRIMITIVES = ['Input', 'Textarea', 'SelectTrigger'] as const;
const SETS_PLACEHOLDER = new Set(['Input', 'Textarea']);

export function findPlateOverrideViolations(source: string, file: string) {
  const out: { file: string; classes: string; missing: string }[] = [];
  for (const name of PLATE_PRIMITIVES) {
    // Each element, non-greedy to its self-closing tag OR its opening `>`;
    // SelectTrigger wraps children, so it is not self-closing.
    const re = new RegExp(`<${name}\\b[^>]*?/?>`, 'g');
    for (const el of source.matchAll(re)) {
      const tag = el[0];
      // className="..." — the only form that can carry a literal override.
      const cn = /className=(?:"([^"]*)"|\{`([^`]*)`\})/.exec(tag);
      if (!cn) continue;
      const classes = (cn[1] ?? cn[2] ?? '').split(/\s+/).filter(Boolean);
      if (!classes.some(overridesPlateBackground)) continue;
      const missing = [
        classes.some(setsColour) ? null : 'text-*',
        SETS_PLACEHOLDER.has(name) && !classes.some(setsPlaceholderColour)
          ? 'placeholder:text-*'
          : null,
      ].filter(Boolean);
      if (missing.length)
        out.push({ file: `${file} (<${name}>)`, classes: classes.join(' '), missing: missing.join(' + ') });
    }
  }
  return out;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== 'node_modules' && name !== '__tests__') walk(p, acc);
    } else if (p.endsWith('.tsx')) acc.push(p);
  }
  return acc;
}

describe('Input inverted-plate override', () => {
  it('detects a background override with no foreground (non-vacuity)', () => {
    const bad = '<Input className="border-0 bg-transparent text-sm" />';
    expect(findPlateOverrideViolations(bad, 'x.tsx')).toHaveLength(1);
  });

  it('treats text-sm / text-lg as sizes, not colours', () => {
    // The real bug hid behind exactly this: the className DID contain `text-sm`.
    const bad = '<Input className="bg-transparent text-sm md:text-base" />';
    expect(findPlateOverrideViolations(bad, 'x.tsx')).toHaveLength(1);
  });

  it('detects a value colour restored but the placeholder left inverted', () => {
    // Accepted before this case existed. The primitive's
    // `placeholder:text-background/70` survives, so an empty field still
    // renders ~1:1 — and empty is exactly how axe found the original.
    const bad = '<Input className="bg-transparent text-foreground" />';
    const [v] = findPlateOverrideViolations(bad, 'x.tsx');
    expect(v?.missing).toBe('placeholder:text-*');
  });

  it('treats placeholder:text-sm as a size, not a placeholder colour', () => {
    const bad = '<Input className="bg-transparent text-foreground placeholder:text-sm" />';
    expect(findPlateOverrideViolations(bad, 'x.tsx')).toHaveLength(1);
  });

  it('accepts an override that restores both halves', () => {
    const good =
      '<Input className="bg-transparent text-foreground placeholder:text-muted-foreground text-sm" />';
    expect(findPlateOverrideViolations(good, 'x.tsx')).toHaveLength(0);
  });

  it('ignores an Input that keeps the plate', () => {
    const good = '<Input className="h-9 w-full text-sm" />';
    expect(findPlateOverrideViolations(good, 'x.tsx')).toHaveLength(0);
  });

  it('no component strips the plate background without restoring a foreground', () => {
    const violations = walk(join(process.cwd(), 'src')).flatMap((f) =>
      findPlateOverrideViolations(readFileSync(f, 'utf8'), f.replace(process.cwd() + '/', '')),
    );
    expect(
      violations,
      `Input overrides its plate background without a foreground:\n${violations
        .map((v) => `  ${v.file}\n    ${v.classes}\n    missing: ${v.missing}`)
        .join('\n')}\nAdd text-foreground (+ placeholder:text-muted-foreground).`,
    ).toEqual([]);
  });
});
