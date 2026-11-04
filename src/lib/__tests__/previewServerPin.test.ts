import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The a11y workflow serves `dist` on :4173. It once fetched its static server
 * from the npm registry at job runtime (`npx -y serve@14`) inside a 30-second
 * readiness budget with no retry, so a slow registry failed the job before a
 * single test ran.
 *
 * The server is now `vite preview` (the same one e2e-pr.yml uses). It replaced
 * the `serve` devDependency, whose serve-handler pins a vulnerable minimatch 3
 * with no patched release. The two jobs that run `npm install` use
 * `./node_modules/.bin/vite`, which cannot touch the network. The lighthouse
 * job deliberately does not run `npm install` (a full install across 13
 * matrix routes), so it installs vite globally — at the SAME version the
 * lockfile resolves, so all three jobs serve the build identically.
 *
 * That second copy of the version is the drift this test exists to prevent.
 */

const ROOT = process.cwd();
const WORKFLOW = join(ROOT, '.github', 'workflows', 'a11y.yml');

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
const workflow = readFileSync(WORKFLOW, 'utf8');

/**
 * Comment lines stripped. The workflow documents the old `npx -y serve@14`
 * and the `serve` devDependency in comments explaining why they were removed;
 * assertions about what the workflow RUNS must read only what it runs.
 */
const commands = workflow
  .split('\n')
  .filter((l) => !/^\s*#/.test(l))
  .join('\n');

describe('the a11y preview server is pinned, not fetched at job runtime', () => {
  const locked: string | undefined = lock.packages?.['node_modules/vite']?.version;

  it('vite is a devDependency with an exact version in the lockfile', () => {
    expect(pkg.devDependencies?.vite, 'vite must be in devDependencies').toBeDefined();
    expect(locked).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('serve is gone: no devDependency and no command runs it', () => {
    expect(pkg.devDependencies?.serve).toBeUndefined();
    expect(commands).not.toMatch(/\bserve\s+-s\s+dist/);
    expect(commands).not.toMatch(/\bserve@/);
  });

  it('is never fetched with npx -y, which is what made the job flaky', () => {
    expect(commands).not.toMatch(/npx\s+-y\s+(serve|vite)/);
  });

  it('runs vite preview from node_modules in every job that installs dependencies', () => {
    const local = [...commands.matchAll(/\.\/node_modules\/\.bin\/vite\s+preview\s+--port\s+4173\b/g)];
    expect(local.length, 'expected the two npm-installing jobs to use the local binary').toBe(2);
  });

  it('pins the global vite install to the version the lockfile resolves', () => {
    // The lighthouse matrix cannot use the devDependency; it must not drift.
    const globals = [...commands.matchAll(/npm\s+i\s+-g[^\n]*\bvite@([^\s]+)/g)].map((m) => m[1]);
    expect(globals.length, 'expected exactly one global vite install').toBe(1);
    expect(globals[0], `global vite@${globals[0]} != lockfile ${locked}`).toBe(locked);
    expect(commands).toMatch(/\bvite\s+preview\s+-c\s+"\$RUNNER_TEMP\/preview\.config\.mjs"[^\n]*--port\s+4173/);
  });
});
