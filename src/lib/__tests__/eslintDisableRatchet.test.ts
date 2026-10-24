import { describe, expect, it } from 'vitest';
import {
  compare,
  countSuppressions,
  scan,
} from '../../../scripts/check-eslint-disable-ratchet.mjs';

// Directive words are split so this file's fixtures are not themselves counted.
const D = 'eslint-' + 'disable';
const T = '@' + 'ts-';

describe('countSuppressions', () => {
  it('counts every directive form, multi-rule lists and bare disables', () => {
    const src = [
      `// ${D}-next-line react-hooks/exhaustive-deps -- reason, with comma`,
      `x(); // ${D}-line no-console`,
      `/* ${D} @typescript-eslint/no-explicit-any, no-console */`,
      `{/* ${D}-next-line react-refresh/only-export-components */}`,
      `// ${D}`,
      `/* ${D} */`,
      `// ${T}expect-error -- untyped lib`,
      `// ${T}ignore`,
      `/* ${T}nocheck */`,
    ].join('\n');
    expect(countSuppressions(src)).toEqual({
      'react-hooks/exhaustive-deps': 1,
      'no-console': 2,
      '@typescript-eslint/no-explicit-any': 1,
      'react-refresh/only-export-components': 1,
      '*': 2,
      [`${T}expect-error`]: 1,
      [`${T}ignore`]: 1,
      [`${T}nocheck`]: 1,
    });
  });

  it('ignores mentions outside a comment directive and eslint-enable', () => {
    const src = [
      `const msg = 'no ${D} here';`,
      `// we removed the ${D} saying "Admin"`,
      '/* eslint-enable no-console */',
      `const s = "${T}ignore";`,
    ].join('\n');
    expect(countSuppressions(src)).toEqual({});
  });
});

describe('compare', () => {
  const base = { 'a.ts': { 'no-console': 2 } };

  it('passes an unchanged tree', () => {
    expect(compare(base, { 'a.ts': { 'no-console': 2 } })).toEqual({
      regressions: [],
      shrinks: [],
    });
  });

  it('flags a new rule, a new file and an increase as regressions', () => {
    const { regressions } = compare(base, {
      'a.ts': { 'no-console': 3, '*': 1 },
      'b.ts': { '@ts-ignore': 1 },
    });
    expect(regressions).toHaveLength(3);
  });

  it('flags a shrink so the baseline must be re-locked', () => {
    expect(compare(base, {}).shrinks).toEqual([
      { file: 'a.ts', rule: 'no-console', was: 2, now: 0 },
    ]);
  });
});

describe('repo scan (positive control)', () => {
  it('finds the known suppressions in src/', () => {
    const files = scan();
    expect(files['src/lib/__tests__/eslintDisableRatchet.test.ts']).toBeUndefined();
    const rules = Object.values(files).flatMap((f) => Object.keys(f));
    expect(rules).toContain('react-hooks/exhaustive-deps');
    expect(Object.keys(files).length).toBeGreaterThan(100);
  });
});
