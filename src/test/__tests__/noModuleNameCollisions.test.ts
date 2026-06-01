import { describe, it, expect } from 'vitest';

/**
 * Regression guard for the topbar-crash bug (#1389): two source files shared the
 * base name `useRecommendations` (`.ts` + `.tsx`). Vite resolves `.ts` before
 * `.tsx`, so a bare `@/hooks/useRecommendations` import silently picked the wrong
 * module — a class of bug the type-checker and tests can't catch (the import
 * "resolves", just to the wrong file).
 *
 * This fails if any two *importable* source modules in the same directory share
 * a base name across resolvable extensions (.ts/.tsx/.js/.jsx). Test files are
 * excluded — nothing imports them, so a duplicate there is harmless and vitest
 * just runs both.
 */
describe('module name collisions', () => {
  it('no two importable source modules share a base name + dir across .ts/.tsx/.js/.jsx', () => {
    const modules = import.meta.glob('/src/**/*.{ts,tsx,js,jsx}', { eager: false });
    const groups: Record<string, string[]> = {};

    for (const path of Object.keys(modules)) {
      if (path.endsWith('.d.ts')) continue;
      // Exclude test/spec files and anything under a __tests__ dir.
      if (/\.(test|spec)\.[tj]sx?$/.test(path)) continue;
      if (path.includes('/__tests__/')) continue;
      const key = path.replace(/\.(ts|tsx|js|jsx)$/, '');
      (groups[key] ??= []).push(path);
    }

    const collisions = Object.entries(groups)
      .filter(([, files]) => files.length > 1)
      .map(([, files]) => files.sort().join('  ⟷  '));

    expect(collisions, `Ambiguous module resolution — rename one file:\n${collisions.join('\n')}`).toEqual([]);
  });
});
