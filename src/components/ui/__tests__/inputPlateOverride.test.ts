import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guard on `Input`'s inverted-plate contract.
 *
 * `src/components/ui/input.tsx` styles the field as a PLATE — a coupled pair,
 * `bg-inverse-surface` + `text-background`. Both halves flip with the theme
 * together, which is what makes one class correct in light and dark (measured
 * 19.78:1 / 18.11:1 against the page).
 *
 * A caller that overrides only the BACKGROUND breaks the couple: the plate's
 * foreground survives onto whatever surface the field now sits on. That shipped
 * — `UniversalSearchBar` passed `bg-transparent`, leaving `text-background` over
 * the container's `bg-muted`: **white on #f5f5f5, 1.09:1** in light mode and
 * near-black on #1f1f1f in dark. It failed `Playwright + axe a11y suite` and
 * `Lighthouse a11y >= 95` on every PR while main sat red.
 *
 * This lives in the REQUIRED `test` job on purpose. The two checks that caught
 * it are not required, and `axe full route sweep` — the only thing that would
 * scan every route — cancels on the runner timeout on every single run, so it
 * gates nothing. Same reasoning as `tokenContrast.test.ts`.
 */

/** Tailwind `text-*` utilities that set SIZE or ALIGNMENT, never colour. */
const NON_COLOUR_TEXT = new Set([
  'xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl',
  'left', 'center', 'right', 'justify', 'start', 'end',
  'balance', 'pretty', 'wrap', 'nowrap', 'clip', 'ellipsis',
  // project scale (src/index.css @theme)
  'hero', 'hero-xl', 'display', 'headline', 'headline-lg', 'title', 'body-lg',
  '15', '13', 'xs2', '2xs', '3xs',
]);

const setsColour = (cls: string) => {
  const m = /^text-(.+)$/.exec(cls);
  if (!m) return false;
  const suffix = m[1].replace(/\/\d+$/, ''); // strip opacity, e.g. text-foreground/70
  return !NON_COLOUR_TEXT.has(suffix);
};

const overridesPlateBackground = (cls: string) =>
  /^bg-/.test(cls) && cls !== 'bg-inverse-surface';

/**
 * Exported so the detector itself is tested against known-good/known-bad input —
 * a repo-wide scan that finds nothing proves nothing on its own.
 */
export function findPlateOverrideViolations(source: string, file: string) {
  const out: { file: string; classes: string }[] = [];
  // Each <Input ... /> element, non-greedy up to its self-closing tag.
  for (const el of source.matchAll(/<Input\b[\s\S]*?\/>/g)) {
    const tag = el[0];
    // className="..." — the only form that can carry a literal override.
    const cn = /className=(?:"([^"]*)"|\{`([^`]*)`\})/.exec(tag);
    if (!cn) continue;
    const classes = (cn[1] ?? cn[2] ?? '').split(/\s+/).filter(Boolean);
    const strips = classes.some(overridesPlateBackground);
    const restores = classes.some(setsColour);
    if (strips && !restores) out.push({ file, classes: classes.join(' ') });
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

  it('accepts an override that restores a foreground', () => {
    const good = '<Input className="bg-transparent text-foreground text-sm" />';
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
        .map((v) => `  ${v.file}\n    ${v.classes}`)
        .join('\n')}\nAdd text-foreground (+ placeholder:text-muted-foreground).`,
    ).toEqual([]);
  });
});
