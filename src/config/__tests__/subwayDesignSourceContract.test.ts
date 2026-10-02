import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd(), 'src');

function productionSources(directory = ROOT): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'test') return [];
      return productionSources(path);
    }
    if (!/\.(?:css|ts|tsx)$/.test(entry.name) || /\.test\.[^.]+$/.test(entry.name)) return [];
    return [path];
  });
}

const sources = productionSources().map((path) => ({
  path: relative(process.cwd(), path),
  source: readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => !/^\s*(?:\/\/|\*)/.test(line))
    .join('\n'),
}));

const forbidden: Array<[name: string, pattern: RegExp]> = [
  ['rotating spinner class', /\banimate-spin\b/],
  ['inline spin animation', /animation\s*:\s*['"][^'"]*\bspin\b/],
  ['spin keyframes', /@keyframes\s+spin\b/],
  ['legacy Inter font override', /font-family\s*:\s*['"]?Inter\b/i],
  ['bare loading copy', />\s*Loading(?:\.{3}|…)?\s*</],
  ['raw inline CSS timing', /transition\s*:\s*['"][^'"]*\b\d+(?:ms|s)\b/],
  [
    'raw CSS motion timing',
    /(?:animation(?:-delay)?|transition)\s*:[^;\n]*\b\d+(?:\.\d+)?(?:ms|s)\b/,
  ],
  [
    'raw camel-case motion timing',
    /animation(?:Delay|Duration)\s*:\s*(?:['"`][^'"`]*\b\d+(?:\.\d+)?(?:ms|s)\b|\d+)/,
  ],
  ['raw JSX animation duration', /animationDuration=\{\d+\}/],
  ['raw Motion timing', /transition\s*=\s*\{\{[^}]*duration\s*:\s*(?!0(?:\D|$))\d+(?:\.\d+)?/],
];

describe('subway design source contract', () => {
  it.each(forbidden)('contains no %s', (_name, pattern) => {
    const violations = sources.filter(({ source }) => pattern.test(source)).map(({ path }) => path);

    expect(violations, `Design-system drift:\n${violations.join('\n')}`).toEqual([]);
  });
});
