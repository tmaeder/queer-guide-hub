import { describe, it, expect } from 'vitest';

// NAMESPACE import, and the shape is load-bearing. `@ts-expect-error` suppresses
// the next LINE, and TS7016 for an untyped .mjs is reported at the MODULE
// SPECIFIER, not at `import {`. A named multi-line import therefore puts the
// directive on a line that no longer errors (TS2578 unused) while the real error
// moves out from under it — two CI failures from a purely cosmetic reformat.
//
// recoverMigrationDrift.test.ts documents that exact trap and solves it by
// keeping the named import on one line. That line is 114 chars against a
// printWidth of 100, so it survives only while nothing reformats it; the
// equivalent here would be 128. A namespace import is 80 chars, cannot be
// wrapped by prettier, and so cannot regress the same way.
// @ts-expect-error — .mjs script lib, no type declarations
import * as siblingMigrations from '../../../scripts/lib/sibling-migrations.mjs';

const { parseWorktreePaths, findSiblingCollisions, groupSiblingCollisions } = siblingMigrations;

/**
 * check-migration-versions.mjs compares the working tree against REMOTE HISTORY,
 * so a version claimed by an unmerged branch is invisible to every one of its
 * checks. Its own header has always said so.
 *
 * Measured 2026-09-03: four migrations across four worktrees simultaneously
 * claimed 20261211100000 — tag_slug_seal, event_tag_link_reads_approved_aliases,
 * kinktionary_new_terms_sourced, news_commit_requires_a_verdict. Every check was
 * green in every tree because none could see the other three. Whichever merges
 * first wins the version; the rest are skipped silently while their PRs read as
 * shipped.
 *
 * Unlike the sibling text-scanning guards in this directory, these are real
 * behavioural tests: the logic is pure by construction so it can be exercised
 * without a git repo or a token.
 */

const V = '20261211100000';

describe('parseWorktreePaths', () => {
  const PORCELAIN = [
    'worktree /repo',
    'HEAD abc',
    'branch refs/heads/main',
    '',
    'worktree /repo/.claude/worktrees/kink-defs',
    'HEAD def',
    'branch refs/heads/claude/kink-defs',
    '',
    'worktree /repo/.claude/worktrees/tag-slug',
    'HEAD 123',
    'detached',
    '',
  ].join('\n');

  it('returns every worktree except the current one', () => {
    expect(parseWorktreePaths(PORCELAIN, '/repo')).toEqual([
      '/repo/.claude/worktrees/kink-defs',
      '/repo/.claude/worktrees/tag-slug',
    ]);
  });

  it('excludes self when self IS a worktree, not the primary checkout', () => {
    const got = parseWorktreePaths(PORCELAIN, '/repo/.claude/worktrees/kink-defs');
    expect(got).not.toContain('/repo/.claude/worktrees/kink-defs');
    expect(got).toContain('/repo');
    expect(got).toContain('/repo/.claude/worktrees/tag-slug');
  });

  it('tolerates empty or absent input rather than throwing', () => {
    expect(parseWorktreePaths('', '/repo')).toEqual([]);
    expect(parseWorktreePaths(null, '/repo')).toEqual([]);
    expect(parseWorktreePaths(undefined, '/repo')).toEqual([]);
  });
});

describe('findSiblingCollisions', () => {
  const ours = [`${V}_news_commit_requires_a_verdict.sql`];
  const allNew = () => true;
  const noneNew = () => false;

  it('flags same version with a different filename', () => {
    const hits = findSiblingCollisions(ours, allNew, [
      { worktree: '/wt/kink-defs', file: `${V}_kinktionary_new_terms_sourced.sql` },
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      version: V,
      file: `${V}_news_commit_requires_a_verdict.sql`,
      siblingFile: `${V}_kinktionary_new_terms_sourced.sql`,
      worktree: '/wt/kink-defs',
      oursIsNew: true,
    });
  });

  /**
   * The load-bearing exclusion. Every worktree carries all ~1,400 of main's
   * migrations, so treating an identical filename as a collision would bury the
   * real signal under a thousand false positives and the check would be turned
   * off within a day.
   */
  it('does NOT flag the same filename seen in another worktree', () => {
    expect(
      findSiblingCollisions(ours, allNew, [
        { worktree: '/wt/other', file: `${V}_news_commit_requires_a_verdict.sql` },
      ]),
    ).toEqual([]);
  });

  it('reports one hit per distinct sibling, for a four-way collision', () => {
    const hits = findSiblingCollisions(ours, allNew, [
      { worktree: '/wt/a', file: `${V}_tag_slug_seal.sql` },
      { worktree: '/wt/b', file: `${V}_event_tag_link_reads_approved_aliases.sql` },
      { worktree: '/wt/c', file: `${V}_kinktionary_new_terms_sourced.sql` },
    ]);
    expect(hits).toHaveLength(3);
    expect(new Set(hits.map((h: { worktree: string }) => h.worktree))).toEqual(
      new Set(['/wt/a', '/wt/b', '/wt/c']),
    );
  });

  /**
   * oursIsNew decides fatal-vs-warning in the caller. If our file is already on
   * the base ref, the sibling is the tree that has to move, and failing our push
   * for their unmerged branch blames the wrong one.
   */
  it('marks oursIsNew=false when our file is already on the base ref', () => {
    const hits = findSiblingCollisions(ours, noneNew, [
      { worktree: '/wt/a', file: `${V}_tag_slug_seal.sql` },
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0].oursIsNew).toBe(false);
  });

  it('ignores versions no sibling shares', () => {
    expect(
      findSiblingCollisions(ours, allNew, [
        { worktree: '/wt/a', file: '20261216114700_something_else.sql' },
      ]),
    ).toEqual([]);
  });

  it('ignores malformed filenames on either side', () => {
    expect(
      findSiblingCollisions(['not-a-migration.sql'], allNew, [
        { worktree: '/wt/a', file: `${V}_tag_slug_seal.sql` },
      ]),
    ).toEqual([]);
    expect(findSiblingCollisions(ours, allNew, [{ worktree: '/wt/a', file: 'README.md' }])).toEqual(
      [],
    );
  });

  it('does not duplicate a hit when the same sibling file is listed twice', () => {
    const dup = { worktree: '/wt/a', file: `${V}_tag_slug_seal.sql` };
    expect(findSiblingCollisions(ours, allNew, [dup, dup])).toHaveLength(1);
  });

  it('tolerates an absent sibling list', () => {
    expect(findSiblingCollisions(ours, allNew, null)).toEqual([]);
    expect(findSiblingCollisions(ours, allNew, undefined)).toEqual([]);
  });
});

/**
 * Reporting volume is a correctness property here, not cosmetics. The first
 * live run emitted 74 warnings — one per (hit, worktree) — almost all from
 * abandoned worktrees carrying a stale 2026-04 duplicate. A guard that prints a
 * wall of warnings is one people learn to scroll past, and then it protects
 * nothing.
 */
describe('groupSiblingCollisions', () => {
  const mk = (over: Record<string, unknown> = {}) => ({
    version: V,
    file: `${V}_ours.sql`,
    siblingFile: `${V}_theirs.sql`,
    worktree: '/wt/a',
    oursIsNew: true,
    ...over,
  });

  it('collapses one collision seen in many worktrees into a single entry', () => {
    const { blocking } = groupSiblingCollisions([
      mk({ worktree: '/wt/a' }),
      mk({ worktree: '/wt/b' }),
      mk({ worktree: '/wt/c' }),
    ]);
    expect(blocking).toHaveLength(1);
    expect(blocking[0].worktrees).toEqual(['/wt/a', '/wt/b', '/wt/c']);
  });

  it('keeps distinct sibling files as separate blocking entries', () => {
    const { blocking } = groupSiblingCollisions([
      mk({ siblingFile: `${V}_one.sql` }),
      mk({ siblingFile: `${V}_two.sql` }),
    ]);
    expect(blocking).toHaveLength(2);
  });

  it('routes not-ours hits to the advisory summary, never to blocking', () => {
    const { blocking, advisory } = groupSiblingCollisions([
      mk({ oursIsNew: false, worktree: '/wt/a' }),
      mk({ oursIsNew: false, worktree: '/wt/b' }),
      mk({ oursIsNew: false, version: '20260420180000' }),
    ]);
    expect(blocking).toEqual([]);
    expect(advisory.count).toBe(3);
    expect(advisory.versions).toEqual(['20260420180000', V]);
  });

  it('separates the two cases when both are present', () => {
    const { blocking, advisory } = groupSiblingCollisions([
      mk({ oursIsNew: true }),
      mk({ oursIsNew: false, version: '20260420180000' }),
    ]);
    expect(blocking).toHaveLength(1);
    expect(advisory.count).toBe(1);
  });

  it('does not repeat a worktree listed twice for the same collision', () => {
    const { blocking } = groupSiblingCollisions([mk(), mk()]);
    expect(blocking[0].worktrees).toEqual(['/wt/a']);
  });

  it('tolerates empty input', () => {
    expect(groupSiblingCollisions([])).toEqual({
      blocking: [],
      advisory: { count: 0, versions: [] },
    });
    expect(groupSiblingCollisions(null)).toEqual({
      blocking: [],
      advisory: { count: 0, versions: [] },
    });
  });
});
