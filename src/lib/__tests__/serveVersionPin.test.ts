import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The a11y workflow serves `dist` with `serve`, and it used to fetch that
 * package from the npm registry at job runtime — `npx -y serve@14`, inside a
 * 30-second readiness budget with no retry. A slow registry therefore failed
 * the job with "serve did not become ready" before a single test executed, on
 * PRs that had nothing to do with the frontend.
 *
 * `serve` is now a pinned devDependency and the two jobs that already run
 * `npm install` use `./node_modules/.bin/serve`, which cannot touch the
 * network. The lighthouse job deliberately does not run `npm install` (it
 * would cost a full install across 13 matrix routes) so it still installs
 * globally — but at the SAME pinned version, so all three jobs serve the build
 * identically.
 *
 * That second copy of the version is the drift this test exists to prevent.
 */

const ROOT = process.cwd();
const WORKFLOW = join(ROOT, '.github', 'workflows', 'a11y.yml');

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const workflow = readFileSync(WORKFLOW, 'utf8');

/**
 * Comment lines stripped. The workflow deliberately DOCUMENTS the old
 * `npx -y serve@14` in a comment explaining why it was removed, and a naive
 * scan matches that prose and fails — which is what happened when this test
 * was first written. Assertions about what the workflow RUNS must read only
 * what it runs.
 */
const commands = workflow
  .split('\n')
  .filter((l) => !/^\s*#/.test(l))
  .join('\n');

describe('serve is pinned, not fetched at job runtime', () => {
  const pinned = pkg.devDependencies?.serve;

  it('is an exact devDependency, not a range', () => {
    expect(pinned, 'serve must be in devDependencies').toBeDefined();
    // A range would let the global install and the local one diverge.
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('is never fetched with npx -y, which is what made the job flaky', () => {
    expect(commands).not.toMatch(/npx\s+-y\s+serve/);
  });

  it('runs from node_modules in every job that installs dependencies', () => {
    const local = [...commands.matchAll(/\.\/node_modules\/\.bin\/serve\s+-s\s+dist/g)];
    expect(local.length, 'expected the two npm-installing jobs to use the local binary').toBe(2);
  });

  it('pins the global install to the same version as package.json', () => {
    // The lighthouse matrix cannot use the devDependency; it must not drift.
    const globals = [...commands.matchAll(/npm\s+i\s+-g[^\n]*\bserve@([^\s]+)/g)].map((m) => m[1]);
    expect(globals.length, 'expected exactly one global serve install').toBe(1);
    expect(globals[0], `global serve@${globals[0]} != package.json ${pinned}`).toBe(pinned);
  });
});
