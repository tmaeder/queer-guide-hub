import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A drag king is not a drag queen.
 *
 * `20260822223231_drag_king_is_not_a_drag_queen.sql` split `drag-king` out of
 * the `professions` vocabulary as its own slug with its own aliases, precisely
 * so the two cannot be conflated. But
 * `scripts/data-quality/import-dragrace-contestants.mjs` hardcoded
 * `profession: 'drag queen'` for every contestant it created — harmless while
 * it only ever saw Drag Race, and wrong the moment King of Drag entered the
 * corpus ("the first drag competition series to feature solely drag kings").
 *
 * This is a TEXT SCAN rather than an import because the script is a `.mjs`
 * outside the vitest `src/**` glob and has no exports — the same idiom the
 * migration-parsing tests in this repo use. It asserts the mapping still
 * exists and that the hardcoded literal has not come back.
 */
const SCRIPT = join(process.cwd(), 'scripts/data-quality/import-dragrace-contestants.mjs');

describe('contestant profession is derived from the show', () => {
  const src = readFileSync(SCRIPT, 'utf8');

  it('does not hardcode every contestant as a drag queen', () => {
    // The exact literal the bug wore. If someone reintroduces it, the 18 King
    // of Drag contestants get filed as queens again and nothing else notices.
    expect(src).not.toMatch(/profession:\s*'drag queen'\s*,/);
    expect(src).toMatch(/profession:\s*franchiseProfession\(/);
  });

  it('maps King of Drag to the drag king profession', () => {
    const m = src.match(/const PROFESSION_BY_FRANCHISE = \[[\s\S]*?\]/);
    expect(m, 'PROFESSION_BY_FRANCHISE not found').toBeTruthy();
    expect(m![0]).toMatch(/King of Drag/i);
    expect(m![0]).toMatch(/'drag king'/);
  });

  it('still defaults to drag queen for everything else', () => {
    // The default matters as much as the exception: without it every
    // non-matching show would land with no profession at all.
    expect(src).toMatch(/return 'drag queen'/);
  });

  it('uses profession slugs the vocabulary actually contains', () => {
    // `normalize_profession_full()` gates writes against `professions`, so an
    // invented slug here would be silently rejected downstream. Both of these
    // are real rows (verified on prod: drag-king and drag-queen, each with
    // their own alias list).
    const m = src.match(/const PROFESSION_BY_FRANCHISE = \[[\s\S]*?\]/)![0];
    const used = [...m.matchAll(/'([a-z ]+)'\s*\]/g)].map((x) => x[1]);
    for (const slug of used) {
      expect(['drag king', 'drag queen'], `unknown profession "${slug}"`).toContain(slug);
    }
  });
});
