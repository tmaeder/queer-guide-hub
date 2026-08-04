import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * The Input primitive is a PASTE-UP inverted plate: `bg-inverse-surface` +
 * `text-background`. That foreground is only legible ON that plate. A consumer
 * that drops the plate (`bg-transparent`, `bg-background`, …) so the field can
 * sit on a surface of its own MUST bring the paired foreground back with it,
 * or the text keeps the plate's colour and lands near-white on near-white in
 * light mode and near-black on near-black in dark mode.
 *
 * That is not hypothetical: it broke the axe and Lighthouse a11y gates on main
 * (search combobox, 1.09:1 light / 1.20:1 dark) across three call sites at once.
 */

const SRC = resolve(__dirname, '../../..');

// withFileTypes keeps this to one syscall per directory — a stat-per-entry walk
// of src/ costs ~15s on an iCloud-synced checkout and times the test out.
function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) tsxFiles(join(dir, entry.name), out);
    else if (entry.name.endsWith('.tsx')) out.push(join(dir, entry.name));
  }
  return out;
}

/** Utilities applied at rest — a variant like `hover:bg-accent` is not an override. */
const overridesBackground = (block: string) => /(?<![\w:-])bg-[a-z]/.test(block);
// Deliberately excludes `text-background`: that IS the plate foreground, so
// re-declaring it off the plate is the bug, not a fix for it.
const setsTextColour = (block: string) =>
  /(?<![\w:-])text-(foreground|muted-foreground|inherit|current|primary|secondary|text-primary|text-secondary|text-muted)\b/.test(
    block,
  );
const setsPlaceholderColour = (block: string) => /placeholder:text-[a-z]/.test(block);

describe('Input plate override guard', () => {
  const primitive = readFileSync(join(SRC, 'components/ui/input.tsx'), 'utf8');

  it('the primitive is still an inverted plate (this guard is about that pairing)', () => {
    // If this fails the primitive changed shape — re-derive the rule below
    // rather than deleting it.
    expect(primitive).toContain('bg-inverse-surface');
    expect(primitive).toContain('text-background');
    expect(primitive).toContain('placeholder:text-background');
  });

  // Walks every .tsx under src/; the default 15s budget is not enough for that
  // on a cold/iCloud-backed checkout running alongside the rest of the suite.
  it(
    'every <Input> that drops the plate also restores a paired foreground',
    { timeout: 60_000 },
    () => {
      const offenders: string[] = [];

      for (const file of tsxFiles(SRC)) {
        const src = readFileSync(file, 'utf8');
        if (!src.includes('@/components/ui/input')) continue;

        for (const match of src.matchAll(/<Input\b[\s\S]*?\/>/g)) {
          const block = match[0];
          if (!overridesBackground(block)) continue;

          const missing: string[] = [];
          if (!setsTextColour(block)) missing.push('text-*');
          if (!setsPlaceholderColour(block)) missing.push('placeholder:text-*');
          if (missing.length === 0) continue;

          const line = src.slice(0, match.index).split('\n').length;
          offenders.push(
            `${file.slice(SRC.length + 1)}:${line} drops the plate background but sets no ${missing.join(' and no ')} colour`,
          );
        }
      }

      expect(
        offenders,
        `An <Input> that overrides bg-* keeps the primitive's text-background, which is only\n` +
          `legible on the inverted plate. Add text-foreground + placeholder:text-muted-foreground\n` +
          `(or the pair matching the surface it now sits on):\n  ${offenders.join('\n  ')}`,
      ).toEqual([]);
    },
  );
});
